/**
 * Cursor sway — rotational wobble during movement for a natural feel.
 * Algorithm ported from Recordly (AGPL 3.0).
 *
 * The rotation is proportional to cursor speed and biased by movement direction,
 * then smoothed via spring physics for natural wobble decay.
 */

/** Maximum rotation in radians (~10°) */
const MAX_ROTATION = Math.PI / 18;

/** Reference speed (px/sec) at which rotation reaches maximum */
const SPEED_REFERENCE = 1400;

/** Vertical movement contributes less to directional bias */
const VERTICAL_WEIGHT = 0.65;

/** Internal intensity multiplier */
const INTENSITY_SCALE = 3;

/** UI slider maps 0–1 to 0–2 internal sway value */
export const SWAY_SLIDER_SCALE = 2;

/** Minimum delta-ms to avoid division artifacts */
const MIN_DELTA_MS = 1;

/** Maximum delta-ms to clamp (avoids huge speeds from stale frames) */
const MAX_DELTA_MS = 200;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function clampDeltaMs(deltaMs: number): number {
	return clamp(deltaMs, MIN_DELTA_MS, MAX_DELTA_MS);
}

/**
 * Compute the target sway rotation (radians) based on cursor movement.
 *
 * @param dx - Horizontal pixel displacement since last frame
 * @param dy - Vertical pixel displacement since last frame
 * @param deltaMs - Time since last frame in milliseconds
 * @param sway - Sway intensity (0 = off, typically 0–2)
 * @returns Target rotation in radians
 */
export function computeCursorSwayRotation(
	dx: number,
	dy: number,
	deltaMs: number,
	sway: number
): number {
	if (sway <= 0) return 0;

	const distance = Math.hypot(dx, dy);
	if (!Number.isFinite(distance) || distance < 0.01) return 0;

	const speedPxPerSec = distance / (clampDeltaMs(deltaMs) / 1000);
	const speedFactor = clamp(speedPxPerSec / SPEED_REFERENCE, 0, 1);
	if (speedFactor <= 0) return 0;

	const directionalBias = clamp((dx + dy * VERTICAL_WEIGHT) / distance, -1, 1);

	return directionalBias * speedFactor * MAX_ROTATION * sway * INTENSITY_SCALE;
}

/** Convert internal sway value to UI slider (0–1) */
export function toSwaySliderValue(sway: number): number {
	return sway / SWAY_SLIDER_SCALE;
}

/** Convert UI slider (0–1) to internal sway value */
export function fromSwaySliderValue(sliderValue: number): number {
	return sliderValue * SWAY_SLIDER_SCALE;
}
