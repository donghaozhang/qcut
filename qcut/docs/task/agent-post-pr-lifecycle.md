# Agent Post-PR Lifecycle — Automatic CI Watch & Review Handling

**Status:** Implemented
**Date:** 2026-03-07
**Priority:** High — without this, agents are fire-and-forget after PR creation

---

## Problem

When `qagent spawn qcut <issue>` runs:

1. Agent spawns in tmux, implements code, creates PR
2. Agent (Claude Code) **exits immediately** after PR creation
3. Nobody watches CI status or review comments
4. If CI fails or reviewer requests changes, the PR sits unattended

The infrastructure for lifecycle management exists (`lifecycle-manager.ts`, reactions, `send-to-agent`) but two critical gaps prevent it from working:

- **Gap A**: The agent exits after PR — `send-to-agent` types into a dead shell
- **Gap B**: No lifecycle daemon is running to detect CI failures / reviews

## Architecture After Fix

```
qagent spawn qcut 212
     │
     ├── Creates worktree, tmux session, launches Claude Code
     │
     ▼
Agent implements code → pushes → creates PR
     │
     ├── Agent polls CI with `gh pr checks` (Step 1)
     │   └── CI fails? → agent fixes inline
     │   └── CI passes? → agent exits cleanly
     │
     ▼
Agent exits → tmux session at shell prompt
     │
     ├── Lifecycle daemon detects session state (Step 3)
     │   └── Polls PR: CI status, review decision, merge state
     │
     ▼
CI fails later / Review comments arrive
     │
     ├── Lifecycle reaction: `send-to-agent` (Step 2)
     │   └── Detects agent is dead → re-launches Claude Code
     │   └── New prompt: "CI failed on PR #214, fix it"
     │
     ▼
Agent fixes → pushes → lifecycle re-polls → repeat until merged
```

---

## Step 1: Agent Waits for CI Before Exiting

### What

Add CI polling instructions to the Symphony workflow so the agent checks CI status before exiting. The agent should:

1. After creating PR, poll `gh pr checks <number>` every 30s
2. If checks fail, read the failure logs and fix the code
3. If checks pass, exit cleanly
4. Timeout after 10 minutes of polling (CI may be slow)

### Where

**File:** `.claude/skills/qagent/symphony-ref/workflow.md`

Add a new section after PR creation in the workflow steps:

```markdown
## Post-PR CI Watch

After creating the PR:
1. Run `gh pr checks <PR-number> --watch --fail-fast` to wait for CI
2. If any check fails:
   - Read the failure logs: `gh run view <run-id> --log-failed`
   - Fix the code, commit, and push
   - Re-run CI watch
3. If all checks pass, proceed to PR feedback sweep
4. If CI takes longer than 10 minutes, exit and let the lifecycle manager handle it
```

### Why This Works

Claude Code will follow prompt instructions to poll CI before considering the task done. This catches immediate CI failures (lint, types, tests) inline without needing the lifecycle manager.

### Limitations

- Only works for the first CI run — if CI fails after agent exits, need Step 2
- Claude Code may still exit early if it misinterprets "done"
- Long CI pipelines (>10 min) will timeout

---

## Step 2: Re-launch Dead Agents on Reaction

### What

When the lifecycle manager's `send-to-agent` reaction fires but the agent process is dead (Claude Code exited), re-launch Claude Code in the existing tmux session with a focused prompt.

### Where

**File:** `packages/qagent/packages/core/src/lifecycle-reactions.ts`

The `send-to-agent` case at line 217 currently does:

```typescript
await sessionManager.send(sessionId, reactionConfig.message);
```

This calls `runtime.sendMessage()` which types into the tmux pane — but if Claude Code has exited, it types into the shell prompt (useless).

### Changes

1. **Check if agent is alive** before sending
2. **If dead, re-launch** Claude Code with a new prompt via `sessionManager.restore()`
3. **If alive, send message** as before

**File:** `packages/qagent/packages/core/src/session-manager-maintenance.ts`

Add a `restartAgent` function:

```typescript
export async function restartAgent({
  context,
  sessionId,
  message,
}: {
  context: SessionManagerContext;
  sessionId: SessionId;
  message: string;
}): Promise<void> {
  // 1. Find the session and its runtime handle
  // 2. Check if agent process is alive via agent.isProcessRunning()
  // 3. If alive: send message via runtime.sendMessage()
  // 4. If dead: re-launch Claude Code in the same tmux session
  //    - Use agent.getLaunchCommand() with the new message as prompt
  //    - Send the launch command via runtime.sendMessage()
}
```

**File:** `packages/qagent/packages/core/src/types/service-types.ts`

Add to `SessionManager` interface:

```typescript
/** Send message to agent, re-launching if agent process has exited */
sendOrRestart(sessionId: SessionId, message: string): Promise<void>;
```

### Safety

- Only re-launch once per reaction cycle (prevent infinite restart loops)
- Track restart count in session metadata — escalate to human after N restarts
- The re-launched agent gets a focused prompt (not the full original), reducing token waste

---

## Step 3: Auto-Start Lifecycle Daemon on First Spawn

### What

When `qagent spawn` creates a session, automatically start the lifecycle manager in the background if it's not already running. This eliminates the need to manually run `ao start`.

### Where

**File:** `packages/qagent/packages/core/src/session-manager-spawn.ts`

After successfully spawning a session, check if a lifecycle daemon is running. If not, start one.

### Design Options

**Option A: In-process lifecycle thread (recommended)**

Start the lifecycle manager in the same process as the CLI. Since `qagent spawn` exits after spawning, this doesn't work — the lifecycle manager would die with the process.

**Option B: Detached background process**

Spawn a lightweight Node.js process that runs the lifecycle manager:

```typescript
// After successful spawn in session-manager-spawn.ts
import { spawn } from "node:child_process";

function ensureLifecycleDaemon(config: OrchestratorConfig): void {
  const pidFile = join(config.dataDir, "lifecycle.pid");

  // Check if daemon is already running
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, "utf-8"));
    try { process.kill(pid, 0); return; } // alive
    catch { /* dead, restart */ }
  }

  // Start daemon
  const child = spawn("node", [LIFECYCLE_DAEMON_SCRIPT], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, QAGENT_CONFIG: config.configPath },
  });
  child.unref();
  writeFileSync(pidFile, String(child.pid));
}
```

**Option C: Lifecycle in tmux session**

Start a tmux session that runs the lifecycle daemon — same pattern as agent sessions. This is visible and debuggable.

### Recommended: Option B

A detached background process is invisible, automatic, and stops when all sessions are terminal. It writes a PID file for idempotency.

**New file:** `packages/qagent/packages/core/src/lifecycle-daemon.ts`

```typescript
// Standalone lifecycle daemon entry point
// Started by spawn, runs until all sessions are terminal
// Polls sessions, detects CI/review state, triggers reactions
// Auto-exits after 30 minutes of no active sessions

const config = loadConfig();
const registry = createPluginRegistry();
await registry.loadFromConfig(config);
const sessionManager = createSessionManager({ config, registry });
const lm = createLifecycleManager({ config, registry, sessionManager });
lm.start();

// Auto-shutdown when no active sessions remain
setInterval(async () => {
  const sessions = await sessionManager.list();
  const active = sessions.filter(s => !TERMINAL.has(s.status));
  if (active.length === 0) {
    lm.stop();
    process.exit(0);
  }
}, 60_000);
```

---

## Implementation Order

1. **Step 1** (prompt change) — zero code risk, immediate value
2. **Step 2** (re-launch dead agents) — core infrastructure, enables self-healing
3. **Step 3** (auto-start daemon) — completes the automation, eliminates manual `ao start`

## Files Changed

| Step | File | Change |
|------|------|--------|
| 1 | `.claude/skills/qagent/symphony-ref/workflow.md` | Add CI watch section |
| 2 | `packages/qagent/packages/core/src/lifecycle-reactions.ts` | Check agent liveness before send |
| 2 | `packages/qagent/packages/core/src/session-manager-maintenance.ts` | Add `restartAgent()` |
| 2 | `packages/qagent/packages/core/src/session-manager.ts` | Wire `sendOrRestart` |
| 2 | `packages/qagent/packages/core/src/types/service-types.ts` | Add `sendOrRestart` to interface |
| 3 | `packages/qagent/packages/core/src/lifecycle-daemon.ts` | New daemon entry point |
| 3 | `packages/qagent/packages/core/src/session-manager-spawn.ts` | Auto-start daemon |
| 3 | `packages/qagent/packages/core/src/paths.ts` | Add `getDaemonPidPath()` |

## Testing

| Step | Test |
|------|------|
| 1 | Manual: spawn agent, verify it polls CI before exiting |
| 2 | Unit: mock dead agent, verify `sendOrRestart` re-launches |
| 2 | Unit: mock alive agent, verify `sendOrRestart` sends message |
| 3 | Unit: verify daemon PID file lifecycle |
| 3 | Integration: spawn session, verify daemon auto-starts |
