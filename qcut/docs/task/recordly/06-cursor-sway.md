# 06 — Cursor Sway

**Priority**: P2 — Polish feature for natural cursor feel
**Estimate**: Small (2 subtasks)

## Goal

Add subtle rotational wobble to the cursor during movement, giving it a more natural, organic feel.

## Recordly's Algorithm

From `src/components/video-editor/videoPlayback/cursorSway.ts`:

```typescript
function computeCursorSwayRotation(dx, dy, deltaMs, sway): number {
  const distance = Math.hypot(dx, dy);
  const speedPxPerSec = distance / (deltaMs / 1000);
  const speedFactor = clamp(speedPxPerSec / 1400, 0, 1);  // normalize to ref speed
  const directionalBias = clamp((dx + dy * 0.65) / distance, -1, 1);  // vertical weighted
  return directionalBias * speedFactor * (Math.PI / 18) * sway * 3;
}
```

**Constants**:
- `MAX_ROTATION` = π/18 (~10°)
- `SPEED_REFERENCE` = 1400 px/sec
- `VERTICAL_WEIGHT` = 0.65
- `INTENSITY_SCALE` = 3
- `SLIDER_SCALE` = 2 (UI maps 0–1 slider to 0–2 internal)

The raw rotation target is then fed through **spring physics** (same spring system as cursor smoothing) with reduced damping (0.9×) and reduced mass (0.8×) for natural wobble decay.

## Subtasks

### 6.1 Sway Algorithm + Spring Integration

**New file**: `apps/web/src/lib/screen-recording/cursor-sway.ts`

Port Recordly's algorithm directly — it's pure math with no dependencies:

```typescript
interface CursorSwayConfig {
  amount: number; // 0–2 (0 = off)
}

function computeCursorSwayRotation(
  dx: number, dy: number, deltaMs: number, swayAmount: number
): number;
```

**Integrate with existing spring physics**:

**Modify**: `apps/web/src/lib/screen-recording/motion-smoothing.ts`
- Add a separate `SpringState` for rotation (alongside existing x/y position springs)
- Use reduced damping (0.9×) and mass (0.8×) for the rotation spring
- Rest thresholds: delta 0.0005, speed 0.02

**Modify**: `apps/web/src/lib/screen-recording/cursor-renderer.ts` (or `canvas-cursor-renderer.ts`)
- Before drawing the cursor sprite, apply `ctx.rotate(swayRotation)` around the cursor center
- Reset rotation after drawing

**Tests**: `apps/web/src/lib/screen-recording/__tests__/cursor-sway.test.ts`
- Zero sway returns 0 rotation
- Faster movement = larger rotation
- Vertical vs horizontal movement bias
- Speed clamping at reference speed
- Spring damping reduces rotation over time when cursor stops

### 6.2 UI Control

**Modify**: Cursor settings panel (wherever cursor smoothing/motion blur controls live)

Add sway slider:
- Range: 0–2 (step 0.05)
- Label: "Off" at 0, multiplier format otherwise (e.g., "1.25×")
- Default: 0 (off)

**Modify**: `apps/web/src/stores/screen-recording-store.ts`
- Add `cursorSway: number` to enhancement state (default 0)
- Add `setCursorSway(value: number)` action

## Dependencies

- **No new packages** — pure math + existing spring physics
- **Port**: ~30 lines of algorithm from Recordly's `cursorSway.ts`
- **Reuse**: QCut's existing `SpringState` and `stepSpring` from `motion-smoothing.ts`
