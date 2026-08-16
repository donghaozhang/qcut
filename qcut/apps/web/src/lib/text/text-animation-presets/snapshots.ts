import type {
	TextAnimationEdgePhase,
	TextAnimationLoopPhase,
	TextAnimationsV1,
} from "@/types/timeline";

import { getTextAnimationPreset } from "./catalog";
import { easingForPreset, effectForPreset, sequenceForPreset } from "./effects";
import type {
	TextAnimationPhase,
	TextAnimationPresetDefinition,
} from "./types";

const RESTART_LOOP_PRESET_IDS = new Set([
	"pulse",
	"rotate",
	"shimmer",
	"sway",
	"wave",
	"flip",
	"ring-orbit",
	"jitter",
	"vortex",
	"pendulum",
	"zoom-each",
	"wave-squeeze",
	"fold",
	"arc-up",
	// Ballistic bursts must not alternate: a reversed cycle would suck the
	// particles back into the emitter.
	"lucky-bag",
	// The tint window opens outward every cycle; alternating would close it.
	"color-bounce",
	// T-script ports whose cycles do not return to their start pose (their
	// transcription notes flag loopSafeAlternate: false), plus the stepped
	// palette rotations, which sweep one direction like 变色弹跳.
	"space-flip-i",
	"space-flip-ii",
	"scream-shake",
	"graffiti-doodle",
	"rainbow-mocha",
	"rainbow-macaron",
	"rainbow-new-year",
	"rainbow-valentine",
	// AEData ports whose cycle ends away from its start pose: the wave keeps
	// travelling one way, and the reveal counts characters up.
	"wave-glide",
	"one-by-one-reveal",
]);

function isLoopPreset({
	preset,
}: {
	preset: TextAnimationPresetDefinition;
}): boolean {
	return preset.phase === "loop";
}

export function createTextAnimationPhaseSnapshot({
	delay,
	duration,
	preset,
}: {
	preset: TextAnimationPresetDefinition;
	delay?: number;
	duration?: number;
}): TextAnimationEdgePhase | TextAnimationLoopPhase {
	const resolvedDelay = delay ?? preset.defaultDelay;
	const resolvedDuration = duration ?? preset.defaultDuration;
	const effect = effectForPreset({
		phase: preset.phase,
		presetId: preset.id,
	});
	const sequence = sequenceForPreset({
		phase: preset.phase,
		presetId: preset.id,
	});
	const base: TextAnimationEdgePhase = {
		sourcePreset: { id: preset.id, version: 1 },
		timing: {
			duration: resolvedDuration,
			delay: resolvedDelay,
			easing: easingForPreset({
				phase: preset.phase,
				presetId: preset.id,
			}),
		},
		sequence,
		// Shatter rasterises the whole element and burst emits from the layout
		// centre, so both are container-level regardless of the sequence unit —
		// a per-unit target would silently drop shatter or duplicate particles.
		target:
			effect.kind === "shatter" || effect.kind === "burst"
				? "textAndBackground"
				: effect.kind === "typewriter" ||
						effect.kind === "laser" ||
						effect.kind === "heart" ||
						sequence.unit !== "all"
					? "text"
					: "textAndBackground",
		effect,
	};

	if (!isLoopPreset({ preset })) return base;

	return {
		...base,
		repeat: {
			mode: RESTART_LOOP_PRESET_IDS.has(preset.id) ? "restart" : "alternate",
			gap: 0,
			phaseOffset: 0,
		},
	};
}

export function applyTextAnimationPreset({
	animations,
	preset,
}: {
	animations: TextAnimationsV1 | undefined;
	preset: TextAnimationPresetDefinition;
}): TextAnimationsV1 {
	if (preset.id === "none") {
		return {
			schemaVersion: 1,
			...(preset.phase === "entrance" || !animations?.entrance
				? {}
				: { entrance: animations.entrance }),
			...(preset.phase === "exit" || !animations?.exit
				? {}
				: { exit: animations.exit }),
			...(preset.phase === "loop" || !animations?.loop
				? {}
				: { loop: animations.loop }),
		};
	}

	return {
		...animations,
		schemaVersion: 1,
		[preset.phase]: createTextAnimationPhaseSnapshot({ preset }),
	};
}

export function getTextAnimationPhase({
	animations,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	phase: TextAnimationPhase;
}): TextAnimationEdgePhase | TextAnimationLoopPhase | undefined {
	return animations?.[phase];
}

export function getSelectedTextAnimationPreset({
	animations,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	phase: TextAnimationPhase;
}): TextAnimationPresetDefinition {
	return getTextAnimationPreset({
		phase,
		presetId: animations?.[phase]?.sourcePreset?.id,
	});
}

export function updateTextAnimationPhaseTiming({
	animations,
	delay,
	duration,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	delay?: number;
	duration?: number;
	phase: TextAnimationPhase;
}): TextAnimationsV1 {
	const preset = getSelectedTextAnimationPreset({ animations, phase });
	const current =
		animations?.[phase] ?? createTextAnimationPhaseSnapshot({ preset });
	return {
		...animations,
		schemaVersion: 1,
		[phase]: {
			...current,
			timing: {
				...current.timing,
				duration: duration ?? current.timing.duration,
				delay: delay ?? current.timing.delay,
			},
		},
	};
}
