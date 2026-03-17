# Screen Recording Enhancement — Implementation Plan

> Porting Recordly's cursor rendering, auto-zoom, and background beautification into QCut's existing screen recording pipeline.

## Architecture Summary

**Existing QCut screen recording flow:**
```
Renderer (MediaRecorder + getDisplayMedia)
  → 1s chunk IPC → Main process (file write)
  → FFmpeg transcode (WebM → MP4)
  → Output to ~/Videos/QCut Recordings/
```

**After enhancement:**
```
Renderer (MediaRecorder + getDisplayMedia)
  → 1s chunk IPC → Main process (file write + cursor telemetry)
  → FFmpeg transcode (WebM → MP4)
  → Import to timeline with cursor data sidecar
  → Preview: PixiJS cursor overlay + zoom transforms + background
  → Export: Canvas-based compositing with cursor/zoom/background baked in
```

## Key Existing Files

| Area | Path |
|------|------|
| IPC handler | `electron/screen-recording-handler/` (7 files) |
| Session types | `electron/screen-recording-handler/types.ts` |
| IPC registration | `electron/main.ts` (line ~135) |
| Renderer controller | `apps/web/src/lib/project/screen-recording-controller.ts` |
| UI button | `apps/web/src/components/editor/screen-recording-control.tsx` |
| Electron types | `apps/web/src/types/electron/screen-recording.ts` |
| Preview panel | `apps/web/src/components/editor/preview-panel.tsx` |
| Export engine | `apps/web/src/lib/export/export-engine.ts` |
| Export renderer | `apps/web/src/lib/export/export-engine-renderer.ts` |

## Implementation Steps (7 subtasks)

Each step has its own detailed doc:

| # | Step | Doc | New/Modified Files | Estimate |
|---|------|-----|-------------------|----------|
| 1 | ~~Cursor telemetry capture~~ | [step1-cursor-telemetry.md](step1-cursor-telemetry.md) | 4 new, 5 modified | DONE |
| 2 | ~~Cursor renderer (PixiJS)~~ | [step2-cursor-renderer.md](step2-cursor-renderer.md) | 6 new, 2 modified | DONE |
| 3 | ~~Background beautification~~ | [step3-background-beautification.md](step3-background-beautification.md) | 2 new, 3 modified | DONE |
| 4 | ~~Auto-zoom suggestions~~ | [step4-auto-zoom.md](step4-auto-zoom.md) | 5 new, 3 modified | DONE |
| 5 | ~~Zoom compositing in preview + export~~ | [step5-zoom-export.md](step5-zoom-export.md) | 3 new, 2 modified | DONE |
| 6 | ~~UI controls panel~~ | [step6-ui-controls.md](step6-ui-controls.md) | 3 new, 2 modified | DONE |
| 7 | Testing + integration | [step7-testing.md](step7-testing.md) | 3 new, 1 modified | 1 day |

**Total: ~8 days**

## Dependencies to Install

```bash
bun add uiohook-napi pixi.js@^8.0.0 pixi-filters
```

- `uiohook-napi` — native mouse/keyboard hook for cursor coordinate capture
- `pixi.js` — GPU-accelerated 2D rendering for cursor overlay
- `pixi-filters` — motion blur filter for cursor trail

Post-install: `npx electron-rebuild -f -w uiohook-napi`

## Conventions to Follow

1. **IPC pattern:** `screen:*` channels via `ipcMain.handle()` (see `electron/screen-recording-handler/ipc.ts`)
2. **State:** Zustand stores in `apps/web/src/stores/` (not React Context)
3. **Types:** Electron types in `apps/web/src/types/electron/`, store types co-located
4. **Handler structure:** Modular files in handler directory (see existing 7-file split)
5. **Preload bridge:** `window.electronAPI.screenRecording.*` pattern
6. **800-line limit:** Per CLAUDE.md, split files exceeding 800 lines
