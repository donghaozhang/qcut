# QAgent E2E Test Report — Run 3 (with agent-exit gate fix)

## Test Context

**Date**: 2026-03-08
**Task**: "Improve accessibility: add missing ARIA labels and fix focus indicators" (issue #228)
**Fix applied**: `lifecycle-bot-comments.ts` — gate `bugbot-comments` reaction and build-check on `session.activity === "exited"`
**Lifecycle daemon**: Running (PID 35396, then restarted as 83030)

## Timeline

| Time | Event | Status |
|------|-------|--------|
| T+0s | Create GitHub issue #228 | PASS |
| T+5s | Clean stale sessions (killed `qcut-fix-toast-close-button-contras`, `qcut-orchestrator`) | PASS |
| T+10s | Start lifecycle daemon (PID 35396) | PASS |
| T+15s | `qagent spawn qcut 228` → session `qcut-improve-accessibility-add-miss` | PASS |
| T+2min | Agent reading codebase, no changes yet | PASS |
| T+5min | Agent modifying `timeline-toolbar.tsx` (34 add, 23 del) | PASS |
| T+8min | Agent modifying 11 files (92 add, 57 del), still working | PASS |
| T+~10min | Agent commits `f0d2d5ed`, pushes, creates PR #229 (15 files, 177 add, 74 del) | PASS |
| T+~11min | CI starts: ubuntu, windows, macos builds + GitGuardian + CodeRabbit | PASS |
| T+~12min | Gemini Code Assist submits `COMMENTED` review (1 inline: add `aria-pressed` to bookmark toggle) | PASS |
| T+~12min | CodeRabbit submits `COMMENTED` review (no inline actionable comments) | PASS |
| T+16min | CI: ubuntu + macos pass, windows pending, CodeRabbit pass | PASS |
| T+19min | All CI checks pass (7/7) | PASS |
| T+21min | First agent exits | PASS |
| T+~21min | Lifecycle daemon fires `bugbot-comments` reaction (settle + agent exited gate) | **PASS** |
| T+~21min | New agent re-launched via `sendOrRestart()`, addresses Gemini comment | **PASS** |
| T+~21min | Commit `e22a1d48 fix: add aria-pressed to bookmark toggle`, pushed | **PASS** |
| T+~21min | Agent replies to Gemini comment on GitHub | PASS |
| T+~21min | Review-fix agent exits | PASS |
| T+~22min | Lifecycle daemon dies (auto-exit: no active sessions for 5min) | **ISSUE** |
| T+~22min | Daemon restarted manually (PID 83030) | PASS |
| T+~23min | Daemon fires reaction again (new comments detected from CodeRabbit re-review) | NOTE |
| T+~23min | Agent replies to comments again (duplicate replies) | MINOR |
| T+27min | CI on review-fix commit: ubuntu + macos pass, windows pending | PASS |
| T+32min | All CI checks pass (7/7) on final commit | **PASS** |
| T+32min | PR #229: MERGEABLE, 15 files, 178 add, 74 del, 2 clean commits | **PASS** |

## Results

### What Worked — P0 Fix Verified

1. **Agent exit gate works**: The `bugbot-comments` reaction correctly waited for the first agent to exit before firing. In run 2, it fired while the agent was alive and the review was lost. In run 3, it fired after exit and `sendOrRestart()` did a clean re-launch.

2. **Review comment addressed**: The re-launched agent correctly:
   - Read the structured review (Gemini's `aria-pressed` suggestion)
   - Modified `timeline-toolbar.tsx` to add `aria-pressed={currentBookmarked}`
   - Committed with clear message (`fix: add aria-pressed to bookmark toggle button for accessibility`)
   - Pushed the fix
   - Replied to the review comment on GitHub via `gh api`

3. **Full lifecycle loop completed**:
   ```
   Issue #228 created
       → Agent spawned in worktree
       → 15 files modified (ARIA labels, focus indicators)
       → PR #229 created
       → CI green (7/7 checks)
       → First agent exits
       → Daemon detects bot comments + agent exited → fires reaction
       → New agent re-launched with structured review
       → Agent fixes review comment, pushes, replies on GitHub
       → CI green again on review-fix commit
       → PR ready to merge
   ```

4. **Agent quality**: Comprehensive accessibility improvements across 15 files — ARIA labels on 50+ buttons, proper roles, focus indicators. Clean 2-commit history.

5. **CI fully green**: All 7 checks pass on both commits (ubuntu, windows, macos, codecov, GitGuardian, CodeRabbit, claude skipped).

### What Partially Failed

#### Lifecycle daemon auto-exits too aggressively

**Impact**: Daemon died at T+22min because the review-fix agent exited quickly and the daemon's "no active sessions for 5min" check triggered. The build-check step and CI poll/merge notification never ran.

**Root cause**: `lifecycle-daemon.ts` auto-exits when no active sessions remain for 5 minutes. But after the review-fix agent exits, the session is still open (PR not merged) — it just has `activity: "exited"`. The daemon considers this "no active sessions" and shuts down.

**Workaround**: Manually restarted daemon. It picked up and continued the loop.

**Fix needed**: The daemon should check for sessions with open PRs, not just agent activity. A session with `status !== "merged"` and `status !== "killed"` should count as "active" for the auto-exit timer.

#### Duplicate review replies

**Impact**: The agent replied to the same Gemini comment 3 times. This happened because the daemon was restarted and fired the `bugbot-comments` reaction again (new CodeRabbit re-review comments arrived after the fix push, resetting the settle timer).

**Root cause**: The `reactionFired` state is in-memory only (`botCommentStates` Map). When the daemon restarts, the state is lost. The new daemon instance sees settled comments and fires the reaction again.

**Fix needed**: Persist `botCommentStates` to metadata file, or track which comments have been forwarded by their IDs.

## Architecture Flow (Verified)

```
Agent exits (CI green)
    ↓
Lifecycle daemon polls (30s interval)
    ↓
checkBotComments(): comments settled (2min) + session.activity === "exited" ← NEW GATE
    ↓
Fire "bugbot-comments" reaction → send-structured-review
    ↓
forward-to-agent.sh exports structured review as markdown
    ↓
sendOrRestart() → agent dead → clean re-launch in same tmux session
    ↓
New agent addresses comments, commits, pushes, replies on GitHub
    ↓
New agent exits
    ↓
[Build-check step should fire here, but daemon auto-exited]
```

## Comparison: Run 2 vs Run 3

| Metric | Run 2 | Run 3 |
|--------|-------|-------|
| Bot comments detected | Yes | Yes |
| Reaction timing | Fired while agent alive | Fired after agent exited |
| Review forwarded | Lost (tmux send-keys into TUI) | **Received** (clean re-launch) |
| Review addressed | No | **Yes** (commit `e22a1d48`) |
| Reply on GitHub | No | **Yes** |
| CI on review fix | N/A | All 7 pass |
| Build-check step | Fired (but no review to build on) | Daemon died before firing |

## Artifacts

| Artifact | Value |
|----------|-------|
| GitHub Issue | #228 |
| PR | #229 |
| Branch | `feat/228-improve-accessibility-add-missing-aria-l` |
| Worktree | `~/.worktrees/qcut/qcut-improve-accessibility-add-miss` |
| Session | `qcut-improve-accessibility-add-miss` |
| Tmux | `82eee0466ae2-qcut-1` |
| Daemon PID | 35396 (died), 83030 (restarted, also died) |
| Commit 1 | `f0d2d5ed` feat: improve accessibility with ARIA labels and focus indicators |
| Commit 2 | `e22a1d48` fix: add aria-pressed to bookmark toggle button for accessibility |

## Improvements

### P0 (Fixed in this run): Agent exit gate

**File**: `packages/qagent/packages/core/src/lifecycle-bot-comments.ts`
**Status**: VERIFIED WORKING

Two guards added:
1. Line 298: Only fire `bugbot-comments` reaction when `session.activity === "exited"`
2. Line 177: Only send build-check when `session.activity === "exited"`

### P1: Daemon auto-exit is too aggressive

**File**: `packages/qagent/packages/cli/src/lifecycle-daemon.ts`
**Impact**: Daemon exits while sessions still have open PRs, breaking the build-check and merge notification flow.
**Fix**: Count sessions with `status !== "merged" && status !== "killed"` as active for the auto-exit timer, not just sessions with a running agent process.

### P2: Bot comment state lost on daemon restart

**File**: `packages/qagent/packages/core/src/lifecycle-bot-comments.ts`
**Impact**: Restarted daemon re-fires reactions, causing duplicate review replies.
**Fix options**:
1. Persist `reactionFired` + `reactionFiredAt` to session metadata
2. Track forwarded comment IDs so the same comments aren't forwarded twice
3. Check if the agent already replied to comments before forwarding

### P3: Duplicate GitHub comment replies

**Impact**: Agent replied 3 times to the same review comment. Looks unprofessional.
**Root cause**: Combination of P2 (state loss) + daemon restart + new comments from CodeRabbit re-review.
**Fix**: Before replying to a comment, check if the bot account already has a reply using `gh api`.

### P4: BUILD_CHECK_DELAY_MS timer should reset on agent restart

**File**: `packages/qagent/packages/core/src/lifecycle-bot-comments.ts`
**Impact**: The build-check delay counts from when the reaction fired, not from when the review-fix agent started. If the daemon restarts or the agent takes longer, the timing is off.
**Fix**: Reset `reactionFiredAt` when the agent is restarted, or use `session.metadata.restartedAt` as the base time.

## Conclusion

**The P0 fix works.** The agent exit gate in `lifecycle-bot-comments.ts` correctly prevents the reaction from firing while the Claude TUI is alive, ensuring reviews are forwarded via a clean re-launch. The full lifecycle loop — spawn → work → PR → CI → bot review → re-launch → fix review → push — completed successfully for the first time.

Remaining issues are around daemon persistence (P1: auto-exit, P2: state loss) rather than the core reaction logic. Total time: ~32 minutes from issue creation to CI-green PR with all review comments addressed.
