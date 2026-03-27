# 04 — Speed Regions on Timeline

**Priority**: P1 — High value for tutorials (speed through boring parts, slow down key moments)
**Estimate**: Medium (4 subtasks)
**Status**: PARTIALLY IMPLEMENTED (4.1 + 4.2 done, 4.3 UI + 4.4 export pending)

## Goal

Allow users to add per-region speed multipliers on the timeline. Each region has a start/end time and a flat speed value (0.25x–4x).

## Implementation Summary

### 4.1 Speed Region Data Model — DONE

**New file**: `apps/web/src/lib/screen-recording/speed-regions.ts`
- `SpeedRegion` interface: `{ id, startMs, endMs, speed }`
- `hasOverlap(regions, candidate)` — interval intersection with self-exclusion
- `getSpeedAtTime(regions, timeMs)` — returns speed multiplier at a point (1.0 default)
- `realTimeToPlaybackTime(regions, realTimeMs)` — source time → playback time
- `playbackTimeToRealTime(regions, playbackTimeMs)` — inverse conversion
- `calculateSpeedAdjustedDuration(totalMs, regions)` — total playback duration
- `clampSpeed(speed)` — clamp to 0.25–4.0 range
- Constants: MIN_DURATION (200ms), DEFAULT_SPEED (1.0), DEFAULT_DURATION (1000ms)

**Tests**: `apps/web/src/lib/screen-recording/__tests__/speed-regions.test.ts` — 23 tests, all passing
- hasOverlap: non-overlapping, overlapping, adjacent, self-skip, contained
- getSpeedAtTime: outside, inside, boundaries, empty
- realTimeToPlaybackTime: identity, 2x halves, 0.5x doubles, after-region shift
- playbackTimeToRealTime: identity, round-trip inversion at multiple points
- calculateSpeedAdjustedDuration: identity, 2x reduces, 0.5x increases, clamping, multiple regions
- clampSpeed: below min, above max, pass-through

### 4.2 Speed Regions Store — DONE

**Modified**: `apps/web/src/stores/screen-recording-store.ts`
- Added `speedRegions: SpeedRegion[]` to state
- `addSpeedRegion(startMs, durationMs?, speed?)` — creates with unique ID, rejects overlaps
- `removeSpeedRegion(id)` — removes by ID
- `updateSpeedRegion(id, updates)` — validates overlap + min duration after merge
- `setSpeedRegions(regions)` — bulk set

### 4.3 Timeline UI — PENDING

**TODO**:
- Add "Speed" row on timeline with orange-tinted items
- Drag handles on region edges
- Speed value display on each item
- Properties panel: speed slider (0.25–4x), start/end time inputs
- "S" keyboard shortcut to add speed region at playhead

### 4.4 Playback + Export Integration — PENDING

**TODO**:
- Set `video.playbackRate` based on `getSpeedAtTime()` during playback
- Modify `calculateTotalFrames()` in export engine
- Adjust frame time stepping: `realTime = playbackTimeToRealTime(regions, frameIndex / fps * 1000)`

## Dependencies

- **No new packages**
- **Reused**: Overlap detection pattern from Recordly's SpeedRegion model
