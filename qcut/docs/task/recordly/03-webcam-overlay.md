# 03 — Webcam Overlay

**Priority**: P0 — Critical for talking-head tutorials and product demos
**Estimate**: Large (5 subtasks)
**Status**: PARTIALLY IMPLEMENTED (3.1 store + 3.3 squircle done, 3.2/3.4/3.5 pending)

## Goal

Picture-in-picture webcam bubble overlay on screen recordings with positioning, sizing, mirror, roundness, shadow, and zoom-reactive scaling.

## Implementation Summary

### 3.1 Webcam Overlay Store — DONE

**New file**: `apps/web/src/stores/webcam-overlay-store.ts`
- `WebcamOverlayConfig` interface: enabled, position, size, mirror, roundness, shadow, margin, zoomReactive, opacity, deviceId
- `WebcamPresetPosition` type: 9 positions (corners, edges, center)
- `getPresetCoordinates(preset)` — maps preset names to normalized 0–1 coordinates
- `getWebcamOverlayRect(config, containerW, containerH, zoomDepth?)` — computes pixel position/size with margin, zoom-reactive scaling, min-size enforcement (56px)
- `useWebcamOverlayStore` Zustand store with `setConfig` and `resetConfig` actions
- Default: disabled, bottom-left, 25% size, 80px roundness, 50% shadow

**Tests**: `apps/web/src/stores/__tests__/webcam-overlay-store.test.ts` — 12 tests, all passing
- Preset coordinates for all positions
- Size calculation from percentage
- Min size enforcement
- Bottom-right and top-left positioning with margin
- Zoom-reactive scaling
- Custom position coordinates
- Default config values

### 3.3 Squircle Geometry — DONE

**New file**: `apps/web/src/lib/screen-recording/squircle.ts`
- Ported from Recordly's `squircle.ts` — superellipse (exponent 4.5) for iOS-style smooth rounding
- `getSquirclePathPoints(rect)` — generates path points with 10 segments per corner
- `getSquircleSvgPath(rect)` — SVG path string for clip-path CSS
- `drawSquircleClipPath(ctx, rect)` — Canvas2D clip path for export rendering
- Handles edge cases: zero size, zero radius (falls back to rectangle), radius clamping

**Tests**: `apps/web/src/lib/screen-recording/__tests__/squircle.test.ts` — 8 tests, all passing
- Zero size returns empty, zero radius returns rectangle
- Curved points generated (41 points = 4 corners × 10 segments + 1)
- Radius clamping, bounds checking
- SVG path format (M...L...Z)

### 3.2 Webcam Capture Service — PENDING

**TODO**: Create `apps/web/src/lib/screen-recording/webcam-capture.ts`
- `getUserMedia({ video: { deviceId, width, height, frameRate } })`
- Create hidden `<video>` element for preview
- Cleanup stops all tracks

### 3.4 Preview Rendering Component — PENDING

**TODO**: Create `apps/web/src/components/editor/webcam-overlay.tsx`
- Render bubble with squircle clip-path, shadow, mirror
- 9-position preset grid, size/roundness/shadow sliders
- Draggable for custom positioning

### 3.5 Export Compositing — PENDING

**TODO**: Add `renderWebcamOverlay()` to `export-engine-renderer.ts`
- Draw video frame with squircle clip, mirror transform, shadow

## Dependencies

- **No new packages** — uses `getUserMedia`, Canvas2D, CSS clip-path
- **Ported**: Squircle geometry from Recordly (~80 lines pure math)
- **Pattern reused**: Sticker overlay store for Zustand structure
