/**
 * Cubic bezier and named easing functions for zoom transitions.
 * Ported from Recordly's easing approach for Screen Studio-like feel.
 */

/**
 * Evaluate a cubic bezier curve at parameter t.
 * Uses Newton-Raphson iteration to find the t value for a given x.
 */
export function cubicBezier(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	t: number
): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;

	// Find the parametric t for the given x using Newton-Raphson
	let guess = t;
	for (let i = 0; i < 8; i++) {
		const xGuess = sampleBezierX(x1, x2, guess);
		const dx = xGuess - t;
		if (Math.abs(dx) < 1e-6) break;
		const slope = bezierSlopeX(x1, x2, guess);
		if (Math.abs(slope) < 1e-6) break;
		guess -= dx / slope;
	}

	return sampleBezierY(y1, y2, guess);
}

function sampleBezierX(x1: number, x2: number, t: number): number {
	return 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t ** 2 * (1 - t) + t ** 3;
}

function sampleBezierY(y1: number, y2: number, t: number): number {
	return 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t ** 2 * (1 - t) + t ** 3;
}

function bezierSlopeX(x1: number, x2: number, t: number): number {
	return (
		3 * x1 * (1 - t) ** 2 +
		6 * x2 * t * (1 - t) -
		3 * x2 * t ** 2 +
		3 * t ** 2 -
		6 * x1 * t * (1 - t)
	);
}

/** Screen Studio zoom easing: cubicBezier(0.16, 1, 0.3, 1) */
export function easeOutScreenStudioBezier(t: number): number {
	return cubicBezier(0.16, 1, 0.3, 1, t);
}

/** Connected pan easing: cubicBezier(0.1, 0.0, 0.2, 1.0) */
export function easeConnectedPan(t: number): number {
	return cubicBezier(0.1, 0.0, 0.2, 1.0, t);
}

/** Standard easeInOutCubic */
export function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Aggressive deceleration: 1 - 2^(-7t) */
export function easeOutExpo(t: number): number {
	if (t >= 1) return 1;
	return 1 - 2 ** (-7 * t);
}

/** Smooth step: t²(3 - 2t) */
export function smoothStep(t: number): number {
	const c = Math.max(0, Math.min(1, t));
	return c * c * (3 - 2 * c);
}
