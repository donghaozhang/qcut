# 18 — Speed Region Timeline UI

**Priority**: P1
**Estimate**: Medium (~25 min)
**Status**: DONE

## Goal

Speed regions (per-section speed multipliers like 0.5x slow-mo or 2x fast-forward) have model, store, and compositor logic implemented. Missing: timeline UI for creating/editing regions, and export wiring (blocked by Task 14).

## Subtasks

### 18.1 — Timeline Speed Region Row (~15 min)

Add a visual speed region track to the timeline editor.

**Files**:
- `apps/web/src/components/timeline/speed-region-row.tsx` (new) — draggable speed regions on timeline
- `apps/web/src/routes/editor.$project_id.tsx` — add speed region row to timeline layout

**Behavior**:
- Horizontal track below main video track
- Drag to create new speed region (start/end time)
- Click to select and edit speed value (0.25x–4x)
- Visual color coding: blue=slow, orange=fast
- Delete selected region with keyboard shortcut

**Existing infrastructure**:
- `apps/web/src/lib/screen-recording/speed-regions.ts` — `SpeedRegion` type, utilities
- `apps/web/src/stores/screen-recording-store.ts` — `speedRegions` state, `addSpeedRegion()`, `removeSpeedRegion()`, `updateSpeedRegion()` actions

### 18.2 — Speed Region Export Integration (~10 min)

Wire speed regions into export pipeline.

**Files**:
- `apps/web/src/lib/export/export-engine-renderer.ts` — pass `speedRegions` to compositor (covered by Task 14)
- `apps/web/src/lib/screen-recording/export-compositor.ts` — speed region logic already in `renderFrame()`

**Tests**:
- `apps/web/src/lib/screen-recording/__tests__/speed-regions.test.ts` — 23 tests exist
- Add test: speed region row renders correctly with mock regions
- Add test: drag interaction creates region with correct time bounds
- Add test: export output applies speed multipliers to frame timing

## Dependencies

- Task 14 (export compositor wiring) — `speedRegions` field must be passed
- Timeline store for playback duration context
