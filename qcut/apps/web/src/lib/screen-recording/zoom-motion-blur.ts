/**
 * Zoom motion blur — velocity-based blur during camera movement.
 * Ported from Recordly's quadratic intensity curve approach.
 */

const PEAK_VELOCITY_PPS = 2000;
const MAX_BLUR_PX = 8;
const VELOCITY_THRESHOLD_PPS = 15;
const MIN_DELTA_MS = 1;
const MAX_DELTA_MS = 80;

export interface ZoomMotionBlurState {
	prevTx: number;
	prevTy: number;
	prevScale: number;
	prevTimeMs: number;
	initialized: boolean;
}

export interface ZoomMotionBlurResult {
	blurX: number;
	blurY: number;
	magnitude: number;
}

const ZERO_BLUR: ZoomMotionBlurResult = { blurX: 0, blurY: 0, magnitude: 0 };

export function createZoomMotionBlurState(): ZoomMotionBlurState {
	return {
		prevTx: 0,
		prevTy: 0,
		prevScale: 1,
		prevTimeMs: -1,
		initialized: false,
	};
}

/**
 * Compute motion blur based on camera velocity.
 * Mutates state in-place to track previous frame position.
 */
export function computeZoomMotionBlur(
	state: ZoomMotionBlurState,
	tx: number,
	ty: number,
	scale: number,
	timeMs: number,
	outputWidth: number,
	outputHeight: number,
	motionBlurAmount: number
): ZoomMotionBlurResult {
	if (motionBlurAmount <= 0) return ZERO_BLUR;

	if (!state.initialized) {
		state.prevTx = tx;
		state.prevTy = ty;
		state.prevScale = scale;
		state.prevTimeMs = timeMs;
		state.initialized = true;
		return ZERO_BLUR;
	}

	const rawDelta = timeMs - state.prevTimeMs;
	const deltaMs = Math.max(MIN_DELTA_MS, Math.min(MAX_DELTA_MS, rawDelta));
	const deltaSec = deltaMs / 1000;

	// Position velocity
	const dx = tx - state.prevTx;
	const dy = ty - state.prevTy;
	const positionSpeed = Math.hypot(dx, dy) / deltaSec;

	// Scale velocity contributes to blur
	const dScale = Math.abs(scale - state.prevScale);
	const scaleSpeed =
		(dScale / deltaSec) * Math.max(outputWidth, outputHeight) * 0.5;

	const totalSpeed = positionSpeed + scaleSpeed;

	// Update state
	state.prevTx = tx;
	state.prevTy = ty;
	state.prevScale = scale;
	state.prevTimeMs = timeMs;

	if (totalSpeed < VELOCITY_THRESHOLD_PPS) return ZERO_BLUR;

	// Quadratic intensity curve
	const normalized = Math.min(1, totalSpeed / PEAK_VELOCITY_PPS);
	const targetBlur = normalized * normalized * MAX_BLUR_PX * motionBlurAmount;

	// Direction from position displacement
	const dist = Math.hypot(dx, dy);
	if (dist < 0.01) {
		return { blurX: 0, blurY: 0, magnitude: targetBlur };
	}

	const dirX = dx / dist;
	const dirY = dy / dist;

	return {
		blurX: dirX * targetBlur * 1.2,
		blurY: dirY * targetBlur * 1.2,
		magnitude: targetBlur,
	};
}
