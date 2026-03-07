# E2E Workflow Test Findings — 2026-03-07 (Run 2)

**Issue:** GitHub #215 / Linear QUR-16 — "Make qagent session list font text a little bit larger"
**PR:** #217 — `feat(qagent): increase session card font sizes for readability`
**Session:** `qcut-make-qagent-session-list-font`

---

## Timeline

| Time | Event | Status |
|------|-------|--------|
| T+0s | `qagent spawn qcut 215` | Session created, tmux started |
| T+3min | Agent completes, creates PR #217 | Agent exits |
| T+6min | CI starts running | Agent dead, daemon polling |
| T+11min | All CI checks pass (linux, mac, windows) | Still `pr_open` |
| T+16min | Daemon still showing `pr_open` | **Bug: daemon not loading plugins** |
| T+21min | Fixed daemon (moved to CLI package), restarted | Daemon works now |
| T+22min | Daemon detects dead agent → `killed` | **Bug: kills session before checking PR** |

---

## Findings

### 1. PASS: Spawn Workflow
- Issue created on GitHub (#215) and Linear (QUR-16)
- `qagent spawn qcut 215` worked correctly
- Worktree created, tmux session started, Claude Code launched
- Agent found the issue, read acceptance criteria, made changes
- PR #217 created with correct "Closes #215" in body
- **All CI checks passed** (ubuntu, mac, windows, codecov, GitGuardian)

### 2. PASS: Lifecycle Daemon Auto-Start
- `ensureLifecycleDaemon()` called after spawn
- PID file created at `~/.qagent/lifecycle-{hash}.pid`
- Daemon process started and kept running

### 3. FAIL: Agent Did NOT Wait for CI (Step 1)
**Severity:** Medium
**What happened:** Despite the workflow contract containing "Post-PR CI Watch" instructions telling the agent to run `gh pr checks --watch --fail-fast`, the agent exited immediately after creating the PR.

**Root cause:** Claude Code treated the prompt instructions as advisory, not binding. The `--dangerously-skip-permissions` flag was used, but the agent still chose to exit early. The workflow contract was injected correctly (visible in terminal output) but the agent didn't follow it.

**Fix options:**
1. **Stronger prompt language** — Use "MANDATORY" or "CRITICAL" keywords, put CI watch step FIRST in the workflow (before PR feedback sweep)
2. **Post-launch hook** — After agent creates PR, send a follow-up message via `agent.postPRHook()` that explicitly says "DO NOT EXIT until CI passes"
3. **Agent plugin enhancement** — Add a `getLaunchCommand` option that forces the agent to run a CI-wait script before exiting

### 4. FAIL: Lifecycle Daemon Not Loading Plugins (Critical Bug — FIXED)
**Severity:** Critical (fixed during test)
**What happened:** The lifecycle daemon was created as an entry point in `packages/core/dist/lifecycle-daemon.js`. When it called `import('@composio/ao-plugin-runtime-tmux')`, the import failed silently because core's `node_modules` doesn't contain the plugin packages — they're only in CLI's dependencies.

**Root cause:** Node.js module resolution uses the calling file's directory as the base. `packages/core/dist/` → can't find `@composio/ao-plugin-*`. `packages/cli/dist/` → CAN find them.

**Fix applied:**
- Created `packages/cli/src/lifecycle-daemon.ts` as the real daemon entry point
- Updated `ensureLifecycleDaemon()` to search for the daemon script in multiple locations (CLI dist first, then core fallback)
- The old `packages/core/src/lifecycle-daemon.ts` kept but no longer used as primary

### 5. FAIL: Agent Death Overrides PR State (Critical Design Issue — FIXED)
**Severity:** Critical (fixed during test)
**What happened:** After the daemon started working, it polled the session and detected the Claude Code process was dead (via `agent.isProcessRunning()`). It set the status to `killed` — BEFORE checking PR state. This means a session with:
- PR open ✓
- CI all passing ✓
- No review comments ✓
...gets marked `killed` just because the agent exited.

**Root cause:** In `lifecycle-manager.ts` → `determineStatus()`:
```typescript
// Step 2: Check agent activity via terminal output + process liveness
if (agent && session.runtimeHandle) {
    const terminalOutput = await runtime.getOutput(handle, 10);
    if (terminalOutput) {
        const processAlive = await agent.isProcessRunning(handle);
        if (!processAlive) return "killed";  // ← BUG: exits here
    }
}
// Step 4: Check PR state — NEVER REACHED if agent is dead
```

**Fix needed:**
The `isProcessRunning` check should NOT return `killed` when a PR exists. Sessions with PRs should always proceed to PR state checking. Proposed fix:

```typescript
if (!processAlive) {
    // Don't mark as killed if there's an active PR —
    // the lifecycle manager should monitor PR state
    if (!session.pr) return "killed";
    // Otherwise, fall through to PR state checking
}
```

### 6. PASS: PR Quality
- PR #217 title: "feat(qagent): increase session card font sizes for readability"
- Clear body with summary, test plan, and "Closes #215"
- All CI checks passed (3/3 builds, codecov, GitGuardian, CodeRabbit)
- Clean single-commit diff

### 7. PARTIAL: No Workpad Comment
**What happened:** The Symphony workflow instructs agents to create a "Workpad" comment on the issue for tracking progress. The agent did not create one.

**Root cause:** The agent treated the workflow contract as advisory. For simple tasks (just bumping font sizes), the agent skipped the workpad creation and went straight to implementation.

**Fix:** For small tasks this is acceptable. For complex tasks, the workpad would be more important. Consider making workpad creation mandatory in the prompt or adding a `complexity: simple|complex` annotation.

---

## Priority Fixes

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| ~~**P0**~~ | ~~Agent death overrides PR state~~ | **FIXED** — `lifecycle-manager.ts:180` | Was blocking entire lifecycle |
| ~~**P1**~~ | ~~Daemon not loading plugins~~ | **FIXED** — moved daemon to CLI package | Was preventing all daemon monitoring |
| **P2** | Agent doesn't wait for CI | Prompt engineering | Reduces CI catch rate |

---

## Metrics

- Time to PR creation: ~3 minutes
- Time for all CI to pass: ~10 minutes
- Agent followed instructions: Partial (made correct code changes, proper PR, but skipped CI watch and workpad)
- Lifecycle daemon: Working after fix (plugin loading issue fixed)
- End-to-end automation: **Blocked** by P0 issue (agent death prevents PR monitoring)
