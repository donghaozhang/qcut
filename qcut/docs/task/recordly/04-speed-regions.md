# 04 — Speed Regions on Timeline

**Priority**: P1 — High value for tutorials (speed through boring parts, slow down key moments)
**Estimate**: Medium (4 subtasks)

## Goal

Allow users to add per-region speed multipliers on the timeline. Each region has a start/end time and a flat speed value (0.25x–4x).

## Recordly's Approach

- `SpeedRegion` type: `{ id, startMs, endMs, speed }`
- Dedicated `SPEED_ROW_ID` row on the timeline
- Overlap prevention via `hasOverlap()` validation
- Playback: set `video.playbackRate` based on active region at current time
- Export: speed regions modify frame timestamp calculations in the decoder
- Add via "S" hotkey or button, default 1000ms duration at playhead
- Drag handles to resize, labeled sequentially ("Speed 1", "Speed 2")

## Subtasks

### 4.1 Speed Region Data Model

**Modify**: `packages/editor-core/src/types/timeline.ts`

```typescript
interface SpeedRegion {
  id: string;
  startMs: number;
  endMs: number;
  speed: number; // 0.25–4.0 multiplier
}
```

**New file**: `apps/web/src/lib/screen-recording/speed-regions.ts`

```typescript
// Overlap detection (from Recordly)
function hasOverlap(regions: SpeedRegion[], candidate: SpeedRegion): boolean;

// Get active speed at a given time
function getSpeedAtTime(regions: SpeedRegion[], timeMs: number): number;

// Convert real time to playback time accounting for speed regions
function realTimeToPlaybackTime(regions: SpeedRegion[], realTimeMs: number): number;

// Convert playback time back to real time
function playbackTimeToRealTime(regions: SpeedRegion[], playbackTimeMs: number): number;

// Calculate total playback duration with speed regions applied
function calculateSpeedAdjustedDuration(totalDurationMs: number, regions: SpeedRegion[]): number;

// Minimum duration enforcement
const SPEED_REGION_MIN_DURATION_MS = 200;
```

**Tests**: `apps/web/src/lib/screen-recording/__tests__/speed-regions.test.ts`
- Overlap detection: overlapping, adjacent, non-overlapping
- Speed at time: inside region, outside region (returns 1.0), boundary
- Time conversion: single region, multiple regions, nested boundaries
- Duration calculation with various speed configurations

### 4.2 Speed Regions Store

**Modify**: `apps/web/src/stores/screen-recording-store.ts`

Add to `ScreenRecordingEnhancementState`:

```typescript
speedRegions: SpeedRegion[];

// Actions
addSpeedRegion: (startMs: number, durationMs?: number, speed?: number) => void;
removeSpeedRegion: (id: string) => void;
updateSpeedRegion: (id: string, updates: Partial<SpeedRegion>) => void;
```

**Logic**:
- `addSpeedRegion`: Create at playhead position, default 1000ms, default 1.0x speed. Reject if overlaps existing region.
- `updateSpeedRegion`: Validate no overlap with other regions after update. Enforce min duration.
- Persist with project via existing auto-save mechanism.

### 4.3 Timeline UI — Speed Row

Add a dedicated row on the timeline for speed regions.

**Visual design** (from Recordly):
- Orange-tinted items in a "Speed" row below the main video track
- Each item shows the speed value (e.g., "2x", "0.5x")
- Drag handles on left/right edges to resize
- Click to select, show speed slider in properties panel
- Double-click to edit speed value inline

**Keyboard shortcut**: "S" to add speed region at playhead (register in keybindings store)

**Properties panel** when speed region selected:
- Speed slider: 0.25x – 4.0x (step 0.25)
- Start time input (ms)
- End time input (ms)
- Delete button

**Relevant existing files**:
- Timeline components in `apps/web/src/components/editor/` — follow existing track/item patterns
- `apps/web/src/stores/editor/keybindings-store.ts` — register "S" shortcut

### 4.4 Playback + Export Integration

**Playback**:
- In the playback loop, check `getSpeedAtTime(regions, currentTimeMs)` each frame
- Set `video.playbackRate` accordingly
- Adjust playhead advancement by speed multiplier

**Export**:
- **Modify**: `apps/web/src/lib/export/export-engine-utils.ts`
  - `calculateTotalFrames()` must account for speed regions (faster = fewer frames, slower = more frames)
- **Modify**: `apps/web/src/lib/export/export-engine-renderer.ts`
  - Frame time stepping: `realTime = playbackTimeToRealTime(regions, frameIndex / fps * 1000)`
  - Seek source video to `realTime` for each frame

**Relevant existing files**:
- `apps/web/src/lib/export/export-engine.ts` — main export loop
- `apps/web/src/stores/editor/playback-store.ts` — playback rate

## Dependencies

- **No new packages** — uses existing `video.playbackRate` API
- **Port**: Overlap detection logic from Recordly (simple interval intersection check)
