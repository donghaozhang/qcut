import type { EffectDistortionRenderStage } from "../types/effect-render.js";

/** Source sampling coordinate (normalized 0–1) for one output pixel. */
export interface DistortionSample {
	u: number;
	v: number;
}

const MAX_RADIUS = Math.SQRT1_2; // hypot(0.5, 0.5)

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/**
 * Given an output pixel at (u, v) in 0–1 space, return the source coordinate to
 * sample. Pure and deterministic in time so preview and frame-based export can
 * share it. Displacement is radial from the frame center.
 */
export function sampleDistortionSource({
	stage,
	u,
	v,
	timeSeconds,
}: {
	stage: EffectDistortionRenderStage;
	u: number;
	v: number;
	timeSeconds: number;
}): DistortionSample {
	const dx = u - 0.5;
	const dy = v - 0.5;
	// sqrt over hypot: dx/dy are bounded to [-0.5, 0.5] so there is no overflow
	// risk, and this runs once per output pixel — hypot's guards are pure cost.
	const radius = Math.sqrt(dx * dx + dy * dy);
	if (radius <= 1e-6) return { u, v };
	const normalized = radius / MAX_RADIUS; // 0 at center, ~1 at corners
	const strength = Math.min(1, Math.max(0, stage.strength));

	let newNormalized = normalized;
	if (stage.variant === "fisheye") {
		// Bulge: sample nearer the center for outer pixels to magnify the middle.
		newNormalized = normalized * (1 - strength * 0.55 * (1 - normalized));
	} else if (stage.variant === "magnifier") {
		// Circular loupe: strongly magnify a central disc, untouched outside it.
		const lensRadius = 0.5;
		if (normalized >= lensRadius) return { u, v };
		newNormalized = normalized * (1 - strength * 0.6);
	} else if (stage.variant === "ripple") {
		const wave = Math.sin(normalized * 22 - timeSeconds * 5);
		newNormalized = normalized + strength * 0.05 * wave;
	} else {
		// shockwave: a ring of displacement expanding outward over time.
		const front = (timeSeconds * 0.55) % 1.35;
		const delta = normalized - front;
		const impulse = delta * Math.exp(-(delta * delta) / 0.006);
		newNormalized = normalized + strength * 0.12 * impulse;
	}

	const scale = newNormalized / normalized;
	return {
		u: clamp01(0.5 + dx * scale),
		v: clamp01(0.5 + dy * scale),
	};
}
