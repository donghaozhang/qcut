# Bug: Auto-Edit Pipeline Fails at executeBatchCuts

## Status: 🔴 Open

## Summary

`editor:editing:auto-edit --remove-fillers` crashes with `Cannot read properties of undefined (reading 'on')` during the cut execution step. Transcription and filler analysis succeed, but applying cuts fails.

## Reproduction

```bash
bun run pipeline editor:editing:auto-edit \
  --project-id <id> \
  --element-id <id> \
  --media-id <id> \
  --remove-fillers \
  --poll \
  --json
```

Returns `pending` with a jobId, then immediately fails with `Auto-edit pipeline failed`.

## Error Log (from ~/Library/Logs/qcut/main.log)

```
[2026-03-05 00:44:22.528] [info]  [AutoEdit] Auto-edit: project=..., element=..., fillers=true, silences=true, dryRun=false
[2026-03-05 00:44:22.528] [warn]  [AutoEdit] Could not get timeline, using offset 0
[2026-03-05 00:44:44.097] [info]  [AutoEdit] Transcribed: 925 words, 161.98s
[2026-03-05 00:44:44.102] [info]  [AutoEdit] Analysis: 6 fillers, 0 silences
[2026-03-05 00:44:44.102] [info]  [AutoEdit] Built 6 cuts (3.1s total)
[2026-03-05 00:44:44.104] [error] [AutoEdit] Auto-edit pipeline failed: Cannot read properties of undefined (reading 'on')
```

## Root Cause Analysis

### Call Chain

1. CLI sends HTTP POST to `/api/claude/timeline/:projectId/auto-edit/start`
2. Route handler calls `getWindow()` → gets `win` (BrowserWindow)
3. `startAutoEditJob(projectId, request, win)` → creates job, fires `runAutoEditJob()` async
4. `runAutoEditJob()` → calls `autoEdit(projectId, request, win)`
5. `autoEdit()` steps:
   - ✅ Step 1: Get element info from timeline (warns "Could not get timeline, using offset 0")
   - ✅ Step 2: `transcribeMedia()` — succeeds (925 words)
   - ✅ Step 3: `analyzeFillers()` — succeeds (6 fillers, 3.1s)
   - ✅ Step 4: Build cut list — succeeds (6 cuts)
   - ❌ Step 5: `executeBatchCuts(win, ...)` — **CRASHES**

### Crash Location

**File:** `electron/claude/handlers/claude-cuts-handler.ts` line ~97

```typescript
ipcMain.on("claude:timeline:executeCuts:response", handler);
win.webContents.send("claude:timeline:executeCuts", { ... });
```

The error `Cannot read properties of undefined (reading 'on')` means either:
- `ipcMain` is undefined at this point in the execution context, OR
- `win.webContents` is undefined (though error says 'on' not 'send')

### Guard Check

In `claude-auto-edit-handler.ts` line ~302:
```typescript
if (!dryRun && mergedCuts.length > 0 && win) {
    result = await executeBatchCuts(win, { ... });
}
```

The guard checks `win` exists, but does NOT check `win.webContents` or `ipcMain` validity.

### Why `requestTimelineFromRenderer(win)` Also Fails

The "Could not get timeline" warning at Step 1 is the same class of bug — `win` exists but IPC communication with the renderer is broken.

## Relevant Files

| File | Role |
|------|------|
| `electron/claude/handlers/claude-auto-edit-handler.ts` | Pipeline orchestrator |
| `electron/claude/handlers/claude-cuts-handler.ts` | `executeBatchCuts()` — crash site |
| `electron/claude/http/claude-http-analysis-routes.ts` | HTTP route (line ~609), calls `getWindow()` |
| `electron/claude/handlers/claude-timeline-handler.ts` | `requestTimelineFromRenderer()` |

## Suggested Fix

### Option A: Defensive guard in executeBatchCuts

```typescript
// claude-cuts-handler.ts
export async function executeBatchCuts(win: BrowserWindow, request: BatchCutRequest) {
    if (!win?.webContents || win.webContents.isDestroyed()) {
        throw new HttpError(503, "Editor window not available for cut execution");
    }
    // ... rest of function
}
```

### Option B: Guard in autoEdit before calling executeBatchCuts

```typescript
// claude-auto-edit-handler.ts, Step 5
if (!dryRun && mergedCuts.length > 0 && win) {
    if (!win.webContents || win.webContents.isDestroyed()) {
        throw new HttpError(503, "Editor window not ready — cannot apply cuts. Try again or use --dry-run");
    }
    result = await executeBatchCuts(win, { ... });
}
```

### Option C: Investigate why getWindow() returns a stale/invalid window

Check `getWindow()` implementation — it may be returning a window reference that has been destroyed or hasn't fully initialized its webContents. This would also explain the Step 1 warning.

## Also Note

- The `editor:analyze:fillers` CLI command (standalone) returns empty results even when the auto-edit pipeline successfully finds 6 fillers internally — may be a separate bug in the filler analysis endpoint.
- Codex attempted a fix (2026-03-05) but modified `claude-media-handler.ts` (media ID resolution) — unrelated to this bug. Those changes should be reviewed separately.

## Test Run: 2026-03-05 01:14 AEDT (Codex)

### Results Summary
| Step | Command | Status | Notes |
|------|---------|--------|-------|
| 0 | QCut health | ❌ | `curl http://127.0.0.1:8765` failed: connection refused |
| 1 | yt-dlp download | ✅ | /tmp/ai-news-test.mp4 (131s) |
| 2 | project + import + timeline | ✅ | Already done |
| 3 | transcribe | ❌ | `editor:transcribe:start:failed` (`QCut editor not running at http://127.0.0.1:8765`) |
| 4a | auto-edit --remove-fillers | ❌ | `editor:editing:auto-edit:failed` (`QCut editor not running at http://127.0.0.1:8765`) |
| 4b | analyze:fillers | ❌ | `editor:analyze:fillers:failed` (`QCut editor not running at http://127.0.0.1:8765`) |

### Error Details

```text
$ curl -i --max-time 5 http://127.0.0.1:8765
curl: (7) Failed to connect to 127.0.0.1 port 8765 after 0 ms: Couldn't connect to server

$ bun run pipeline editor:transcribe:start --project-id 59084b5d-fac6-472f-89a6-203bfa2b461b --media-id media_YWktbmV3cy10ZXN0Lm1wNA --language en --poll --poll-interval 3 --load-speech --json
{
  "status": "error",
  "error": "QCut editor not running at http://127.0.0.1:8765\nStart QCut with: bun run electron:dev",
  "code": "editor:transcribe:start:failed"
}
error: script "pipeline" exited with code 1

$ bun run pipeline editor:editing:auto-edit --project-id 59084b5d-fac6-472f-89a6-203bfa2b461b --element-id element_1772633573844_rxxflaa --media-id media_YWktbmV3cy10ZXN0Lm1wNA --remove-fillers --poll --json
{
  "status": "error",
  "error": "QCut editor not running at http://127.0.0.1:8765\nStart QCut with: bun run electron:dev",
  "code": "editor:editing:auto-edit:failed"
}
error: script "pipeline" exited with code 1

$ bun run pipeline editor:analyze:fillers --project-id 59084b5d-fac6-472f-89a6-203bfa2b461b --media-id media_YWktbmV3cy10ZXN0Lm1wNA --json
{
  "status": "error",
  "error": "QCut editor not running at http://127.0.0.1:8765\nStart QCut with: bun run electron:dev",
  "code": "editor:analyze:fillers:failed"
}
error: script "pipeline" exited with code 1
```

### Observations
- CLI preflight failed on editor connectivity for all step 3/4 commands.
- No transcription, auto-edit, or filler analysis job was started because the editor endpoint was unreachable.
- This run conflicts with the expected "QCut already running" state and should be re-run after restoring editor availability at `127.0.0.1:8765`.
