# Step 4: Auto-Zoom Suggestions

> Analyze cursor telemetry to automatically suggest zoom regions, plus manual zoom region editing.

## Status: DONE

**Created:**
- `apps/web/src/lib/screen-recording/zoom-region-utils.ts` — ZoomRegion type, strength calculation, region merging
- `apps/web/src/lib/screen-recording/zoom-transform.ts` — Viewport transform computation from zoom regions
- `apps/web/src/lib/screen-recording/auto-zoom-analyzer.ts` — Click clustering + dwell detection algorithm
- `apps/web/src/lib/screen-recording/focus-utils.ts` — Focus area constraint calculations
- `apps/web/src/lib/screen-recording/constants.ts` — Shared zoom/timing constants

**Modified:**
- `apps/web/src/stores/screen-recording-store.ts` — Added zoom region CRUD + auto-zoom config state
- `apps/web/src/lib/project/screen-recording-controller.ts` — Auto-generate zoom suggestions after recording
- `apps/web/src/components/editor/preview-panel.tsx` — Apply CSS zoom transform during playback

## Goal

After a screen recording completes (or when reviewing cursor telemetry), generate automatic zoom suggestions based on cursor activity patterns. Users can accept, reject, or manually add/edit zoom regions. Zoom regions are stored as a track in QCut's timeline.

## New Files

### 1. `apps/web/src/lib/screen-recording/zoom-region-utils.ts`

Port of Recordly's `zoomRegionUtils.ts`. Core zoom region strength calculation.

```typescript
export interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  depth: number;        // zoom level: 1.5 = 1.5x, 2.0 = 2x
  focus: {
    cx: number;         // 0–1 normalized focus center x
    cy: number;         // 0–1 normalized focus center y
  };
  auto: boolean;        // true if auto-generated, false if manual
}

// Transition timing constants
export const ZOOM_IN_OVERLAP_MS = 500;
export const ZOOM_IN_TRANSITION_WINDOW_MS = 600;
export const TRANSITION_WINDOW_MS = 400;

// Core function: compute zoom strength at a given time
export function computeRegionStrength(region: ZoomRegion, timeMs: number): number

// Merge overlapping regions
export function mergeOverlappingRegions(regions: ZoomRegion[]): ZoomRegion[]
```

### 2. `apps/web/src/lib/screen-recording/zoom-transform.ts`

Port of Recordly's `zoomTransform.ts`. Computes the viewport transform matrix.

```typescript
export interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

// Compute the active zoom transform at a given time
export function computeZoomTransform(
  timeMs: number,
  regions: ZoomRegion[],
  sourceWidth: number,
  sourceHeight: number,
): ZoomTransform
```

### 3. `apps/web/src/lib/screen-recording/auto-zoom-analyzer.ts`

**New code** (not a direct Recordly port). Analyzes cursor telemetry to generate zoom suggestions.

```typescript
export interface AutoZoomConfig {
  minDwellMs: number;         // min time cursor stays in area (default: 800ms)
  dwellRadiusPx: number;     // radius for "staying in area" (default: 100px)
  minClickCluster: number;    // min clicks in area to trigger zoom (default: 2)
  clickClusterTimeMs: number; // time window for click clustering (default: 3000ms)
  defaultDepth: number;       // default zoom level (default: 1.5)
  minGapMs: number;           // min gap between zoom regions (default: 1000ms)
}

export const DEFAULT_AUTO_ZOOM_CONFIG: AutoZoomConfig = {
  minDwellMs: 800,
  dwellRadiusPx: 100,
  minClickCluster: 2,
  clickClusterTimeMs: 3000,
  defaultDepth: 1.5,
  minGapMs: 1000,
};

export function analyzeForZoomSuggestions(
  telemetry: CursorTelemetryData,
  config?: Partial<AutoZoomConfig>,
): ZoomRegion[]
```

**Algorithm:**
1. **Click clustering**: Find groups of clicks within `clickClusterTimeMs` and `dwellRadiusPx`
2. **Dwell detection**: Find periods where cursor stays within `dwellRadiusPx` for `minDwellMs`
3. **Region generation**: Create zoom regions centered on click clusters / dwell points
4. **Merge pass**: Merge overlapping regions via `mergeOverlappingRegions()`
5. **Gap enforcement**: Ensure `minGapMs` between regions

### 4. `apps/web/src/lib/screen-recording/focus-utils.ts`

Port of Recordly's `focusUtils.ts`. Focus area constraint calculations.

```typescript
// Ensure zoom focus doesn't go out of bounds
export function constrainFocus(
  cx: number, cy: number,
  zoomScale: number,
  aspectRatio: number,
): { cx: number; cy: number }
```

### 5. `apps/web/src/lib/screen-recording/constants.ts`

Shared constants for zoom depth scales and timing.

```typescript
export const ZOOM_DEPTH_SCALES: Record<number, number> = {
  1: 1.0,   // no zoom
  1.5: 1.5, // standard
  2: 2.0,   // close
  3: 3.0,   // extreme close-up
};
```

## Modified Files

### 1. `apps/web/src/stores/screen-recording-store.ts`

Add zoom region state:

```typescript
interface ScreenRecordingEnhancementState {
  // ... previous fields ...

  // Step 4 additions
  zoomRegions: ZoomRegion[];
  setZoomRegions: (regions: ZoomRegion[]) => void;
  addZoomRegion: (region: ZoomRegion) => void;
  removeZoomRegion: (id: string) => void;
  updateZoomRegion: (id: string, updates: Partial<ZoomRegion>) => void;
  autoZoomConfig: AutoZoomConfig;
  setAutoZoomConfig: (config: Partial<AutoZoomConfig>) => void;
}
```

### 2. `apps/web/src/lib/project/screen-recording-controller.ts`

After recording stop + telemetry load, optionally run auto-zoom analysis:

```typescript
// After telemetry is loaded:
const suggestions = analyzeForZoomSuggestions(telemetry);
useScreenRecordingEnhancementStore.getState().setZoomRegions(suggestions);
```

### 3. `apps/web/src/components/editor/preview-panel.tsx`

Apply zoom transform to the video element during preview playback:

```typescript
const zoomTransform = computeZoomTransform(
  playbackTime * 1000,
  zoomRegions,
  canvasSize.width,
  canvasSize.height,
);

// Apply as CSS transform on the video container:
style={{
  transform: `scale(${zoomTransform.scale}) translate(${zoomTransform.translateX}px, ${zoomTransform.translateY}px)`,
  transformOrigin: 'top left',
}}
```

## Zoom Region Timeline Track (Future)

A dedicated "Zoom Track" in QCut's multi-track timeline would be ideal for visual editing of zoom regions. This is a **Tier 3** enhancement — not needed for MVP. For now, zoom regions are managed via the settings panel (Step 6) and the auto-analyzer.

If implemented later, the zoom track would:
- Map `ZoomRegion` to timeline elements
- Allow drag-to-resize start/end times
- Show zoom depth as vertical height
- Click to edit focus point

## Testing

- Unit test `analyzeForZoomSuggestions` with synthetic telemetry data
- Test `computeRegionStrength` with known time values
- Test `constrainFocus` boundary conditions
- Test region merging logic
