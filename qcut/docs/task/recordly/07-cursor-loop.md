# 07 — Cursor Loop Mode

**Priority**: P2 — Polish for looping GIF/video exports
**Estimate**: Small (2 subtasks)

## Goal

When exporting a looping clip, smoothly animate the cursor from its final position back to its starting position so the loop is seamless.

## Recordly's Algorithm

From `src/components/video-editor/videoPlayback/cursorLoopTelemetry.ts`:

`buildLoopedCursorTelemetry(telemetry, timelineConfig)`:

1. Filter telemetry to visible timeline window (after trims)
2. Find last frame where cursor was actually moving (epsilon 0.0015 normalized distance)
3. Reserve a **670ms freeze window** at the end, split into:
   - **Return motion** (~550ms): easeOutQuint animation moving cursor from final → first position over 20 interpolation steps
   - **Settle** (120ms): cursor holds at start position for clean loop join
4. Remap all original sample timestamps proportionally into the shortened playback window
5. Reset cursor type to the first stable type at loop boundaries

**Constants**:
- `FREEZE_DURATION_MS` = 670
- `RETURN_STEPS` = 20
- `SETTLE_DURATION_MS` = 120
- `TRAILING_MOVEMENT_EPSILON` = 0.0015

**Easing**: `easeOutQuint(t) = 1 - (1 - t)^5`

## Subtasks

### 7.1 Loop Telemetry Builder

**New file**: `apps/web/src/lib/screen-recording/cursor-loop.ts`

Port Recordly's algorithm, adapting to QCut's telemetry format:

```typescript
interface LoopConfig {
  freezeDurationMs?: number;   // default 670
  returnSteps?: number;        // default 20
  settleDurationMs?: number;   // default 120
  movementEpsilon?: number;    // default 0.0015
}

function buildLoopedCursorTelemetry(
  telemetry: CursorTelemetryPoint[],
  totalDurationMs: number,
  trimRegions: TrimRegion[],
  config?: LoopConfig
): CursorTelemetryPoint[];

function findLastMovingSampleIndex(
  telemetry: CursorTelemetryPoint[],
  epsilon: number
): number;

function easeOutQuint(t: number): number;
```

**Logic**:
1. Get visible telemetry after applying trim regions
2. Find last moving sample via `findLastMovingSampleIndex`
3. Calculate available playback window = total - freezeDuration
4. Remap original timestamps into shortened window (proportional scaling)
5. Generate return-motion samples: interpolate from last position to first position with easeOutQuint
6. Generate settle samples: hold at first position for settleDuration
7. Concatenate: remapped originals + return motion + settle

**Relevant existing files**:
- `apps/web/src/lib/screen-recording/cursor-renderer.ts` — consumes telemetry points
- `apps/web/src/lib/screen-recording/auto-zoom-analyzer.ts` — telemetry type definitions

**Tests**: `apps/web/src/lib/screen-recording/__tests__/cursor-loop.test.ts`
- Verify last moving sample detection
- Verify timestamp remapping preserves relative ordering
- Verify return motion interpolation from end to start
- Verify settle period holds exact start position
- Verify total output duration matches input duration
- Edge case: cursor never moves (all settle)
- Edge case: very short recording (< freeze duration)

### 7.2 Store + UI Toggle

**Modify**: `apps/web/src/stores/screen-recording-store.ts`
- Add `cursorLoopMode: boolean` to enhancement state (default false)
- Add `setCursorLoopMode(enabled: boolean)` action

**UI**: Add toggle in cursor settings:
- Checkbox: "Smooth loop" or "Loop mode"
- Tooltip: "Smoothly returns cursor to start position for seamless looping"
- Only meaningful when export is set to loop (GIF loop or looping video) — show hint if not

**Export integration**:
- When `cursorLoopMode` is enabled, call `buildLoopedCursorTelemetry()` before passing telemetry to the cursor renderer during export
- Preview playback can also use looped telemetry when loop playback is active

## Dependencies

- **No new packages** — pure math + easing function
- **Port**: ~80 lines of algorithm from Recordly's `cursorLoopTelemetry.ts`
- **Reuse**: QCut's existing cursor telemetry types and renderer
