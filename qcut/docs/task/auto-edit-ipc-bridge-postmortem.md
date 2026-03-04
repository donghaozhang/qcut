# Auto-Edit IPC Bridge Incident Postmortem (2026-03-05)

## 1. Symptom

Reproduction command (Step 3):

```bash
bun run pipeline editor:editing:auto-edit \
  --project-id 59084b5d-fac6-472f-89a6-203bfa2b461b \
  --element-id 0a21e95d-49e3-4f17-a875-38f5f2e7abeb \
  --media-id media_YWktbmV3cy10ZXN0Lm1wNA \
  --remove-fillers \
  --poll \
  --json
```

Observed behavior:

- Returns `pending` first (with `jobId`)
- Then fails with: `IPC bridge unavailable for batch cut execution`

## 2. Final Root Cause Location

The failure happened at the final "apply batch cuts" step inside auto-edit:

- `autoEdit(...)` calls `executeBatchCuts(...)`
- `executeBatchCuts(...)` runs an IPC readiness guard first
- Guard throws `IPC bridge unavailable for batch cut execution`

Primary call chain:

- `electron/claude/handlers/claude-auto-edit-handler.ts`
- `electron/claude/handlers/claude-cuts-handler.ts`
- `electron/claude/utils/renderer-ipc-guard.ts`

## 3. What Was Fixed

### 3.1 Code change

Updated file:

- `electron/claude/handlers/claude-cuts-handler.ts`

Fix:

- Standardized `ipcMain` resolution to a static import path (same pattern used by other handlers).
- Removed fragile runtime variation in IPC lookup on this critical path.

Key semantic change:

- `import { ipcMain } from "electron"`
- `const ipcMainInstance = ipcMain`

### 3.2 Validation

Verified with:

1. Direct `editor:editing:batch-cuts` command succeeds.
2. Step 3 `editor:editing:auto-edit --poll` completes successfully (`9 cuts applied`).

## 4. Why This Was Hard to Debug

This was difficult because the issue sat in a cross-process async path, not in a single function bug:

1. Multi-process request path  
   CLI -> HTTP -> utility/main -> renderer.  
   A failure at any hop surfaces as one high-level message.

2. Async job masking  
   `--poll` returns `pending` first; the actual failure happens in background job execution.

3. Error message granularity  
   The current error did not include stage/process/channel context, so initial triage was slower.

4. Runtime refresh ambiguity  
   After code changes, stale running processes can still produce old behavior and create false negatives.

## 5. Robustness Assessment

Conclusion: **Functionality is acceptable, observability is not yet strong enough.**

What is already good:

- Health endpoint exists
- Async job status exists
- Log files exist
- Guards prevent silent corruption

What is still weak:

- Errors are not fully structured with execution context
- Cross-process tracing is not explicit enough in user-facing failures
- Auto-edit stage boundaries are not surfaced in CLI output

## 6. Recommended Design Improvements

1. Structured error payloads  
   Include: `stage`, `process`, `channel`, `guard`, `hint`.  
   Example: `stage=autoEdit.applyCuts`, `process=utility`, `guard=ipcMain.on missing`.

2. End-to-end correlation ID  
   Propagate one ID across CLI request, HTTP, job lifecycle, and IPC calls.

3. Layered health checks  
   Extend `editor:health` with optional deep checks for:
   `ipcMain-ready`, `utility-main bridge`, `renderer responders`, `auto-edit apply-cuts probe`.

4. Branch-path logging  
   Log whether request used accessor/proxy path vs local fallback and which process handled it.

5. CLI debug mode  
   Add `--debug-trace` to print failed stage and guard result directly in command output.

6. Startup smoke probe (dev/diagnostic mode)  
   Lightweight probe for:
   `auto-edit(start) -> status -> dry-run/apply-cuts`.

## 7. Outcome

- This incident was not an editing algorithm issue; it was an IPC runtime consistency/availability issue.
- The code fix works, but reliable verification required process refresh plus direct path checks.
- Next reliability gains should focus on observability and deterministic cross-process diagnostics.

