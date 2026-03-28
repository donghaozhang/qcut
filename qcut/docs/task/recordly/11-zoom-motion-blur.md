# 11 — Zoom Motion Blur

**Priority**: P2 — Polish during zoom transitions
**Estimate**: Small (2 subtasks)

## Goal

Apply directional motion blur to the entire frame during zoom transitions, proportional to camera velocity. Gives a cinematic feel to zoom-in/out movements.

## Current State

QCut has no motion blur during zoom. The `motionBlur` property exists on `CursorRenderConfig` but is unused for the camera.

## Recordly's Approach

From `src/components/video-editor/videoPlayback/zoomTransform.ts`:

**Algorithm** (`updateCameraMotionBlur`):
1. Track previous frame's camera position (tx, ty) and scale
2. Each frame: compute displacement `dx = tx - prevTx`, `dy = ty - prevTy`
3. Scale velocity: `|dScale/dt| × max(stageW, stageH) × 0.5` — zoom speed contributes to blur
4. Total speed = position speed + scale speed
5. Normalized = `min(1, speed / PEAK_VELOCITY_PPS)`
6. Target blur = `normalized² × MAX_BLUR_PX × motionBlurAmount` — **quadratic** curve
7. Direction vector from (dx, dy) scaled by target blur × 1.2
8. Dynamic kernel: `>4px → 11, >1.5px → 9, else 5`
9. Delta-ms clamped to 1–80ms to prevent spikes

**Constants:**
- `PEAK_VELOCITY_PPS = 2000`
- `MAX_BLUR_PX = 8`
- `VELOCITY_THRESHOLD_PPS = 15`

## Subtasks

### 11.1 Zoom Motion Blur Computation

**New file**: `apps/web/src/lib/screen-recording/zoom-motion-blur.ts`

```typescript
interface ZoomMotionBlurState {
  prevTx: number;
  prevTy: number;
  prevScale: number;
  prevTimeMs: number;
}

interface ZoomMotionBlurResult {
  blurX: number;  // directional blur X component (px)
  blurY: number;  // directional blur Y component (px)
  magnitude: number; // total blur magnitude (px)
}

export function createZoomMotionBlurState(): ZoomMotionBlurState;

export function computeZoomMotionBlur(
  state: ZoomMotionBlurState,
  tx: number,
  ty: number,
  scale: number,
  timeMs: number,
  outputWidth: number,
  outputHeight: number,
  motionBlurAmount: number, // 0–1
): ZoomMotionBlurResult;
```

Port the quadratic intensity curve and scale-velocity contribution from Recordly.

**Tests**: `apps/web/src/lib/screen-recording/__tests__/zoom-motion-blur.test.ts`
- No blur when camera is stationary
- Blur increases with camera speed
- Quadratic scaling (2x speed = 4x blur, not 2x)
- Scale changes contribute to blur
- Delta-ms clamping prevents spikes

### 11.2 Apply Blur in Export Compositor

**Modify**: `apps/web/src/lib/screen-recording/export-compositor.ts`

Add to `ExportCompositorConfig`:
```typescript
zoomMotionBlur?: number; // 0–1 intensity (default 0 = off)
```

In `renderFrame()`, after computing zoom transform but before drawing:
1. Call `computeZoomMotionBlur(state, zoom.translateX, zoom.translateY, zoom.scale, ...)`
2. If magnitude > threshold (0.5px): apply CSS `filter: blur()` on the canvas context
3. Canvas2D approach: use `ctx.filter = 'blur(Npx)'` (CanvasRenderingContext2D filter)

**Note**: Canvas2D `filter` has limited directional blur support. For MVP, use isotropic Gaussian blur with `magnitude` as the radius. Directional blur would require a custom shader or PixiJS.

## Dependencies

- **No new packages** — Canvas2D `filter` property for blur
- **Port**: Quadratic velocity-to-blur mapping from Recordly (~40 lines)

## Key File Paths

| Component | Path |
|-----------|------|
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
| Zoom transform | `apps/web/src/lib/screen-recording/zoom-transform.ts` |
