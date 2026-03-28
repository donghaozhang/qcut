# 12 — Cursor Motion Blur

**Priority**: P2 — Polish for fast cursor movements
**Estimate**: Small (2 subtasks)

## Goal

Apply directional motion blur to the cursor during fast movements, proportional to cursor velocity. The config field `motionBlur` already exists on `CursorRenderConfig` but is not rendered.

## Current State

- `CursorRenderConfig.motionBlur` exists (default 0)
- No rendering code uses this value
- Cursor is drawn as a sharp dot/sprite regardless of speed

## Recordly's Approach

From `src/components/video-editor/videoPlayback/cursorRenderer.ts`:

**Algorithm:**
1. Compute pixel displacement from previous frame
2. Speed = displacement × `(1000 / deltaMs) × motionBlur × 0.08`
3. Kernel size: `magnitude > 3 → 9, > 1 → 7, else 5`
4. Apply MotionBlurFilter (PixiJS) in the direction of movement
5. Threshold: `magnitude > 0.05` to apply (avoid sub-pixel jitter)

**Constant:** `CURSOR_MOTION_BLUR_BASE_MULTIPLIER = 0.08`

## Subtasks

### 12.1 Canvas2D Cursor Motion Blur

**Modify**: `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts`

Since Canvas2D doesn't have directional motion blur, use a trail/ghost approach:

```typescript
// Draw N ghost cursors along the movement vector with decreasing opacity
function drawCursorWithMotionBlur(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  prevX: number, prevY: number,
  config: CursorRenderConfig,
  clickAnimProgress: number,
  canvasWidth: number,
  swayRotation: number,
): void {
  const dx = x - prevX;
  const dy = y - prevY;
  const distance = Math.hypot(dx, dy);
  const blurIntensity = distance * config.motionBlur * 0.08;

  if (blurIntensity < 0.5) {
    // Below threshold — draw normally
    drawCursor(ctx, x, y, config, clickAnimProgress, canvasWidth, swayRotation);
    return;
  }

  const GHOST_COUNT = Math.min(5, Math.ceil(blurIntensity));
  // Draw ghosts from oldest to newest (increasing opacity)
  for (let i = GHOST_COUNT; i >= 0; i--) {
    const t = i / GHOST_COUNT;
    const ghostX = x - dx * t * 0.6;
    const ghostY = y - dy * t * 0.6;
    const alpha = (1 - t) * 0.3; // ghosts are faint
    ctx.save();
    ctx.globalAlpha = alpha;
    drawCursor(ctx, ghostX, ghostY, config, 0, canvasWidth, swayRotation);
    ctx.restore();
  }
  // Draw main cursor on top at full opacity
  drawCursor(ctx, x, y, config, clickAnimProgress, canvasWidth, swayRotation);
}
```

### 12.2 Wire into Export Compositor

**Modify**: `apps/web/src/lib/screen-recording/export-compositor.ts`

Track previous cursor position in `renderCursor()`:
```typescript
// After spring smoothing, before drawCursor:
const prevX = this.prevSmoothedX;
const prevY = this.prevSmoothedY;
// ... (already tracked for sway)

if (cursorConfig.motionBlur > 0) {
  drawCursorWithMotionBlur(ctx, smoothX, smoothY, prevX, prevY, ...);
} else {
  drawCursor(ctx, smoothX, smoothY, ...);
}
```

**Tests**: `apps/web/src/lib/screen-recording/__tests__/canvas-cursor-renderer.test.ts`
- No blur when motionBlur = 0
- Ghost trail drawn when motionBlur > 0 and cursor moving fast
- No ghosts for slow movement (below threshold)

## Dependencies

- **No new packages** — ghost trail technique using Canvas2D
- Previous cursor position already tracked in compositor (for sway)

## Key File Paths

| Component | Path |
|-----------|------|
| Canvas cursor renderer | `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts` |
| Cursor renderer (PixiJS) | `apps/web/src/lib/screen-recording/cursor-renderer.ts` |
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
