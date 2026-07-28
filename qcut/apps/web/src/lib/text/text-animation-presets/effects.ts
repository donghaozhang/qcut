import type {
	TextAnimationEffect,
	TextAnimationEasing,
	TextAnimationSequence,
} from "@/types/timeline";

import type { TextAnimationPhase } from "./types";

const NATURAL_EASE: TextAnimationEasing = {
	type: "cubicBezier",
	x1: 0.22,
	y1: 1,
	x2: 0.36,
	y2: 1,
};

const SOFT_SPRING: TextAnimationEasing = {
	type: "spring",
	mass: 1,
	stiffness: 170,
	damping: 18,
	velocity: 0,
};

const BOUNCE_SPRING = {
	mass: 1,
	stiffness: 210,
	damping: 14,
	velocity: 0,
} as const;

function presetSeed({ presetId }: { presetId: string }): number {
	let seed = 2166136261;
	for (const character of presetId) {
		seed ^= character.codePointAt(0) ?? 0;
		seed = Math.imul(seed, 16777619);
	}
	return seed >>> 0;
}

export function effectForPreset({
	phase,
	presetId,
}: {
	phase: TextAnimationPhase;
	presetId: string;
}): TextAnimationEffect {
	switch (`${phase}:${presetId}`) {
		case "entrance:typewriter-cursor":
			return {
				kind: "typewriter",
				reveal: "step",
				cursor: { text: "|", blinkPeriod: 0.5, persist: true },
			};
		case "entrance:typewriter-leading":
			return {
				kind: "typewriter",
				reveal: "wipe",
				cursor: { text: "<", blinkPeriod: 0.55, persist: false },
			};
		case "entrance:typewriter-ii":
			return {
				kind: "typewriter",
				reveal: "fade",
				cursor: { text: "|", blinkPeriod: 0.65, persist: false },
			};
		case "entrance:typewriter-preview":
			return { kind: "typewriter", reveal: "fade" };
		case "entrance:typewriter-iv":
			return { kind: "typewriter", reveal: "wipe" };
		case "entrance:typewriter-i":
			return { kind: "typewriter", reveal: "step" };
		case "entrance:cursor-typewriter":
			return {
				kind: "typewriter",
				reveal: "step",
				cursor: { text: "_", blinkPeriod: 0.3, persist: false },
			};
		case "exit:typewriter-out":
			return {
				kind: "typewriter",
				reveal: "step",
				cursor: { text: "|", blinkPeriod: 0.45, persist: false },
			};
		case "entrance:fade-characters":
		case "entrance:fade-text":
		case "exit:fade-out":
		case "loop:flicker":
			return {
				kind: "fade",
				minimumOpacity: presetId === "flicker" ? 0.35 : 0,
			};
		case "entrance:slide-up":
			return {
				kind: "slide",
				direction: "up",
				distance: { value: 0.16, unit: "boxHeight" },
				fade: true,
			};
		case "exit:slide-down-out":
			return {
				kind: "slide",
				direction: "down",
				distance: { value: 0.2, unit: "boxHeight" },
				fade: true,
			};
		case "exit:slide-right-out":
			return {
				kind: "slide",
				direction: "right",
				distance: { value: 0.22, unit: "boxWidth" },
				fade: true,
			};
		case "loop:float":
			return {
				kind: "slide",
				direction: "up",
				distance: { value: 0.08, unit: "boxHeight" },
				fade: false,
			};
		case "entrance:blur-slide-right-ii":
			return {
				kind: "blur",
				direction: "right",
				distance: { value: 0.2, unit: "boxWidth" },
				radiusPx: 14,
				fade: true,
			};
		case "exit:blur-out":
			return { kind: "blur", radiusPx: 18, fade: true };
		case "entrance:rotate-fly-in":
			return {
				kind: "rotate",
				degrees: -40,
				travelDirection: "right",
				distance: { value: 0.22, unit: "boxWidth" },
				fade: true,
			};
		case "entrance:rotate-in":
			return { kind: "rotate", degrees: -180, fade: true };
		case "exit:rotate-out":
			return { kind: "rotate", degrees: 150, fade: true };
		case "loop:rotate":
			return { kind: "rotate", degrees: 360, fade: false };
		case "entrance:scale-up":
			return { kind: "scale", hiddenScale: 0.35, overshoot: 0.04, fade: true };
		case "entrance:pop-in":
			return { kind: "scale", hiddenScale: 0.15, overshoot: 0.16, fade: true };
		case "exit:scale-down-out":
			return { kind: "scale", hiddenScale: 0.2, overshoot: 0, fade: true };
		case "loop:pulse":
			return { kind: "scale", hiddenScale: 0.94, overshoot: 0.04, fade: false };
		case "loop:heartbeat":
			return { kind: "scale", hiddenScale: 0.86, overshoot: 0.12, fade: false };
		case "loop:breathe":
			return { kind: "scale", hiddenScale: 0.96, overshoot: 0.02, fade: false };
		case "entrance:bounce-up":
			return {
				kind: "bounce",
				direction: "up",
				distance: { value: 0.24, unit: "boxHeight" },
				hiddenScale: 0.75,
				spring: BOUNCE_SPRING,
			};
		case "loop:bounce":
		case "loop:wave":
			return {
				kind: "bounce",
				direction: "up",
				distance: {
					value: presetId === "wave" ? 0.1 : 0.14,
					unit: "boxHeight",
				},
				hiddenScale: 1,
				spring: BOUNCE_SPRING,
			};
		case "entrance:orbit-disappear":
			return {
				kind: "orbit",
				rotation: "clockwise",
				turns: 1,
				radius: { value: 0.32, unit: "boxWidth" },
				fade: true,
			};
		case "exit:orbit-out":
			return {
				kind: "orbit",
				rotation: "counterclockwise",
				turns: 1.25,
				radius: { value: 0.4, unit: "boxWidth" },
				fade: true,
			};
		case "entrance:laser-etch":
		case "loop:shimmer":
			return {
				kind: "laser",
				direction: "right",
				color: presetId === "shimmer" ? "#ffffff" : "#22d3ee",
				thicknessPx: 2,
				glowPx: presetId === "shimmer" ? 8 : 14,
				trail: presetId === "shimmer" ? 0.3 : 0.55,
				fade: presetId !== "shimmer",
			};
		case "entrance:heart-bounce":
			return {
				kind: "heart",
				direction: "up",
				distance: { value: 0.2, unit: "boxHeight" },
				hiddenScale: 0.55,
				color: "#fb7185",
				particleCount: 6,
				spread: 0.65,
				seed: presetSeed({ presetId }),
			};
		default:
			return { kind: "fade", minimumOpacity: 1 };
	}
}

export function sequenceForPreset({
	phase,
	presetId,
}: {
	phase: TextAnimationPhase;
	presetId: string;
}): TextAnimationSequence {
	const graphemePresets = new Set([
		"typewriter-cursor",
		"typewriter-leading",
		"typewriter-i",
		"typewriter-ii",
		"typewriter-preview",
		"typewriter-iv",
		"cursor-typewriter",
		"typewriter-out",
		"fade-characters",
		"laser-etch",
		"wave",
	]);
	const order = presetId === "typewriter-out" ? "reverse" : "forward";
	const staggerRatio = graphemePresets.has(presetId)
		? presetId === "wave"
			? 0.7
			: 0.58
		: 0;

	return {
		unit: graphemePresets.has(presetId) ? "grapheme" : "all",
		order,
		staggerRatio,
		seed: presetSeed({ presetId: `${phase}:${presetId}` }),
	};
}

export function easingForPreset({
	phase,
	presetId,
}: {
	phase: TextAnimationPhase;
	presetId: string;
}): TextAnimationEasing {
	if (phase === "loop" || presetId === "bounce-up") {
		return "linear";
	}
	if (presetId.includes("typewriter") || presetId === "cursor-typewriter") {
		return "linear";
	}
	if (
		presetId.includes("bounce") ||
		presetId === "pop-in" ||
		presetId === "heartbeat"
	) {
		return SOFT_SPRING;
	}
	return NATURAL_EASE;
}
