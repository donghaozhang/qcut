# QAgent E2E Test Report — Run 2 (with lifecycle daemon)

## Test Context

**Date**: 2026-03-08
**Task**: "Fix toast close button contrast and Tailwind syntax errors" (issue #226)
**Bug fix applied**: `send-structured-review` now uses `sendOrRestart()` instead of `send()`
**Lifecycle daemon**: Running (PID 28669)

## Timeline

| Time | Event | Status |
|------|-------|--------|
| T+0s | Create GitHub issue #226 | PASS |
| T+5s | Clean stale sessions and tmux | PASS |
| T+10s | Start lifecycle daemon (PID 28669) | PASS |
| T+15s | `qagent spawn qcut 226` | PASS (after killing stale tmux `82eee0466ae2-qcut-1`) |
| T+~2min | Agent commits + pushes + creates PR #227 | PASS (1 file, 2 additions, 2 deletions) |
| T+~3min | CodeRabbit + Gemini reviews arrive | PASS (1 inline HIGH comment) |
| T+~8min | CI green (all 7 checks pass) | PASS |
| T+~8min | First agent exits | PASS |
| T+~10min | Daemon detects bot comments (settle 2min) | PASS |
| T+~10min | `bugbot-comments` reaction fires | **PARTIAL** (see below) |
| T+~13min | Build-check re-launch via `sendOrRestart()` | PASS |
| T+~13min | New agent confirms CI green, exits | PASS |
| T+~13min | `restartedAt` set in metadata | PASS |

## Results

### What Worked

1. **Lifecycle daemon ran correctly**: Started, polled sessions, detected bot comments, fired reactions, re-launched agent
2. **`sendOrRestart()` fix worked**: The build-check step successfully re-launched Claude Code in the same tmux session after the first agent exited
3. **Metadata updated**: `restartedAt=2026-03-07T13:33:52.231Z` recorded
4. **Agent quality**: Clean 1-file fix, proper commit message, PR auto-closes issue
5. **Full CI passed**: All 7 checks green on first try
6. **Build-check step**: Daemon correctly sent `/buildit` instructions after review loop "converged"

### What Partially Failed

#### Structured review comments not addressed

The `bugbot-comments` reaction fired (`send-structured-review`), but the review comments were NOT addressed by the agent. The build-check step then ran assuming reviews were already handled.

**Root cause**: Timing problem in the reaction pipeline.

```
T+3min: Bot comments arrive
T+5min: BOT_COMMENT_SETTLE_MS (2min) expires
T+5min: bugbot-comments reaction fires
T+5min: sendOrRestart() → agent is ALIVE → send() text to tmux
  └── Problem: text is typed into running Claude TUI, not a shell prompt
      The Claude process receives raw keystrokes, not a new prompt
T+8min: Agent exits normally (doesn't know about review comments)
T+8min: BUILD_CHECK_DELAY_MS (3min) starts counting from T+5min
T+8min: Already 3min since reaction → build-check fires immediately
T+8min: sendOrRestart() → agent is DEAD → re-launch with build-check prompt
  └── This works! New Claude session starts
T+8min: New agent checks CI → all green → exits
```

The review comments were never actually processed because:
1. The first `sendOrRestart()` found the agent alive and used tmux `send-keys`
2. `send-keys` types raw text into whatever is in the pane (the Claude TUI)
3. Claude Code TUI doesn't interpret raw tmux input as new instructions
4. The first agent exited without knowing about the reviews
5. The build-check step launched a new agent that only checked CI

## Design Issues Found

### Issue 1: Cannot send messages to a running Claude Code session via tmux

`send-keys` types text into the tmux pane, but Claude Code's TUI doesn't interpret it as a new task. The text gets mixed into the terminal input buffer.

**Options**:
1. **Wait for agent to exit before forwarding reviews**: Don't fire `bugbot-comments` while agent is `working` or `idle`. Only fire when agent activity is `exited`. This means adding `exited` detection to the bot comment check or changing `BOT_CHECK_STATUSES`.
2. **Use Claude Code's `/add-message` or similar API**: If Claude Code supports receiving messages programmatically (not via terminal input).
3. **Write review tasks to a file the agent polls**: Drop the structured review into the worktree (e.g., `.qagent/review-tasks.md`) and instruct agents to check for it before exiting.

### Issue 2: Build-check fires too soon when review wasn't processed

`BUILD_CHECK_DELAY_MS` counts from when the `bugbot-comments` reaction fired, not from when the agent actually started processing reviews. If the review was never processed (as in this case), the build-check still fires on schedule.

**Fix**: The build-check should only fire if a new commit was pushed after the review reaction. Track `lastCommitSha` at reaction time and compare before sending build-check.

### Issue 3: Tmux session name collision on respawn

`qagent spawn` failed with "duplicate session: 82eee0466ae2-qcut-1" because the previous test's tmux session was still alive. The spawn command should handle this (kill stale tmux if session metadata says `killed`).

## Artifacts

| Artifact | Value |
|----------|-------|
| GitHub Issue | #226 |
| PR | #227 |
| Session | qcut-fix-toast-close-button-contras |
| Daemon PID | 28669 (stopped) |
| Tmux | 82eee0466ae2-qcut-1 |
| RestartedAt | 2026-03-07T13:33:52.231Z |

## Recommended Fix Priority

### P0: Fire bugbot-comments reaction only after agent exits

Change `lifecycle-bot-comments.ts` to only process bot comments when the agent has exited. The simplest fix:

```typescript
// In checkBotComments(), after checking BOT_CHECK_STATUSES:
// Also check that the agent process has exited
if (session.activity !== "exited") {
    return; // Agent is still working — it may address comments itself
}
```

This way the review loop only starts after the agent finishes its initial work and exits. Then `sendOrRestart()` will always find the agent dead and do a clean re-launch.

### P1: Track commit SHA to gate build-check

Only send the build-check if a new commit appeared after the review reaction:

```typescript
// When firing bugbot-comments reaction, record current HEAD
prev.commitAtReaction = await getHeadSha(session);

// Before sending build-check, verify new commit exists
const currentSha = await getHeadSha(session);
if (currentSha === prev.commitAtReaction) {
    // Agent didn't push anything — re-fire review reaction instead
    prev.reactionFired = false;
    return;
}
```

### P2: Auto-start lifecycle daemon from spawn

Add daemon fork to `spawn.ts` if PID file doesn't exist or PID is dead.

### P3: Handle tmux name collisions gracefully

In the runtime-tmux plugin, kill stale sessions before creating new ones if metadata indicates `killed` state.
