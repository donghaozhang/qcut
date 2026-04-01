# CLI Export Enhancement Gap — Implementation Plan

Status: The CLI export pipeline (`cursor-composite.ts`) currently draws a cursor dot with sway and motion blur. The web export compositor (`export-compositor.ts`) has full support for auto-zoom, spring-smoothed cursor, backgrounds, webcam overlay, and figure annotations. This plan bridges the gap.

---

## Gap Summary

| Feature | Web Export | CLI Export | Priority |
|---------|-----------|------------|----------|
| Cursor dot rendering | Yes | Yes (basic) | Done |
| Cursor sway | Yes (spring-based) | Yes (sine-based) | P1 — upgrade |
| Cursor motion blur | Yes (ghost trail) | Yes (ghost trail) | Done |
| Cursor click highlight | Yes | Yes | Done |
| Spring-smoothed cursor | Yes | No | P1 |
| Auto-zoom detection | Yes | No | P0 |
| Zoom transform (scale/translate) | Yes | No | P0 |
| Zoom motion blur | Yes | No | P2 |
| Connected zoom transitions (pan) | Yes | No | P2 |
| Background wallpaper/padding | Yes | No | P2 |
| Webcam overlay | Yes | No | P3 |
| Figure annotations | Yes | No | P3 |

---

## Subtask 1: Auto-Zoom Region Generation in CLI Export

**Estimate**: ~30 min  
**Priority**: P0  

Generate zoom regions from cursor telemetry inside the Electron export pipeline, reusing the web analyzer logic.

### What to do

1. The web analyzer at `apps/web/src/lib/screen-recording/auto-zoom-analyzer.ts` (167 lines) is pure TypeScript with no DOM/React dependencies. It takes `CursorTelemetryData` and returns `ZoomRegion[]`.

2. Move `analyzeForZoomSuggestions()` and its types to a shared location that both web and electron can import, OR copy the function into the electron export handler.

3. In `cursor-composite.ts`, after finding telemetry, call `analyzeForZoomSuggestions()` to generate zoom regions.

4. Pass the generated `ZoomRegion[]` into the per-frame compositing loop.

### Files to modify

| File | Change |
|------|--------|
| `apps/web/src/lib/screen-recording/auto-zoom-analyzer.ts` | Extract to shared package or keep as-is and import from electron |
| `electron/claude/handlers/claude-export-handler/cursor-composite.ts` | Import analyzer, generate zoom regions from telemetry |
| `electron/types/claude-api.ts` | Add `autoZoom?: boolean` to `ExportJobRequest.zoomConfig` |
| `electron/claude/handlers/claude-export-handler/types.ts` | Add `autoZoom?: boolean` to `ResolvedExportSettings.zoomConfig` |

### Key types

```typescript
// From auto-zoom-analyzer.ts
interface AutoZoomConfig {
  minDwellMs: number;        // 800
  dwellRadiusPx: number;     // 100
  minClickCluster: number;   // 2
  clickClusterTimeMs: number; // 3000
  defaultDepth: number;      // 1.5
  minGapMs: number;          // 1000
}

// From zoom-region-utils.ts
interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  depth: number;
  focus: { cx: number; cy: number };
  auto: boolean;
}
```

### Test cases

| Test | File |
|------|------|
| Analyzer generates regions from click clusters | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Analyzer generates regions from dwell periods | `electron/__tests__/cursor-composite-zoom.test.ts` |
| No regions when cursor is stationary (no clicks) | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Regions don't overlap after merge | `electron/__tests__/cursor-composite-zoom.test.ts` |

---

## Subtask 2: Apply Zoom Transform Per-Frame

**Estimate**: ~45 min  
**Priority**: P0  

Apply zoom transforms (scale + translate) to each video frame during cursor compositing, using the same `computeZoomTransform()` logic as the web compositor.

### What to do

1. The zoom transform at `apps/web/src/lib/screen-recording/zoom-transform.ts` (84 lines) is pure math — no DOM dependencies. It computes `{ scale, translateX, translateY }` given a time, zoom regions, and output dimensions.

2. Import or copy `computeZoomTransform()` and `findConnectedTransitions()` into the electron export handler.

3. In the per-frame compositing loop (`compositeSegmentCursor` in `cursor-composite.ts`):
   - Before drawing the video frame, compute the zoom transform for the current `timeMs`
   - Apply canvas `translate()` + `scale()` before `putImageData`
   - Draw the cursor inside the zoom context (so it zooms with the video)
   - Reset transform before `getImageData`

4. The canvas flow becomes:
   ```
   ctx.save()
   ctx.translate(zoom.translateX, zoom.translateY)
   ctx.scale(zoom.scale, zoom.scale)
   ctx.putImageData(frameData)  // video frame (may need drawImage instead)
   drawCursor(ctx, cursorX, cursorY)
   ctx.restore()
   getImageData(0, 0, width, height)  // composited output
   ```

   **Note**: `putImageData` ignores transforms. Must use `drawImage` from a temp canvas instead.

### Files to modify

| File | Change |
|------|--------|
| `electron/claude/handlers/claude-export-handler/cursor-composite.ts` | Add zoom transform logic per-frame, use drawImage instead of putImageData |
| `apps/web/src/lib/screen-recording/zoom-transform.ts` | No change (import as-is) |
| `apps/web/src/lib/screen-recording/zoom-region-utils.ts` | No change (import for `findConnectedTransitions`) |

### Implementation detail — putImageData vs drawImage

`CanvasRenderingContext2D.putImageData()` bypasses all transforms (translate, scale, globalAlpha). To apply zoom, we must:

1. Create a second "source" canvas at source video dimensions
2. `putImageData` the raw frame onto the source canvas
3. On the output canvas: `ctx.save()` → apply zoom transform → `ctx.drawImage(sourceCanvas, ...)` → draw cursor → `ctx.restore()`
4. `getImageData` from the output canvas

This requires two canvases but correctly applies zoom transforms to the video frame.

### Test cases

| Test | File |
|------|------|
| No zoom (scale=1) passes through unchanged | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Zoom at 1.5x centers on focus point | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Zoom transition eases in/out smoothly | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Cursor position is correct inside zoom context | `electron/__tests__/cursor-composite-zoom.test.ts` |

---

## Subtask 3: Upgrade Cursor to Spring-Smoothed Rendering

**Estimate**: ~20 min  
**Priority**: P1  

Replace the simple sine-based sway with the spring-physics cursor smoothing used by the web compositor.

### What to do

1. Import `stepSpring()`, `createSpringState()`, `getCursorSpringConfig()` from `apps/web/src/lib/screen-recording/motion-smoothing.ts` (56 lines, pure math).

2. Import `computeCursorSwayRotation()` from `apps/web/src/lib/screen-recording/cursor-sway.ts` (81 lines, pure math).

3. Replace the current cursor positioning in `compositeSegmentCursor`:
   - Currently: direct telemetry lookup + sine-based sway
   - New: telemetry lookup → spring smoothing (X, Y) → sway rotation → draw with rotation

4. Use `drawCursor()` / `drawCursorWithMotionBlur()` from `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts` (165 lines) instead of manual `arc()` calls. These functions handle rotation, click animation, dot style, and motion blur ghost trails.

### Files to modify

| File | Change |
|------|--------|
| `electron/claude/handlers/claude-export-handler/cursor-composite.ts` | Replace cursor drawing with spring + sway + canvas-cursor-renderer functions |

### Test cases

| Test | File |
|------|------|
| Spring smoothing reduces cursor jitter | `electron/__tests__/cursor-composite-spring.test.ts` |
| Sway rotation responds to cursor speed | `electron/__tests__/cursor-composite-spring.test.ts` |
| Click animation renders expanding circle | `electron/__tests__/cursor-composite-spring.test.ts` |

---

## Subtask 4: CLI Flag Plumbing for Auto-Zoom

**Estimate**: ~15 min  
**Priority**: P0  

Wire up CLI flags so users can enable auto-zoom from the command line.

### What to do

1. Add `--auto-zoom` boolean flag to CLI.
2. Pass it through the HTTP request as `zoomConfig.autoZoom: true`.
3. In the export engine, when `autoZoom` is true, trigger zoom region generation before compositing.

### Files to modify

| File | Change |
|------|--------|
| `electron/native-pipeline/cli/command-registry-editor.ts` | Add `--auto-zoom` flag to `editor:export:start` |
| `electron/native-pipeline/cli/cli.ts` | Register `auto-zoom` in parseArgs, map to options |
| `electron/native-pipeline/editor/editor-handlers-generate.ts` | Add `autoZoom` to `body.zoomConfig` |
| `electron/types/claude-api.ts` | Add `autoZoom?: boolean` to `ExportJobRequest.zoomConfig` |
| `electron/claude/handlers/claude-export-handler/types.ts` | Add `autoZoom?: boolean` to `ResolvedExportSettings.zoomConfig` |

### CLI usage after implementation

```bash
bun run pipeline editor:export:start \
  --project-id <id> \
  --preset youtube-1080p \
  --cursor-sway 1.0 \
  --cursor-blur 0.3 \
  --auto-zoom \
  --zoom-blur 0.4 \
  --poll
```

### Test cases

| Test | File |
|------|------|
| `--auto-zoom` flag parsed correctly | `electron/__tests__/cli-export-flags.test.ts` |
| `autoZoom` passes through to export settings | `electron/__tests__/cli-export-flags.test.ts` |

---

## Subtask 5: Zoom Motion Blur

**Estimate**: ~15 min  
**Priority**: P2  

Add motion blur during zoom transitions (the subtle blur that appears when zooming in/out quickly).

### What to do

1. Import `createZoomMotionBlurState()` and `computeZoomMotionBlur()` from `apps/web/src/lib/screen-recording/zoom-motion-blur.ts` (106 lines, pure math).

2. In the per-frame loop, after computing zoom transform:
   - Call `computeZoomMotionBlur()` with current zoom state
   - If blur magnitude > 0.5, apply `ctx.filter = 'blur(Npx)'` before drawing the video frame
   - Reset filter before drawing cursor (cursor should be sharp)

### Files to modify

| File | Change |
|------|--------|
| `electron/claude/handlers/claude-export-handler/cursor-composite.ts` | Add zoom motion blur state tracking and filter application |

### Test cases

| Test | File |
|------|------|
| Zoom motion blur activates during fast zoom transition | `electron/__tests__/cursor-composite-zoom.test.ts` |
| Cursor remains sharp during zoom blur | `electron/__tests__/cursor-composite-zoom.test.ts` |

---

## Subtask 6: Background Wallpaper / Padding / Rounding

**Estimate**: ~30 min  
**Priority**: P2  

Add background rendering (gradient/solid/image wallpapers, padding, rounded corners) to CLI exports.

### What to do

1. Import `drawBackground()` and `drawRoundedVideoFrame()` from `apps/web/src/lib/screen-recording/canvas-background-renderer.ts` (147 lines).

2. Add `--background` CLI flag (e.g., `--background gradient-purple`, `--background solid:#1a1a2e`).

3. In the per-frame loop:
   - Draw background first (fills entire canvas)
   - Draw video frame with padding and rounded corners
   - Draw cursor and zoom on top

### Files to modify

| File | Change |
|------|--------|
| `electron/claude/handlers/claude-export-handler/cursor-composite.ts` | Add background rendering step |
| `electron/native-pipeline/cli/command-registry-editor.ts` | Add `--background` flag |
| `electron/native-pipeline/cli/cli.ts` | Register background flag |
| `electron/native-pipeline/editor/editor-handlers-generate.ts` | Pass background config |
| `electron/types/claude-api.ts` | Add `backgroundConfig` to ExportJobRequest |

### Test cases

| Test | File |
|------|------|
| Gradient background renders correctly | `electron/__tests__/cursor-composite-background.test.ts` |
| Video frame has rounded corners | `electron/__tests__/cursor-composite-background.test.ts` |
| Padding reduces video area correctly | `electron/__tests__/cursor-composite-background.test.ts` |

---

## Architecture Notes

### Shared Module Strategy

Several web modules are pure TypeScript with no DOM/React dependencies and can be imported directly from the electron build:

| Module | DOM-free? | Strategy |
|--------|-----------|----------|
| `auto-zoom-analyzer.ts` | Yes | Import directly |
| `zoom-transform.ts` | Yes | Import directly |
| `zoom-region-utils.ts` | Yes | Import directly |
| `zoom-motion-blur.ts` | Yes | Import directly |
| `motion-smoothing.ts` | Yes | Import directly |
| `cursor-sway.ts` | Yes | Import directly |
| `canvas-cursor-renderer.ts` | Uses `CanvasRenderingContext2D` | Works with @napi-rs/canvas |
| `canvas-background-renderer.ts` | Uses `CanvasRenderingContext2D` | Works with @napi-rs/canvas |
| `export-compositor.ts` | Uses `HTMLVideoElement` | Cannot import directly |

The electron TypeScript build (`electron/tsconfig.json`) needs `paths` or `imports` configured to resolve `@/` imports from `apps/web/src/`. Alternatively, copy the pure-math functions into `electron/claude/handlers/claude-export-handler/zoom-utils.ts`.

### Performance Considerations

Frame-by-frame processing with `@napi-rs/canvas` at 1920x1080 processes ~25 frames/sec (tested: 235 frames in ~10 seconds). For a 30-second recording at 30fps (900 frames), expect ~36 seconds of compositing time.

Optimizations for future:
- Skip frames where cursor hasn't moved and no zoom transition is active
- Use `canvas.toBuffer('raw')` instead of `getImageData` if supported
- Consider WebAssembly or native FFmpeg filter-based approach for longer videos

### CLI Guide Update

After implementation, update `docs/task/recordly/CLI-RECORDING-GUIDE.md` to document:
- `--auto-zoom` flag
- `--background` flag
- Updated export examples with full enhancement pipeline

---

## Implementation Order

```
Subtask 4: CLI flag plumbing (15 min)
    ↓
Subtask 1: Auto-zoom region generation (30 min)
    ↓
Subtask 2: Zoom transform per-frame (45 min)
    ↓
Subtask 3: Spring-smoothed cursor (20 min)
    ↓
Subtask 5: Zoom motion blur (15 min)
    ↓
Subtask 6: Background wallpaper (30 min)
```

Total: ~2.5 hours for P0+P1, ~3 hours for all subtasks.
