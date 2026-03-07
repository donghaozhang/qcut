# QAgent End-to-End Test Guide

Reusable checklist for testing the full qagent orchestration workflow: issue creation, agent spawn, autonomous work, CI, bot review handling, and merge readiness.

## Prerequisites

```bash
# Verify tools
gh --version          # GitHub CLI
linear --version      # Linear CLI
tmux -V               # tmux
claude --version      # Claude Code CLI

# Verify qagent is built (rebuild after any qagent code changes)
cd packages/qagent
bun run build         # If web fails, build individually:
# npx tsc -p packages/core/tsconfig.json --outDir packages/core/dist --declaration --skipLibCheck
# npx tsc -p packages/plugins/agent-claude-code/tsconfig.json --outDir packages/plugins/agent-claude-code/dist --declaration --skipLibCheck
# npx tsc -p packages/cli/tsconfig.json --outDir packages/cli/dist --declaration --skipLibCheck

# Verify CLI works
node packages/qagent/packages/cli/dist/index.js --version
```

Shorthand used below:
```bash
QAGENT="node packages/qagent/packages/cli/dist/index.js"
```

## Phase 1: Setup

### 1.1 Clean stale sessions

```bash
$QAGENT session ls
$QAGENT session cleanup qcut    # kills sessions where PR is merged or issue closed
```

### 1.2 Create GitHub issue

```bash
gh issue create \
  --title "<title>" \
  --body "<body with acceptance criteria>" \
  --label "Improvement"
```

Record: `ISSUE=<number>`

### 1.3 Create Linear issue (optional)

```bash
linear issue create \
  --title "<same title>" \
  --description "<description>. GitHub: #<ISSUE>" \
  --team QUR
```

Record: `LINEAR=<QUR-XX>`

## Phase 2: Spawn Agent

### 2.1 Start lifecycle daemon

**Critical**: Without the lifecycle daemon, bot review comments will never be forwarded to the agent after it exits.

The daemon is at `packages/qagent/packages/cli/src/lifecycle-daemon.ts`. It polls all sessions, detects state transitions, and triggers reactions (CI fix, review forwarding, merge notification).

```bash
# Start in a separate terminal (or background)
QAGENT_CONFIG="$(pwd)/qagent.yaml" node packages/qagent/packages/cli/dist/lifecycle-daemon.js &
DAEMON_PID=$!
echo "Lifecycle daemon PID: $DAEMON_PID"
```

Verify it started:
```bash
cat ~/.qagent/lifecycle-*.pid
```

> **Known gap (2026-03-08)**: `qagent spawn` does NOT auto-start the daemon, despite the comment in `lifecycle-daemon.ts:5`. You must start it manually. See [Improvements](#improvements) below.

### 2.2 Spawn the agent session

```bash
$QAGENT spawn qcut <ISSUE>
```

Record output:
```
SESSION=<session-name>
TMUX=<tmux-session-name>
BRANCH=<branch-name>
WORKTREE=<worktree-path>
```

### 2.3 Verify agent is alive

```bash
# Check tmux session exists
tmux list-sessions | grep qcut

# Check Claude Code process is running
ps -eo pid,args | grep "claude.*skip-permissions" | grep -v grep

# Check qagent status
$QAGENT status
```

Expected: session shows with activity `active` or `idle`, not `exited`.

## Phase 3: Monitor Progress

### 3.1 Watch agent work

```bash
# Check git changes in worktree (repeat periodically)
cd <WORKTREE> && git diff --stat

# Check for commits
git log --oneline -5

# Check if PR was created
gh pr list --head "<BRANCH>"
```

### 3.2 Wait for PR + CI

Once the agent creates a PR:

```bash
# Get PR number
PR=$(gh pr list --head "<BRANCH>" --json number --jq '.[0].number')

# Watch CI checks
gh pr checks $PR --json name,state

# Full PR details
gh pr view $PR --json title,body,additions,deletions,changedFiles,statusCheckRollup
```

### 3.3 Monitor bot reviews

CodeRabbit and Gemini Code Assist submit reviews as `COMMENTED` (not `CHANGES_REQUESTED`). Check:

```bash
# Review states
gh api repos/Quriosity-agent/qcut/pulls/$PR/reviews --jq '.[] | {user: .user.login, state: .state}'

# Inline comments
gh api repos/Quriosity-agent/qcut/pulls/$PR/comments --jq '.[] | "[\(.path):\(.line)] \(.body[0:120])"'
```

### 3.4 Check qagent status throughout

```bash
$QAGENT status
```

Key columns:
- **CI**: `pend` (running), `pass`, `fail`
- **Rev**: review state
- **Thr**: thread/comment count
- **Activity**: `active`, `idle`, `exited`

## Phase 4: Bot Review Loop (Lifecycle Daemon)

This is the critical test. After the agent exits with CI green, the lifecycle daemon should:

### Expected flow

```
Agent exits (CI green)
    |
    v
Lifecycle daemon polls: status = "review_pending" or "pr_open"
    |
    v
checkBotComments() detects CodeRabbit/Gemini comments
    |
    v
Settle timer: 2 min (BOT_COMMENT_SETTLE_MS)
    |
    v
Fire "bugbot-comments" reaction (action: "send-structured-review")
    |
    v
forward-to-agent.sh exports structured review comments
    |
    v
sessionManager.sendOrRestart() -> agent is dead -> re-launch in same tmux session
    |
    v
New agent addresses comments, pushes, CI re-runs
    |
    v
BUILD_CHECK_DELAY_MS (3 min): no new comments -> send /buildit to agent
    |
    v
CI_POLL_DELAY_MS (3 min): CI green -> notify "ready to merge"
```

### Verify the loop

```bash
# After agent exits, wait ~3 minutes, then check:

# 1. Is the agent alive again? (lifecycle daemon should have restarted it)
ps -eo pid,args | grep "claude.*skip-permissions" | grep -v grep

# 2. Check tmux for new activity
tmux capture-pane -t <TMUX> -p -S -30

# 3. Check for new commits addressing reviews
cd <WORKTREE> && git log --oneline -5

# 4. Check qagent status — should show activity != exited
$QAGENT status
```

### Known issue: send vs sendOrRestart

`lifecycle-reactions.ts:286` uses `sessionManager.send()` instead of `sessionManager.sendOrRestart()` for the `send-structured-review` action. If the agent has exited, `send()` just writes to tmux with no process listening.

**Workaround**: Manually restart the agent with review feedback:
```bash
$QAGENT send <SESSION> "Check PR review comments with gh api and address them"
```

Or use the `pr-comments forward` command:
```bash
$QAGENT pr-comments forward <SESSION>
```

## Phase 5: Verify Results

### 5.1 CI final state

```bash
gh pr checks $PR --json name,state
# All should be SUCCESS
```

### 5.2 Review comments resolved

```bash
# Check if review threads are addressed
gh api repos/Quriosity-agent/qcut/pulls/$PR/comments --jq 'length'
```

### 5.3 PR ready to merge

```bash
gh pr view $PR --json mergeable,mergeStateStatus
```

## Phase 6: Cleanup

```bash
# Stop lifecycle daemon
kill $DAEMON_PID

# Clean up session (optional — keeps worktree for inspection)
$QAGENT session kill <SESSION>

# Or full cleanup
$QAGENT session cleanup qcut
```

## Recording Results

After each test run, create a report at `docs/task/qagent-e2e-test-<date>.md` with:

| Section | What to record |
|---------|----------------|
| Timeline | Each step with timestamp and pass/fail |
| GitHub/Linear links | Issue, PR, Linear issue URLs |
| Agent quality | Files changed, quality of changes, scope accuracy |
| CI results | Which checks passed/failed, time to green |
| Bot review handling | Were comments detected? Forwarded? Addressed? |
| Failures | Root cause, which component failed |
| Improvements | Actionable fixes with file paths |

## Architecture Reference

### State machine (lifecycle-manager.ts:132-273)

```
spawning -> working -> pr_open -> review_pending -> mergeable -> merged
                         |             |
                         v             v
                     ci_failed   changes_requested
                         |             |
                         v             v
                   (send-to-agent) (send-structured-review)
                         |             |
                         v             v
                     working ------> pr_open (loop)
```

### Key files

| File | Role |
|------|------|
| `core/src/lifecycle-manager.ts` | Poll loop, status inference, reaction dispatch |
| `core/src/lifecycle-bot-comments.ts` | Bot comment settle detection, build-check, merge flow |
| `core/src/lifecycle-reactions.ts` | Reaction execution (send-to-agent, send-structured-review, notify) |
| `core/src/session-manager-maintenance.ts` | `sendOrRestart()` — re-launches dead agents |
| `plugins/agent-claude-code/src/process.ts` | `findClaudeProcess()` via cached `ps` |
| `plugins/scm-github/src/index.ts` | `getAutomatedComments()`, `getReviewDecision()`, `getCISummary()` |
| `cli/src/lifecycle-daemon.ts` | Background daemon that runs the lifecycle manager |
| `cli/src/commands/spawn.ts` | Session creation (does NOT start daemon) |
| `scripts/pr-comments/forward-to-agent.sh` | Exports PR comments as structured markdown |

### Config (qagent.yaml reactions)

```yaml
reactions:
  ci-failed:        { auto: true, action: send-to-agent, retries: 2 }
  changes-requested: { auto: true, action: send-structured-review }
  bugbot-comments:  { auto: true, action: send-structured-review }  # bot reviews
  approved-and-green: { auto: false, action: notify }
```

### Timing constants (lifecycle-bot-comments.ts)

| Constant | Value | Purpose |
|----------|-------|---------|
| `BOT_COMMENT_SETTLE_MS` | 2 min | Wait for bot reviews to stop arriving |
| `BUILD_CHECK_DELAY_MS` | 3 min | After review fix, wait before checking build |
| `CI_POLL_DELAY_MS` | 3 min | After build check sent, wait before polling CI |

## Improvements

Tracked bugs and gaps found during testing:

### Bug: `send-structured-review` uses `send()` not `sendOrRestart()`

**File**: `packages/qagent/packages/core/src/lifecycle-reactions.ts:286`
**Impact**: Bot review reaction cannot restart a dead agent
**Fix**: Change `sessionManager.send()` to `sessionManager.sendOrRestart()`

### Gap: `qagent spawn` does not auto-start lifecycle daemon

**File**: `packages/qagent/packages/cli/src/commands/spawn.ts`
**Impact**: No automated reaction loop unless user manually starts daemon
**Fix**: Check PID file, fork `lifecycle-daemon.ts` if not running

### Gap: `qagent start` is for the orchestrator agent, not the daemon

`qagent start` spawns a Claude Code orchestrator session (separate from the lifecycle daemon polling loop). These are two different things:
- **Lifecycle daemon** (`lifecycle-daemon.ts`): Node.js process, runs `createLifecycleManager().start()`, polls every 30s
- **Orchestrator agent** (`qagent start`): Claude Code session with orchestrator prompt, interactive

For e2e testing you need the **lifecycle daemon**, not `qagent start`.
