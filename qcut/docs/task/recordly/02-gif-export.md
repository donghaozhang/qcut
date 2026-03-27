# 02 — GIF Export

**Priority**: P0 — Common sharing format for short clips (Slack, GitHub, docs)
**Estimate**: Medium (3 subtasks)

## Goal

Export timeline as animated GIF with configurable frame rate, loop toggle, and size presets.

## Recordly's Approach

- Uses **gif.js** library (MIT) with Web Workers (1–8 workers based on CPU cores)
- Pipeline: `StreamingVideoDecoder` → `FrameRenderer` (applies all effects) → gif.js encoder
- Frame delay calculated per-frame from FPS setting
- Size presets: medium (1280×720), large (1920×1080), original
- Loop toggle controls the GIF repeat flag
- Cancellation via boolean flag checked between frames

## Subtasks

### 2.1 Add gif.js Dependency + GIF Export Engine

**Install**: `bun add gif.js` (or `gif.js.optimized` for better performance)

**New file**: `apps/web/src/lib/export/gif-export-engine.ts`

```typescript
interface GifExportSettings {
  width: number;
  height: number;
  fps: GifFrameRate;
  loop: boolean;
  quality: number; // gif.js quality param (1=best, 20=fastest)
}

type GifFrameRate = 15 | 20 | 25 | 30;

const GIF_SIZE_PRESETS = {
  medium: { width: 1280, height: 720 },
  large: { width: 1920, height: 1080 },
  original: null, // use source dimensions
} as const;
```

**Logic** (adapted from Recordly's `gifExporter.ts`):
1. Reuse QCut's existing `ExportEngine` frame renderer — call `renderFrame()` for each frame
2. Feed each rendered canvas frame to gif.js via `gif.addFrame(canvas, { delay, copy: true })`
3. Worker count: `Math.min(navigator.hardwareConcurrency || 4, 8)`
4. On `gif.on('finished', blob => ...)` — save the blob
5. Progress: gif.js emits `progress` events (0–1)

**Reuse**: The existing `export-engine-renderer.ts` `renderFrame()` handles all effects (zoom, cursor, captions, stickers, backgrounds). GIF export just changes the output encoder from MediaRecorder to gif.js.

**Relevant existing files**:
- `apps/web/src/lib/export/export-engine.ts` — base export engine
- `apps/web/src/lib/export/export-engine-renderer.ts` — frame rendering (reuse directly)
- `apps/web/src/lib/export/export-engine-factory.ts` — add `gif` engine type

**Tests**: `apps/web/src/lib/export/__tests__/gif-export-engine.test.ts`
- Mock gif.js, verify frames added with correct delay
- Verify loop flag passed correctly
- Verify cancellation stops frame processing
- Verify size preset dimension calculations

### 2.2 Export Types + Store Updates

**Modify**: `apps/web/src/types/export.ts`
- Add `"gif"` to `ExportFormat` union type
- Add `GifExportOptions` interface:
  ```typescript
  interface GifExportOptions {
    fps: GifFrameRate;
    loop: boolean;
    sizePreset: "medium" | "large" | "original";
  }
  ```
- Add GIF validation: `isValidGifFrameRate()` type guard (from Recordly)
- Add `calculateGifDimensions()` helper — scale maintaining aspect ratio, ensure even pixel counts

**Modify**: `apps/web/src/stores/export-store.ts`
- Add `gifOptions: GifExportOptions` to store state
- Add `updateGifOptions(Partial<GifExportOptions>)` action

**Modify**: `apps/web/src/lib/export/export-engine-factory.ts`
- Route `format: "gif"` to the new `GifExportEngine`

### 2.3 GIF Options UI

**Modify**: Export dialog/settings panel to show GIF-specific controls when format is "gif":
- Frame rate selector: 15 / 20 / 25 / 30 FPS (radio or dropdown)
- Loop toggle: checkbox (default: on)
- Size preset: medium / large / original (radio)
- Quality slider: 1 (best) to 20 (fastest) — label as "Quality vs Speed"

**Relevant existing files**:
- `apps/web/src/hooks/export/useExportSettings.ts` — extend with GIF options
- `apps/web/src/hooks/export/useExportPresets.ts` — add GIF-compatible presets

## Dependencies

- **New**: `gif.js` (MIT license, ~50KB) — battle-tested GIF encoder with Web Worker support
- **Existing**: Reuse `export-engine-renderer.ts` frame rendering pipeline entirely
