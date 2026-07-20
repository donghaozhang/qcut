import type {
	EffectParticleRenderStage,
	EffectParticleVariant,
} from "../types/effect-render.js";

/** One particle sampled at a point in time, in normalized 0–1 canvas space. */
export interface SampledEffectParticle {
	/** Horizontal position, 0 (left) – 1 (right). */
	x: number;
	/** Vertical position, 0 (top) – 1 (bottom). */
	y: number;
	/** Size as a fraction of the smaller canvas dimension. */
	size: number;
	/** Rotation in degrees (used by sakura/confetti sprites). */
	rotation: number;
	/** Per-particle opacity multiplier, 0–1. */
	opacity: number;
}

interface ParticleVariantConfig {
	/** Base particle count at density 1 before area scaling. */
	baseCount: number;
	/** Fraction of the smaller canvas dimension. */
	sizeMin: number;
	sizeMax: number;
	/** Vertical travel per second at speed 1 (fraction of height). Negative rises. */
	fallPerSecond: number;
	/** Horizontal sway amplitude (fraction of width). */
	swayAmplitude: number;
	/** Whether particles twinkle (opacity oscillates) instead of falling far. */
	twinkle: boolean;
}

const VARIANT_CONFIG: Record<EffectParticleVariant, ParticleVariantConfig> = {
	snow: {
		baseCount: 90,
		sizeMin: 0.004,
		sizeMax: 0.014,
		fallPerSecond: 0.16,
		swayAmplitude: 0.05,
		twinkle: false,
	},
	sakura: {
		baseCount: 46,
		sizeMin: 0.012,
		sizeMax: 0.03,
		fallPerSecond: 0.12,
		swayAmplitude: 0.09,
		twinkle: false,
	},
	embers: {
		baseCount: 70,
		sizeMin: 0.004,
		sizeMax: 0.012,
		fallPerSecond: -0.2,
		swayAmplitude: 0.04,
		twinkle: true,
	},
	stars: {
		baseCount: 80,
		sizeMin: 0.003,
		sizeMax: 0.011,
		fallPerSecond: 0.01,
		swayAmplitude: 0.01,
		twinkle: true,
	},
	confetti: {
		baseCount: 64,
		sizeMin: 0.01,
		sizeMax: 0.024,
		fallPerSecond: 0.24,
		swayAmplitude: 0.12,
		twinkle: false,
	},
	fog: {
		baseCount: 14,
		sizeMin: 0.18,
		sizeMax: 0.42,
		fallPerSecond: 0.02,
		swayAmplitude: 0.16,
		twinkle: false,
	},
	coins: {
		baseCount: 40,
		sizeMin: 0.014,
		sizeMax: 0.03,
		fallPerSecond: 0.26,
		swayAmplitude: 0.08,
		twinkle: false,
	},
	butterfly: {
		baseCount: 22,
		sizeMin: 0.02,
		sizeMax: 0.04,
		fallPerSecond: 0.06,
		swayAmplitude: 0.14,
		twinkle: false,
	},
};

/** Deterministic hash → [0, 1). Keeps particle layout stable across renders. */
function hash01({ seed }: { seed: number }): number {
	const value = Math.sin(seed * 127.1 + 311.7) * 43_758.545_312;
	return value - Math.floor(value);
}

function positiveModulo({
	value,
	modulus,
}: {
	value: number;
	modulus: number;
}) {
	return ((value % modulus) + modulus) % modulus;
}

/**
 * Sample the particle field at `timeSeconds`. Pure and deterministic: the same
 * stage + time always yields the same particles, so preview and export match.
 */
export function sampleEffectParticles({
	stage,
	timeSeconds,
	aspectRatio = 16 / 9,
}: {
	stage: EffectParticleRenderStage;
	timeSeconds: number;
	/** width / height, used to keep sizes visually round on wide canvases. */
	aspectRatio?: number;
}): SampledEffectParticle[] {
	const config = VARIANT_CONFIG[stage.variant];
	const density = Math.min(1, Math.max(0, stage.density));
	const count = Math.max(1, Math.round(config.baseCount * density));
	const speed = stage.speed <= 0 ? 1 : stage.speed;
	const particles: SampledEffectParticle[] = [];

	for (let index = 0; index < count; index += 1) {
		const seedX = hash01({ seed: index + 1 });
		const seedY = hash01({ seed: index + 101 });
		const seedSize = hash01({ seed: index + 211 });
		const seedPhase = hash01({ seed: index + 307 });
		const seedRotation = hash01({ seed: index + 401 });

		const travel = config.fallPerSecond * speed * timeSeconds;
		const rawY = seedY + travel;
		const y = config.twinkle
			? seedY
			: positiveModulo({ value: rawY, modulus: 1.2 }) - 0.1;

		const swayPhase = seedPhase * Math.PI * 2 + timeSeconds * speed * 1.1;
		const sway = Math.sin(swayPhase) * config.swayAmplitude;
		const x = positiveModulo({ value: seedX + sway, modulus: 1 });

		const size =
			(config.sizeMin + seedSize * (config.sizeMax - config.sizeMin)) /
			Math.sqrt(Math.max(0.5, aspectRatio) / (16 / 9));

		const twinkle = config.twinkle
			? 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(swayPhase * 1.7))
			: 1;
		const opacity = Math.min(1, Math.max(0, stage.opacity)) * twinkle;

		const rotation =
			(seedRotation * 360 + timeSeconds * speed * 40 * (seedX > 0.5 ? 1 : -1)) %
			360;

		particles.push({ x, y, size, rotation, opacity });
	}

	return particles;
}
