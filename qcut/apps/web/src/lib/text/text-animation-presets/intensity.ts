import type { TextAnimationEffect, TextAnimationsV1 } from "@/types/timeline";

import {
	createTextAnimationPhaseSnapshot,
	getSelectedTextAnimationPreset,
} from "./snapshots";
import type {
	TextAnimationPhase,
	TextAnimationPresetDefinition,
} from "./types";

export function textAnimationPresetSupportsIntensity({
	preset,
}: {
	preset: TextAnimationPresetDefinition;
}): boolean {
	return !["none", "fade", "typewriter"].includes(preset.previewKind);
}

function scaleEffectIntensity({
	effect,
	factor,
}: {
	effect: TextAnimationEffect;
	factor: number;
}): TextAnimationEffect {
	switch (effect.kind) {
		case "slide":
			return {
				...effect,
				distance: { ...effect.distance, value: effect.distance.value * factor },
			};
		case "blur":
			return {
				...effect,
				radiusPx: effect.radiusPx * factor,
				...(effect.distance
					? {
							distance: {
								...effect.distance,
								value: effect.distance.value * factor,
							},
						}
					: {}),
			};
		case "rotate":
			return {
				...effect,
				degrees: effect.degrees * factor,
				...(effect.distance
					? {
							distance: {
								...effect.distance,
								value: effect.distance.value * factor,
							},
						}
					: {}),
			};
		case "scale":
			return {
				...effect,
				hiddenScale: 1 - (1 - effect.hiddenScale) * factor,
				overshoot: effect.overshoot * factor,
			};
		case "bounce":
			return {
				...effect,
				distance: { ...effect.distance, value: effect.distance.value * factor },
				hiddenScale: 1 - (1 - effect.hiddenScale) * factor,
			};
		case "orbit":
			return {
				...effect,
				turns: effect.turns * factor,
				radius: { ...effect.radius, value: effect.radius.value * factor },
			};
		case "laser":
			return {
				...effect,
				glowPx: effect.glowPx * factor,
				thicknessPx: Math.max(1, effect.thicknessPx * factor),
				trail: Math.min(1, effect.trail * factor),
			};
		case "heart":
			return {
				...effect,
				distance: { ...effect.distance, value: effect.distance.value * factor },
				hiddenScale: 1 - (1 - effect.hiddenScale) * factor,
				spread: effect.spread * factor,
			};
		case "flip3d":
			return {
				...effect,
				maxAngleDeg: effect.maxAngleDeg * factor,
			};
		case "cylinder3d":
			return {
				...effect,
				turns: effect.turns * factor,
				tiltXDeg: effect.tiltXDeg * factor,
			};
		case "jitter3d":
			return {
				...effect,
				groupYawDeg: effect.groupYawDeg * factor,
				rotationXDeg: effect.rotationXDeg * factor,
				rotationYDeg: effect.rotationYDeg * factor,
				rotationZDeg: effect.rotationZDeg * factor,
				positionJitter: effect.positionJitter * factor,
				trailStrength: effect.trailStrength * factor,
				trapezoidAmount: effect.trapezoidAmount * factor,
			};
		default:
			return effect;
	}
}

function primaryEffectAmplitude({
	effect,
}: {
	effect: TextAnimationEffect;
}): number {
	switch (effect.kind) {
		case "slide":
		case "bounce":
			return Math.abs(effect.distance.value);
		case "blur":
			return Math.abs(effect.radiusPx);
		case "rotate":
			return Math.abs(effect.degrees);
		case "scale":
			return Math.abs(1 - effect.hiddenScale);
		case "orbit":
			return Math.abs(effect.radius.value);
		case "laser":
			return Math.abs(effect.glowPx);
		case "heart":
			return Math.abs(effect.spread);
		case "flip3d":
			return Math.abs(effect.maxAngleDeg);
		case "cylinder3d":
			return Math.abs(effect.turns);
		case "jitter3d":
			return Math.abs(effect.rotationXDeg);
		default:
			return 1;
	}
}

export function getTextAnimationPhaseIntensity({
	animations,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	phase: TextAnimationPhase;
}): number {
	const preset = getSelectedTextAnimationPreset({ animations, phase });
	const current = animations?.[phase];
	if (!current || !textAnimationPresetSupportsIntensity({ preset })) {
		return preset.defaultIntensity;
	}

	const base = createTextAnimationPhaseSnapshot({ preset });
	const baseAmplitude = primaryEffectAmplitude({ effect: base.effect });
	if (baseAmplitude <= 0) return preset.defaultIntensity;

	return Math.min(
		1,
		Math.max(
			0,
			(primaryEffectAmplitude({ effect: current.effect }) / baseAmplitude) *
				preset.defaultIntensity
		)
	);
}

export function updateTextAnimationPhaseIntensity({
	animations,
	intensity,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	intensity: number;
	phase: TextAnimationPhase;
}): TextAnimationsV1 {
	const preset = getSelectedTextAnimationPreset({ animations, phase });
	const current =
		animations?.[phase] ?? createTextAnimationPhaseSnapshot({ preset });
	const normalizedIntensity = Math.min(1, Math.max(0, intensity));
	const base = createTextAnimationPhaseSnapshot({
		preset,
		duration: current.timing.duration,
		delay: current.timing.delay,
	});
	const factor =
		preset.defaultIntensity <= 0
			? normalizedIntensity
			: normalizedIntensity / preset.defaultIntensity;

	return {
		...animations,
		schemaVersion: 1,
		[phase]: {
			...current,
			effect: scaleEffectIntensity({ effect: base.effect, factor }),
		},
	};
}
