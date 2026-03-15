/** Easing and interpolation utilities for cursor rendering. */

export function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

export function easeOutScreenStudio(t: number): number {
	// Custom easing curve mimicking Screen Studio's smooth zoom feel
	return 1 - Math.pow(1 - t, 4);
}

export function clamp01(t: number): number {
	return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}
