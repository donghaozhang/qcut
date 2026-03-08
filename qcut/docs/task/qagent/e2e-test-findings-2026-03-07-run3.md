# E2E Workflow Test Findings — 2026-03-07 (Run 3)

**Issue:** GitHub #218 / Linear QUR-17 — "Increase QAgent session card font sizes for better readability"
**PR:** #219 — `feat(qagent): increase session card font sizes for readability`
**Session:** `qcut-increase-qagent-session-card-f`
**Purpose:** Validate fixes from Run 2 (CI watch, workpad creation, agent death vs PR state)

---

## Timeline

| Time | Event | Status |
|------|-------|--------|
| T+0s | `spawn qcut 218` | Session created, tmux started |
| T+30s | Agent receives prompt, starts processing | `killed` (stale initial status) |
| T+3min | Agent creates Workpad comment on issue #218 | Working |
| T+5min | Agent reads SessionCard.tsx, implements font changes | Working |
| T+6min | Agent pushes branch, creates PR #219 | PR created |
| T+6min | Agent runs `gh pr checks 219 --watch --fail-fast` | **Waiting for CI** |
| T+10min | macOS + Linux CI pass, Windows pending | Still watching |
| T+15min | Windows CI passes (all 7/7 green) | Agent prints summary and exits |
| T+17min | Session status: `pr_open` | Daemon correctly tracks PR state |

---

## Findings

### 1. PASS: Spawn Workflow
- Issue #218 created on GitHub and auto-linked to Linear (QUR-17)
- Session created, worktree set up, Claude Code launched
- Agent found the issue, read acceptance criteria, made correct changes
- PR #219 created with "Closes #218" in body
- **All CI checks passed** (ubuntu, mac, windows, codecov, GitGuardian, CodeRabbit)

### 2. PASS: Workpad Comment Created (Previously FAIL)
**Severity:** Fixed from Run 2
**What happened:** The agent created a Workpad comment on issue #218 with:
- Hierarchical plan (7 steps)
- Acceptance criteria (8 items matching the issue)
- Validation section
- Notes section

**Root cause of previous failure:** Weak prompt language. The workflow.md only suggested creating a workpad.
**Fix applied:** Added `**MANDATORY**: You MUST create a Workpad comment before starting any implementation` to Step 1, plus `Do NOT skip the workpad` footer.

**Remaining issue:** The agent did not check off completed items in the workpad. The plan checkboxes remain unchecked despite all work being done. This is a minor adherence issue — the workpad exists but isn't kept current.

### 3. PASS: Agent Waited for CI (Previously FAIL)
**Severity:** Fixed from Run 2
**What happened:** After creating PR #219, the agent ran `gh pr checks 219 --watch --fail-fast` with a 600-second timeout. It waited for all CI checks to complete before printing a summary and exiting.

**Root cause of previous failure:** BASE_AGENT_PROMPT said "create a PR and push it. The orchestrator will handle CI monitoring" — telling the agent it was done after PR creation.
**Fix applied:**
1. BASE_AGENT_PROMPT now says "After creating a PR, you MUST wait for CI to finish" and "Do NOT exit until CI is green"
2. Workflow.md moved CI watch from standalone section into Step 2.7 as **MANDATORY**

### 4. PASS: Agent Death Does NOT Override PR State (Previously FAIL)
**Severity:** Fixed from Run 2
**What happened:** After the agent exited (process dead), the session status correctly shows `pr_open` instead of `killed`. The lifecycle fix (`if (!processAlive && !session.pr) return "killed"`) is working — sessions with PRs fall through to PR state checking.

### 5. PASS: PR Quality
- PR #219 title: "feat(qagent): increase session card font sizes for readability"
- Clear body with summary, test plan, and "Closes #218"
- All CI checks passed (7/7: 3 builds, codecov, GitGuardian, CodeRabbit, claude-skip)
- Clean single-commit diff: +22/-22 lines (CSS-only changes)

### 6. PARTIAL: Workpad Not Updated During Execution
**Severity:** Low
**What happened:** The agent created the Workpad comment but never updated it during execution. All plan checkboxes remain unchecked. The workpad was a one-time creation, not a living document.

**Root cause:** The workflow.md says "Update immediately after each meaningful milestone" but the agent treats it as advisory for simple tasks. Claude Code makes tool calls sequentially, and updating the workpad comment via `gh issue comment --edit` between each step would slow down a task this simple.

**Recommendation:** Accept this for simple tasks. For complex multi-file tasks, the workpad updates become more valuable. Consider adding a complexity heuristic that only enforces workpad updates for tasks with 3+ files changed.

### 7. FAIL: Lifecycle Daemon Not Starting
**Severity:** Medium
**What happened:** Multiple stale PID files exist in `~/.qagent/` with corrupt content (huge numbers). The daemon was not running, but the session status was still correct because `session ls` does its own status detection.

**Root cause:** The PID files from previous test runs were left behind with bad data. `ensureLifecycleDaemon()` reads the PID file, tries to parse the corrupt value, and fails silently — but never starts a new daemon because it errors during the `isProcessAlive` check.

**Fix needed:** Add validation that the parsed PID is a reasonable number (< 2^31) before calling `process.kill(pid, 0)`. Clean up stale PID files when the process isn't alive.

### 8. FAIL: Initial Status Shows "killed" Immediately After Spawn
**Severity:** Low
**What happened:** Immediately after spawn, `session ls` shows `[killed]` status even though the agent is alive and processing. This is cosmetic — it resolves to `pr_open` once the PR exists.

**Root cause:** The metadata file is written with `status: "spawning"`, but `determineStatus()` checks `agent.isProcessRunning()` which may return false before Claude Code's TUI has initialized (the process is alive but the agent plugin might not detect it correctly in the first few seconds).

**Fix needed:** Add a grace period — sessions less than 60 seconds old should not be marked `killed`. Or check the metadata `status: "spawning"` and skip the process-alive check for spawning sessions.

---

## Comparison: Run 2 vs Run 3

| Issue | Run 2 | Run 3 |
|-------|-------|-------|
| Spawn workflow | PASS | PASS |
| Workpad created | **FAIL** | **PASS** |
| Agent waits for CI | **FAIL** | **PASS** |
| Agent death vs PR state | **FAIL** (fixed mid-test) | **PASS** |
| Daemon plugin loading | **FAIL** (fixed mid-test) | N/A (daemon not starting) |
| PR quality | PASS | PASS |
| Session status accuracy | Blocked by P0 | PASS (minor initial status bug) |

---

## Priority Fixes

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P2** | Lifecycle daemon not starting (stale PIDs) | Small — PID validation | Prevents automated PR monitoring |
| **P3** | Initial status shows "killed" for new sessions | Small — grace period | Cosmetic confusion |
| **P4** | Workpad checkboxes not updated | Accept for simple tasks | Low — workpad exists but not live |

---

## Metrics

- Time to PR creation: ~6 minutes
- Time for all CI to pass: ~15 minutes
- Time agent stayed alive watching CI: ~9 minutes (waited for all checks)
- Agent followed instructions: **Strong** (workpad created, CI watched, correct code changes)
- Previous P0/P1/P2 fixes: **All verified working**
- End-to-end automation: **Working** — session correctly shows `pr_open` after agent exits
