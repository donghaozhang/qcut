# 03 — Webcam Overlay

**Priority**: P0 — Critical for talking-head tutorials and product demos
**Estimate**: Large (5 subtasks)

## Goal

Picture-in-picture webcam bubble overlay on screen recordings with positioning, sizing, mirror, roundness, shadow, and zoom-reactive scaling.

## Recordly's Approach

- Webcam captured via `getUserMedia` at 1280×720@30fps as separate video file
- 9 preset positions (corners, edges, center) via percentage-based layout
- Squircle clip-path for iOS-style smooth rounding (`getSquircleSvgPath()`)
- Shadow via CSS `drop-shadow` filter (0–100% intensity)
- Zoom-reactive: overlay scales inversely to zoom depth for visual consistency
- Export-time: composited via canvas `drawImage` with clip paths

## Subtasks

### 3.1 Webcam Overlay Store

Clone the pattern from `apps/web/src/stores/stickers-overlay-store.ts`.

**New file**: `apps/web/src/stores/webcam-overlay-store.ts`

```typescript
interface WebcamOverlayConfig {
  enabled: boolean;
  position: WebcamPresetPosition | { x: number; y: number }; // percentage 0-100
  size: number;           // percentage 10-100 of container
  mirror: boolean;
  roundness: number;      // 0-160px corner radius
  shadow: number;         // 0-100% intensity
  margin: number;         // px from edge
  zoomReactive: boolean;  // scale with zoom regions
  opacity: number;        // 0-1
}

type WebcamPresetPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
```

**Reuse from Recordly**:
- `getWebcamPositionForPreset()` — maps preset names to normalized 0–1 coordinates
- `getWebcamOverlaySizePx()` — computes pixel dims from container + percentage + margin + zoom
- `getWebcamOverlayScale()` — zoom-reactive scaling formula

**Persistence**: Save to project via `platform().storage` (same pattern as stickers store)

**Tests**: `apps/web/src/stores/__tests__/webcam-overlay-store.test.ts`
- Position preset mapping
- Size calculation with various container dimensions
- Zoom-reactive scale computation
- Persistence round-trip

### 3.2 Webcam Capture Service

**New file**: `apps/web/src/lib/screen-recording/webcam-capture.ts`

```typescript
interface WebcamCaptureConfig {
  deviceId?: string;
  width?: number;   // default 1280
  height?: number;  // default 720
  frameRate?: number; // default 30
}

async function startWebcamCapture(config: WebcamCaptureConfig): Promise<{
  stream: MediaStream;
  videoElement: HTMLVideoElement; // for preview rendering
  cleanup: () => void;
}>
```

**Logic**:
1. `getUserMedia({ video: { deviceId, width, height, frameRate } })`
2. Create hidden `<video>` element, attach stream as `srcObject`
3. Track the stream for cleanup (stop all tracks on dispose)
4. Enumerate devices via `navigator.mediaDevices.enumerateDevices()`

**Tests**: `apps/web/src/lib/screen-recording/__tests__/webcam-capture.test.ts`
- Mock `getUserMedia`, verify constraints passed correctly
- Verify cleanup stops tracks

### 3.3 Squircle Geometry Utility

Port Recordly's `src/lib/geometry/squircle.ts` — pure math, directly portable.

**New file**: `apps/web/src/lib/screen-recording/squircle.ts`

```typescript
function getSquircleSvgPath(width: number, height: number, radius: number): string
function getSquircleClipPath(width: number, height: number, radius: number): string
```

This generates the iOS-style superellipse path (smoother than CSS `border-radius`).

**Tests**: `apps/web/src/lib/screen-recording/__tests__/squircle.test.ts`
- Verify path output for known dimensions
- Edge cases: radius 0 (rectangle), radius > min(w,h)/2 (circle)

### 3.4 Preview Rendering Component

**New file**: `apps/web/src/components/editor/webcam-overlay.tsx`

Renders the webcam bubble in the editor preview:
1. Position using CSS `left`/`top` percentages from store
2. Size using percentage of container width
3. Mirror via `transform: scaleX(-1)`
4. Roundness via squircle SVG clip-path
5. Shadow via CSS `drop-shadow` filter
6. Opacity via CSS `opacity`
7. Draggable for custom positioning (use same drag pattern as sticker overlay)

**UI controls** (in settings panel or dedicated webcam panel):
- Enable/disable toggle
- Device selector dropdown
- 9-position preset grid
- Size slider (10–100%)
- Mirror toggle
- Roundness slider (0–160px)
- Shadow slider (0–100%)
- Margin input (px)
- Zoom-reactive toggle

**Relevant existing files**:
- `apps/web/src/components/editor/stickers-overlay/` — drag/resize interaction pattern
- `apps/web/src/stores/stickers-overlay-store.ts` — z-index management pattern

### 3.5 Export Compositing

**Modify**: `apps/web/src/lib/export/export-engine-renderer.ts`

Add `renderWebcamOverlay()` to the frame rendering pipeline:

```typescript
function renderWebcamOverlay(
  ctx: CanvasRenderingContext2D,
  webcamVideo: HTMLVideoElement,
  config: WebcamOverlayConfig,
  canvasWidth: number,
  canvasHeight: number,
  currentZoomDepth: number
): void {
  // 1. Calculate position from preset or custom coords
  // 2. Calculate size (with zoom-reactive scaling if enabled)
  // 3. Save context, apply squircle clip path
  // 4. Draw video frame (mirror if needed via scale(-1, 1))
  // 5. Draw shadow if enabled
  // 6. Restore context
}
```

Call this after the main frame + cursor but before captions/annotations in the compositing order.

**Tests**: `apps/web/src/lib/export/__tests__/webcam-overlay-render.test.ts`
- Verify compositing order
- Verify mirror transform applied correctly
- Verify zoom-reactive size changes with zoom depth

## Dependencies

- **No new packages** — uses `getUserMedia`, Canvas2D, CSS clip-path
- **Reuse**: Sticker overlay store pattern, export engine renderer pipeline
- **Port**: Squircle geometry from Recordly (pure math, ~50 lines)
