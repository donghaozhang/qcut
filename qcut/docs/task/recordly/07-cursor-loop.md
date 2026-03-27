# 07 — Cursor Loop Mode

**Priority**: P2 — Polish for looping GIF/video exports
**Estimate**: Small (2 subtasks)
**Status**: IMPLEMENTED (subtask 7.1 complete, 7.2 UI pending)

## Goal

When exporting a looping clip, smoothly animate the cursor from its final position back to its starting position so the loop is seamless.

## Implementation Summary

### 7.1 Loop Telemetry Builder — DONE

**New file**: `apps/web/src/lib/screen-recording/cursor-loop.ts`
- Ported `buildLoopedCursorTelemetry()` algorithm from Recordly
- Adapted from Recordly's `{ timeMs, cx, cy }` format to QCut's `{ t, x, y, p, c }` format
- Three phases: remap original timestamps → easeOutQuint return motion → settle at start
- Constants: FREEZE_DURATION_MS (670), RETURN_STEPS (20), SETTLE_DURATION_MS (120), MOVEMENT_EPSILON (0.0015)
- `findLastMovingSampleTime()` exported for reuse
- `LoopConfig` interface for overriding timing constants
- Binary search interpolation for smooth position sampling

**Tests**: `apps/web/src/lib/screen-recording/__tests__/cursor-loop.test.ts` — 11 tests, all passing
- findLastMovingSampleTime: single point, all stationary, trailing stationary
- buildLoopedCursorTelemetry: empty input, time ordering, ends at start, first at t=0
- Duration bounds, short recordings, custom config overrides
- easeOutQuint verification (first step > last step distance)

### 7.2 Store + UI Toggle — PENDING

**TODO**:
- Add `cursorLoopMode: boolean` to `ScreenRecordingEnhancementState` (default false)
- Add toggle in cursor settings UI
- Call `buildLoopedCursorTelemetry()` before passing telemetry to renderer during export

## Dependencies

- **No new packages** — pure math + easing function
- **Ported**: ~100 lines of algorithm from Recordly's `cursorLoopTelemetry.ts`
- **Reused**: QCut's existing `CursorTelemetryPoint` type
