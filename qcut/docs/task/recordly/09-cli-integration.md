# Recordly Features — CLI & Export Engine Integration

**Status**: IMPLEMENTED — compositor wired, GIF support added, 200 tests passing

## Architecture

```
CLI: editor:export:start --data '{"format":"gif","preset":"gif-medium"}'
  ↓
HTTP POST /api/claude/export/{projectId}/start
  ↓
claude-export-handler/ → resolves settings, collects segments
  ↓
export-engine.ts → FFmpeg segments → concat → [sticker overlay] → [GIF convert]
  ↓
export-compositor.ts → renderFrame() with sway, loop, speed, webcam, annotations
```

---

## Implementation Summary

### 1. Export Compositor — All Features Wired

**Modified**: `apps/web/src/lib/screen-recording/export-compositor.ts`

Extended `ExportCompositorConfig` with new optional fields:
```typescript
cursorLoopMode?: boolean;
totalDurationMs?: number;
speedRegions?: SpeedRegion[];
webcamConfig?: WebcamOverlayConfig;
webcamVideo?: HTMLVideoElement;
figureAnnotations?: FigureAnnotation[];
```

**Rendering pipeline** (6 steps):
1. Draw background (existing)
2. Compute zoom transform (existing) — uses `sourceTimeMs` from speed remapping
3. Draw video frame (existing)
4. Draw cursor with sway rotation (extended)
5. Draw webcam overlay with squircle clip, mirror, shadow (new)
6. Draw figure annotations filtered by time range (new)

**Cursor sway integration**:
- Added `springRotation` SpringState + `swaySpringConfig` (0.9x damping, 0.8x mass)
- Computes `computeCursorSwayRotation(dx, dy, dt, sway)` per frame
- Passes `swayRotation` as 7th arg to `drawCursor()`

**Cursor loop integration**:
- In constructor: if `cursorLoopMode && telemetry && totalDurationMs`, calls `buildLoopedCursorTelemetry()` once
- Stores processed telemetry in `this.processedTelemetry`
- `getTelemetryPoints()` returns looped or original points

**Speed regions integration**:
- In `renderFrame()`: `sourceTimeMs = playbackTimeToRealTime(speedRegions, timeMs)`
- All downstream lookups (zoom, cursor, annotations) use `sourceTimeMs`

**Webcam overlay** (`renderWebcamOverlay`):
- Computes position/size via `getWebcamOverlayRect()` with zoom-reactive scaling
- Applies squircle clip path via `drawSquircleClipPath()`
- Mirror via `ctx.scale(-1, 1)`, shadow via `ctx.shadowColor`
- Rendered outside zoom transform context (stays fixed on screen)

**Figure annotations** (`renderFigureAnnotations`):
- Filters by `timeMs >= startMs && timeMs <= endMs`, sorts by zIndex
- Converts percentage coords to pixels
- Applies rotation via `ctx.rotate()`
- Draws arrows, circles, rectangles via `figure-paths.ts` functions

### 2. GIF Export — Preset + FFmpeg Conversion

**Modified**: `electron/claude/handlers/claude-export-handler/presets.ts`
- Added `gif-medium` preset (1280x720, 20fps)
- Added `gif-large` preset (1920x1080, 15fps)

**New file**: `electron/claude/handlers/claude-export-handler/gif-convert.ts`
- `convertToGif()` — two-pass FFmpeg palette method
- Pass 1: `palettegen=stats_mode=diff` for optimal palette
- Pass 2: `paletteuse=dither=floyd_steinberg` for quality encoding
- Loop flag: `0` = infinite, `-1` = no loop

**Modified**: `electron/claude/handlers/claude-export-handler/export-engine.ts`
- Imported `convertToGif` from `gif-convert.ts`
- After sticker overlay step: if `format === "gif"`, converts MP4 to GIF
- Renames intermediary MP4, runs two-pass conversion, cleans up
- Progress: 0.94-0.98 range during GIF conversion

### 3. Tests

**New file**: `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts` — 13 tests
- Basic rendering: no errors, draws video
- Cursor sway: passes rotation to drawCursor, passes 0 when disabled
- Cursor loop: processes telemetry when enabled, skips when disabled
- Speed regions: remaps time, passes through with no regions
- Webcam overlay: skips when disabled, skips when no video element
- Figure annotations: renders within time range, skips outside, handles empty
- Config: accepts all optional fields without errors

**Total Recordly tests**: 200 across 18 files — all passing

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `electron/claude/handlers/claude-export-handler/gif-convert.ts` | FFmpeg two-pass GIF conversion |
| `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts` | Compositor integration tests |

### Modified files
| File | Changes |
|------|---------|
| `apps/web/src/lib/screen-recording/export-compositor.ts` | Added sway, loop, speed, webcam, annotations rendering |
| `electron/claude/handlers/claude-export-handler/presets.ts` | Added gif-medium + gif-large presets |
| `electron/claude/handlers/claude-export-handler/export-engine.ts` | Added GIF conversion step after concat |

---

## Remaining Work

### Done
- [x] Wire cursor sway into compositor
- [x] Wire cursor loop into compositor
- [x] Wire speed regions into compositor
- [x] Wire webcam overlay into compositor
- [x] Wire figure annotations into compositor
- [x] Add GIF presets
- [x] Add FFmpeg GIF conversion
- [x] Write compositor tests

### Pending (UI + HTTP routes)
- [ ] Register screen recording HTTP routes in `claude-http-shared-routes.ts`
- [ ] Add new CLI options (`--gif-fps`, `--cursor-sway`, `--speed-regions`) to `command-registry-editor.ts`
- [ ] Pass new options through `cli-handlers-editor.ts` to the HTTP API
- [ ] Add audio config to recording start HTTP endpoint

## CLI Usage (When Routes Are Registered)

```bash
# GIF export
bun run pipeline editor:export:start \
  --project-id <id> --preset gif-medium --poll

# Custom GIF settings
bun run pipeline editor:export:start \
  --project-id <id> \
  --data '{"preset":"gif-medium","settings":{"fps":15,"format":"gif"}}' \
  --poll
```

## Key File Paths

| Component | Path |
|-----------|------|
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
| Export engine (FFmpeg) | `electron/claude/handlers/claude-export-handler/export-engine.ts` |
| GIF conversion | `electron/claude/handlers/claude-export-handler/gif-convert.ts` |
| Export presets | `electron/claude/handlers/claude-export-handler/presets.ts` |
| Cursor sway | `apps/web/src/lib/screen-recording/cursor-sway.ts` |
| Cursor loop | `apps/web/src/lib/screen-recording/cursor-loop.ts` |
| Speed regions | `apps/web/src/lib/screen-recording/speed-regions.ts` |
| Squircle | `apps/web/src/lib/screen-recording/squircle.ts` |
| Figure paths | `apps/web/src/lib/screen-recording/figure-paths.ts` |
| Webcam store | `apps/web/src/stores/webcam-overlay-store.ts` |
| Figure store | `apps/web/src/stores/figure-annotations-store.ts` |
| Compositor tests | `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts` |
