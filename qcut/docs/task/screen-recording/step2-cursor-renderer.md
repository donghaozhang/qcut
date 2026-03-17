# Step 2: Cursor Renderer (PixiJS Overlay)

> Render a smooth, animated cursor on the preview panel using PixiJS, driven by telemetry data.

## Status: DONE

**Created:**
- `apps/web/src/lib/screen-recording/cursor-renderer.ts` — PixiJS cursor renderer with spring smoothing and click bounce
- `apps/web/src/lib/screen-recording/motion-smoothing.ts` — Spring physics model
- `apps/web/src/lib/screen-recording/math-utils.ts` — Easing curves and interpolation
- `apps/web/src/lib/screen-recording/cursor-assets.ts` — macOS-style cursor SVG data URLs
- `apps/web/src/lib/screen-recording/index.ts` — Barrel exports
- `apps/web/src/components/editor/preview-panel/cursor-overlay.tsx` — React PixiJS overlay component

**Modified:**
- `apps/web/src/stores/screen-recording-store.ts` — Added cursorConfig, showCursorOverlay state
- `apps/web/src/components/editor/preview-panel.tsx` — Integrated CursorOverlay component

## Goal

When a screen recording clip with cursor telemetry is on the timeline, render a polished cursor overlay on the preview canvas — with spring physics smoothing, click bounce animation, and optional motion blur.

## New Files

### 1. `apps/web/src/lib/screen-recording/cursor-renderer.ts`

Port of Recordly's `cursorRenderer.ts`. Core cursor rendering engine using PixiJS.

```typescript
export interface CursorRenderConfig {
  dotRadius: number;        // Base cursor size in px (at 1920px ref width)
  dotColor: number;         // Fill color (hex, e.g. 0xffffff)
  dotAlpha: number;         // Opacity 0–1
  smoothingFactor: number;  // Spring interpolation 0–1 (lower = smoother)
  motionBlur: number;       // Directional blur amount
  clickBounce: number;      // Click animation multiplier
  cursorStyle: 'dot' | 'macos-arrow' | 'macos-pointer';
}

export const DEFAULT_CURSOR_CONFIG: CursorRenderConfig = {
  dotRadius: 28,
  dotColor: 0xffffff,
  dotAlpha: 0.95,
  smoothingFactor: 0.18,
  motionBlur: 0,
  clickBounce: 1,
  cursorStyle: 'dot',
};

export class CursorRenderer {
  constructor(stage: PIXI.Container, config: CursorRenderConfig)

  // Update cursor position for current playback time
  update(timeMs: number, telemetry: CursorTelemetryData, canvasWidth: number, canvasHeight: number): void

  // Cleanup
  destroy(): void
}
```

**Key behaviors:**
- Binary search telemetry points by timestamp to find current + next point
- Interpolate position using spring physics (from `motion-smoothing.ts`)
- Scale cursor size relative to canvas width (28px at 1920px reference)
- On click (`p: true`): trigger bounce animation (scale 1.0 → 0.85 → 1.0 over 150ms)
- Optional motion blur via `pixi-filters` MotionBlurFilter based on velocity

### 2. `apps/web/src/lib/screen-recording/motion-smoothing.ts`

Port of Recordly's spring physics model.

```typescript
export interface SpringState {
  value: number;
  velocity: number;
  initialized: boolean;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export function getCursorSpringConfig(smoothingFactor: number): SpringConfig
export function stepSpring(state: SpringState, target: number, config: SpringConfig, dt: number): SpringState
```

Maps `smoothingFactor` (0–2) to spring parameters:
- 0 → stiffness=1000 (near-instant)
- 0.18 → stiffness=500 (default, natural feel)
- 0.5 → stiffness=340 (smooth)
- 2.0 → stiffness=160 (ultra-smooth)

### 3. `apps/web/src/lib/screen-recording/math-utils.ts`

Port of Recordly's easing curves.

```typescript
export function easeOutCubic(t: number): number
export function easeOutScreenStudio(t: number): number
export function clamp01(t: number): number
export function lerp(a: number, b: number, t: number): number
```

### 4. `apps/web/src/lib/screen-recording/cursor-assets.ts`

Port of Recordly's `uploadedCursorAssets.ts`. macOS-style cursor SVG data URLs.

```typescript
export const CURSOR_ASSETS: Record<string, string> = {
  'macos-arrow': 'data:image/svg+xml,...',
  'macos-pointer': 'data:image/svg+xml,...',
  'macos-text': 'data:image/svg+xml,...',
};
```

### 5. `apps/web/src/components/editor/preview-panel/cursor-overlay.tsx`

React component that manages the PixiJS cursor overlay on the preview panel.

```typescript
interface CursorOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  canvasWidth: number;
  canvasHeight: number;
  currentTimeMs: number;
  telemetry: CursorTelemetryData | null;
  config: CursorRenderConfig;
  visible: boolean;
}

export function CursorOverlay(props: CursorOverlayProps): JSX.Element | null
```

**Implementation approach:**
- Create a PixiJS `Application` instance with a transparent canvas
- Position it absolutely over the preview video area (same size)
- On each animation frame (or `currentTimeMs` change), call `renderer.update()`
- Use `useEffect` cleanup to destroy PixiJS app

### 6. `apps/web/src/lib/screen-recording/index.ts`

Barrel export for the screen-recording lib.

## Modified Files

### 1. `apps/web/src/components/editor/preview-panel.tsx`

Add `<CursorOverlay />` as a sibling to the existing `<StickerCanvas />` and `<CaptionsDisplay />`:

```tsx
// After existing overlays:
{cursorTelemetry && (
  <CursorOverlay
    containerRef={previewRef}
    canvasWidth={displaySize.width}
    canvasHeight={displaySize.height}
    currentTimeMs={playbackTime * 1000}
    telemetry={cursorTelemetry}
    config={cursorConfig}
    visible={showCursorOverlay}
  />
)}
```

**Pattern:** Same overlay approach as `StickerCanvas` — absolutely positioned on top of video.

### 2. `apps/web/src/stores/screen-recording-store.ts`

Extend the store from Step 1:

```typescript
interface ScreenRecordingEnhancementState {
  // From step 1
  cursorTelemetry: CursorTelemetryData | null;
  setCursorTelemetry: (data: CursorTelemetryData | null) => void;

  // Step 2 additions
  cursorConfig: CursorRenderConfig;
  setCursorConfig: (config: Partial<CursorRenderConfig>) => void;
  showCursorOverlay: boolean;
  setShowCursorOverlay: (show: boolean) => void;
}
```

## Coordinate Conversion

Telemetry stores absolute screen coordinates. The renderer converts to canvas-relative:

```typescript
function telemetryToCanvas(
  point: CursorTelemetryPoint,
  captureRect: CursorTelemetryData['captureRect'],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const rx = (point.x - captureRect.x) / captureRect.width;
  const ry = (point.y - captureRect.y) / captureRect.height;
  return { x: rx * canvasWidth, y: ry * canvasHeight };
}
```

## Performance Considerations

- PixiJS canvas uses `{ antialias: true, backgroundAlpha: 0 }` — transparent overlay
- Only update when `currentTimeMs` changes (not every rAF)
- Binary search for telemetry lookup is O(log n) — fast for 18K points
- Spring state is stateful but cheap (2 floats per axis)
- Motion blur filter is optional and GPU-accelerated
