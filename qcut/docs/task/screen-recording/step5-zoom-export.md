# Step 5: Zoom + Background Compositing in Export

> Bake cursor overlay, zoom transforms, and background into the exported video.

## Goal

When exporting a project with screen recording enhancements, composite everything into the final video:
1. Background (wallpaper/gradient/solid + padding + rounded corners + shadow)
2. Video frame with zoom transform applied
3. Cursor overlay rendered on top

## Approach: Canvas-Based Frame Compositing

QCut's export uses `export-engine-renderer.ts` to render frames. We add a compositing pass for screen recording clips that draws all enhancement layers onto the export canvas.

**Why canvas, not FFmpeg filters:**
- FFmpeg `zoompan` filter doesn't support spring-eased transitions
- Cursor overlay requires frame-by-frame rendering (position + animation state)
- Background compositing with rounded corners + shadows is trivial in canvas
- Consistent preview ↔ export output

## New Files

### 1. `apps/web/src/lib/screen-recording/export-compositor.ts`

Composites all screen recording enhancements for a single frame.

```typescript
export interface ExportCompositorConfig {
  background: BackgroundConfig;
  cursorConfig: CursorRenderConfig;
  zoomRegions: ZoomRegion[];
  telemetry: CursorTelemetryData | null;
  outputWidth: number;
  outputHeight: number;
}

export class ScreenRecordingExportCompositor {
  constructor(config: ExportCompositorConfig)

  // Render a single frame with all enhancements
  renderFrame(
    ctx: CanvasRenderingContext2D,
    videoFrame: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    timeMs: number,
  ): void

  destroy(): void
}
```

**Frame rendering pipeline:**

```
1. Fill background (wallpaper image / gradient / solid color)
2. Compute zoom transform for timeMs
3. Save canvas state
4. Apply zoom transform (translate + scale around focus point)
5. Draw video frame (inset with padding, clipped to rounded rect)
6. Apply drop shadow if enabled
7. Restore canvas state
8. Draw cursor at interpolated position (with spring smoothing)
9. Draw click animation if active
```

### 2. `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts`

Canvas 2D cursor renderer (vs PixiJS for preview). Used during export.

```typescript
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  config: CursorRenderConfig,
  clickAnimProgress: number, // 0 = no click, 0–1 = click bounce progress
  canvasWidth: number,
): void
```

Why separate from PixiJS renderer:
- Export canvas is a standard `CanvasRenderingContext2D`
- No PixiJS dependency in export path
- Simpler: no motion blur filter (not visible at export resolution anyway)
- Renders cursor as filled circle or SVG image depending on `cursorStyle`

### 3. `apps/web/src/lib/screen-recording/canvas-background-renderer.ts`

Canvas 2D background renderer for export.

```typescript
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  config: BackgroundConfig,
  width: number,
  height: number,
  wallpaperImage?: HTMLImageElement,
): void

export function drawRoundedVideoFrame(
  ctx: CanvasRenderingContext2D,
  videoSource: CanvasImageSource,
  x: number, y: number,
  width: number, height: number,
  borderRadius: number,
  shadow: boolean,
): void
```

## Modified Files

### 1. `apps/web/src/lib/export/export-engine-renderer.ts`

Add screen recording enhancement compositing as a post-processing step.

```typescript
// After rendering the base video frame:
if (element.metadata?.isScreenRecording && hasEnhancements(element)) {
  const compositor = getOrCreateCompositor(element);
  compositor.renderFrame(ctx, videoElement, currentTimeMs);
}
```

**Integration point:** The existing renderer draws video frames to canvas. The compositor takes over drawing for screen recording clips, replacing the default draw with the enhanced pipeline.

### 2. `apps/web/src/lib/export/export-engine.ts`

Pass screen recording enhancement config through the export pipeline.

```typescript
// In export setup:
const enhancementState = useScreenRecordingEnhancementStore.getState();
exportConfig.screenRecordingEnhancements = {
  background: enhancementState.background,
  cursorConfig: enhancementState.cursorConfig,
  zoomRegions: enhancementState.zoomRegions,
  telemetry: enhancementState.cursorTelemetry,
};
```

### 3. `apps/web/src/lib/export/export-engine-recorder.ts`

Ensure the MediaRecorder-based export path also calls the compositor when recording from the preview canvas (which already has PixiJS cursor overlay).

For the recorder-based path, the preview canvas already includes cursor overlay via PixiJS. But zoom + background need explicit compositing. Add a pre-capture hook:

```typescript
// Before capturing frame for recording:
if (hasScreenRecordingEnhancements) {
  applyZoomTransformToCanvas(captureCanvas, zoomTransform);
}
```

## Wallpaper Image Preloading

For export, wallpaper images must be loaded before the first frame:

```typescript
// In compositor constructor:
if (config.background.type === 'wallpaper' && config.background.wallpaperId) {
  const wallpaper = BUILT_IN_WALLPAPERS.find(w => w.id === config.background.wallpaperId);
  if (wallpaper) {
    this.wallpaperImage = await loadImage(wallpaper.relativePath);
  }
}
```

## Performance

- Canvas 2D compositing adds ~1–3ms per frame (background + video + cursor)
- Acceptable for 30fps export (33ms budget per frame)
- Wallpaper image is loaded once and reused
- Spring state is maintained across frames (stateful but cheap)

## Testing

- Export a 5s screen recording with all enhancements enabled
- Verify cursor appears at correct positions in exported video
- Verify zoom transitions are smooth (no jumps)
- Verify background padding/corners render correctly
- Compare preview and export output for consistency
