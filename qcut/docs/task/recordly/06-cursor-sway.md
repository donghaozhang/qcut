# 06 — Cursor Sway

**Priority**: P2 — Polish feature for natural cursor feel
**Estimate**: Small (2 subtasks)
**Status**: IMPLEMENTED (subtask 6.1 complete, 6.2 UI pending)

## Goal

Add subtle rotational wobble to the cursor during movement, giving it a more natural, organic feel.

## Implementation Summary

### 6.1 Sway Algorithm + Spring Integration — DONE

**New file**: `apps/web/src/lib/screen-recording/cursor-sway.ts`
- Ported `computeCursorSwayRotation()` algorithm from Recordly
- Constants: MAX_ROTATION (π/18), SPEED_REFERENCE (1400), VERTICAL_WEIGHT (0.65), INTENSITY_SCALE (3)
- Slider conversion helpers: `toSwaySliderValue()`, `fromSwaySliderValue()`
- Delta-ms clamping (1–200ms) to avoid division artifacts

**Modified**: `apps/web/src/lib/screen-recording/cursor-renderer.ts`
- Added `sway: number` to `CursorRenderConfig` (default 0)
- Added `springRotation` SpringState for smooth wobble decay
- Sway spring uses reduced damping (0.9×) and mass (0.8×) per Recordly
- Rotation applied to both PixiJS Graphics (dot cursor) and Sprite (macOS cursor)
- `updateConfig()` rebuilds sway spring config when smoothing factor changes

**Modified**: `apps/web/src/lib/screen-recording/canvas-cursor-renderer.ts`
- Added optional `swayRotation` parameter to `drawCursor()`
- Applies canvas `translate → rotate → translate` around cursor position

**Tests**: `apps/web/src/lib/screen-recording/__tests__/cursor-sway.test.ts` — 13 tests, all passing
- Zero/negative sway returns 0
- Negligible movement returns 0
- Faster movement → larger rotation
- Higher intensity → larger rotation
- Speed factor clamping at reference speed
- Vertical < horizontal directional bias
- Opposite directions → opposite rotations
- NaN/Infinity handled gracefully
- Slider conversion round-trip

### 6.2 UI Control — PENDING

**TODO**: Add sway slider to cursor settings panel
- Range: 0–1 slider (maps to 0–2 internal via SWAY_SLIDER_SCALE)
- Label: "Off" at 0, multiplier format otherwise
- The `CursorRenderConfig.sway` field is already wired — UI just needs to set it

## Dependencies

- **No new packages** — pure math + existing spring physics
- **Ported**: ~30 lines of algorithm from Recordly's `cursorSway.ts`
- **Reused**: QCut's existing `SpringState` and `stepSpring` from `motion-smoothing.ts`
