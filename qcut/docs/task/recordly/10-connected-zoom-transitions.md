# 10 — Connected Zoom Transitions

**Priority**: P1 — The "Screen Studio" feel; biggest remaining zoom gap
**Estimate**: Medium (3 subtasks)

## Goal

When two zoom regions are close together (<1.5s gap), smoothly pan between them instead of zooming all the way out and back in. This gives the polished, professional look of Screen Studio.

## Current State

QCut has: zoom-in/out transitions with easeOutCubic, overlap merging, and per-region strength.
QCut lacks: detection of adjacent regions, smooth pan interpolation, dedicated pan easing.

## Recordly's Approach

From `src/components/video-editor/videoPlayback/zoomRegionUtils.ts`:

**Constants:**
- `CHAINED_ZOOM_PAN_GAP_MS = 1500` — max gap between regions to chain them
- `CONNECTED_ZOOM_PAN_DURATION_MS = 1000` — duration of the pan transition
- `ZOOM_IN_TRANSITION_WINDOW_MS = 1522.575` — zoom-in is 1.5x slower than zoom-out

**Algorithm:**
1. Sort regions by start time
2. Find adjacent pairs where gap < 1500ms
3. During gap: interpolate focus point and scale using cubic bezier `(0.1, 0.0, 0.2, 1.0)`
4. After pan ends but before next region: hold at next region's zoom level
5. Priority: connected transitions > connected holds > standard active regions

**Easing functions:**
- `easeOutScreenStudio`: `cubicBezier(0.16, 1, 0.3, 1)` — zoom in/out
- `easeConnectedPan`: `cubicBezier(0.1, 0.0, 0.2, 1.0)` — pan between connected regions
- `easeInOutCubic`: zoom-in phase
- `easeOutExpo`: `1 - 2^(-7t)` — aggressive deceleration

## Subtasks

### 10.1 Easing Functions Library

**New file**: `apps/web/src/lib/screen-recording/easing.ts`

```typescript
// Cubic bezier easing (port from Recordly)
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number;

// Named easings
export function easeOutScreenStudio(t: number): number; // cubicBezier(0.16, 1, 0.3, 1)
export function easeConnectedPan(t: number): number;     // cubicBezier(0.1, 0.0, 0.2, 1.0)
export function easeInOutCubic(t: number): number;
export function easeOutExpo(t: number): number;           // 1 - 2^(-7t)
export function smoothStep(t: number): number;            // t²(3 - 2t)
```

QCut already has `easeOutCubic` in `math-utils.ts`. This adds the missing bezier-based easings.

**Tests**: `apps/web/src/lib/screen-recording/__tests__/easing.test.ts`
- Each easing: f(0)=0, f(1)=1, monotonically increasing
- cubicBezier matches known values

### 10.2 Connected Zoom Detection + Interpolation

**Modify**: `apps/web/src/lib/screen-recording/zoom-region-utils.ts`

Add:
```typescript
const CONNECTED_ZOOM_GAP_MS = 1500;
const CONNECTED_PAN_DURATION_MS = 1000;

interface ConnectedTransition {
  fromRegion: ZoomRegion;
  toRegion: ZoomRegion;
  panStartMs: number;
  panEndMs: number;
}

export function findConnectedTransitions(regions: ZoomRegion[]): ConnectedTransition[];

export function getConnectedPanState(
  transitions: ConnectedTransition[],
  timeMs: number,
): { active: boolean; focus: { cx: number; cy: number }; scale: number } | null;
```

**Logic:**
1. Sort regions by startMs
2. For each pair (i, i+1): if gap < CONNECTED_ZOOM_GAP_MS, create a `ConnectedTransition`
3. `getConnectedPanState`: during pan window, interpolate cx/cy/depth using `easeConnectedPan`
4. Between pan end and next region start: hold at next region's zoom level

**Tests**: `apps/web/src/lib/screen-recording/__tests__/connected-zoom.test.ts`
- Detect adjacent regions within gap threshold
- Skip regions too far apart
- Interpolate focus point mid-pan
- Hold at target after pan completes

### 10.3 Wire into Zoom Transform

**Modify**: `apps/web/src/lib/screen-recording/zoom-transform.ts`

In `computeZoomTransform()`:
1. Pre-compute connected transitions once (cache in caller or memoize)
2. Before checking individual regions, check if `timeMs` falls in a connected pan
3. If yes: use the interpolated focus/scale instead of per-region strength
4. Priority: connected pan > connected hold > standard region

**Modify**: `apps/web/src/lib/screen-recording/export-compositor.ts`
- Pre-compute connected transitions in constructor
- Pass to `computeZoomTransform` calls

### 10.4 Asymmetric Zoom Timing

**Modify**: `apps/web/src/lib/screen-recording/constants.ts`

```typescript
// Current: symmetric timing
export const TRANSITION_WINDOW_MS = 400;
export const ZOOM_IN_TRANSITION_WINDOW_MS = 600;

// Updated: zoom-in 1.5x slower than zoom-out (Recordly approach)
export const ZOOM_OUT_TRANSITION_WINDOW_MS = 400;
export const ZOOM_IN_TRANSITION_WINDOW_MS = 600; // already 1.5x, keep as-is
```

Replace `easeOutCubic` with `easeOutScreenStudio` for the main zoom transitions.

## Dependencies

- **No new packages** — cubic bezier is pure math (~30 lines)
- **Reuse**: Existing zoom-transform.ts architecture
- **Port**: Bezier easing from Recordly, connected transition detection logic

## Key File Paths

| Component | Path |
|-----------|------|
| Zoom transform | `apps/web/src/lib/screen-recording/zoom-transform.ts` |
| Zoom region utils | `apps/web/src/lib/screen-recording/zoom-region-utils.ts` |
| Constants | `apps/web/src/lib/screen-recording/constants.ts` |
| Math utils | `apps/web/src/lib/screen-recording/math-utils.ts` |
| Export compositor | `apps/web/src/lib/screen-recording/export-compositor.ts` |
