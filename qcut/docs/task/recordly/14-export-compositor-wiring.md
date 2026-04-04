# 14 — Export Compositor Config Wiring

**Priority**: P0 (Critical Blocker)
**Estimate**: Small (~15 min)
**Status**: DONE

## Goal

The `ExportCompositorConfig` in `export-engine-renderer.ts` only passes 6 of 12 fields. This silently disables cursor loop, webcam overlay, speed regions, figure annotations, and zoom motion blur during export — even though all algorithms and renderers are fully implemented.

## Implementation

### File: `apps/web/src/lib/export/export-engine-renderer.ts` (lines 44-51)

**Current** (incomplete):
```typescript
const config: ExportCompositorConfig = {
  background: state.background,
  cursorConfig: state.cursorConfig,
  zoomRegions: state.zoomRegions,
  telemetry: state.cursorTelemetry,
  outputWidth: canvas.width,
  outputHeight: canvas.height,
};
```

**Target** (complete):
```typescript
const config: ExportCompositorConfig = {
  background: state.background,
  cursorConfig: state.cursorConfig,
  zoomRegions: state.zoomRegions,
  telemetry: state.cursorTelemetry,
  outputWidth: canvas.width,
  outputHeight: canvas.height,
  cursorLoopMode: state.cursorLoopMode,
  totalDurationMs: state.totalDurationMs,
  speedRegions: state.speedRegions,
  webcamConfig: state.webcamConfig,
  webcamVideo: state.webcamVideo,
  figureAnnotations: state.figureAnnotations,
  zoomMotionBlur: state.zoomMotionBlur,
};
```

### Verify state source

Check that the screen-recording store exposes all fields. Cross-reference:
- `apps/web/src/stores/screen-recording-store.ts` — `cursorLoopMode`, `speedRegions`, `zoomMotionBlur`
- `apps/web/src/stores/webcam-overlay-store.ts` — `webcamConfig`
- `apps/web/src/stores/figure-annotations-store.ts` — `figureAnnotations`
- Timeline duration from `apps/web/src/stores/timeline-store.ts` — `totalDurationMs`

### Tests

- **File**: `apps/web/src/lib/screen-recording/__tests__/export-compositor.test.ts`
- Add test: compositor receives all config fields and applies them during `renderFrame()`
- Add test: cursor loop mode produces modified telemetry when `totalDurationMs` is provided
- Add test: zoom motion blur value is forwarded to blur computation

## Dependencies

None — all algorithms already exist. This is purely wiring.
