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

/** Jianying's Transform.lua slides use Amaz.Ease.quadOut. */
const EASE_OUT_QUAD: TextAnimationEasing = {
	type: "cubicBezier",
	x1: 0.25,
	y1: 0.46,
	x2: 0.45,
	y2: 0.94,
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
			// Jianying renders a solid block cursor that stays lit while typing
			// and vanishes as soon as the animation completes.
			return {
				kind: "typewriter",
				reveal: "step",
				cursor: { text: "█", blinkPeriod: 0.5, persist: false },
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
		case "entrance:typewriter-rhythm":
			// Jianying's human-rhythm typewriter: fixed 14-entry weight table,
			// thick block caret. Weights from the package's TextAnim.lua.
			return {
				kind: "typewriter",
				reveal: "step",
				rhythm: [
					0.86, 1.35, 0.62, 5.2, 0.25, 0.96, 0.35, 4.55, 0.03, 0.82, 0.2, 1.26,
					0.36, 0.1,
				],
				cursor: { text: "▌", blinkPeriod: 0.5, persist: false },
			};
		case "entrance:flip-open":
			// Jianying 翻动: per-character X-only unfold from zero width with a
			// small settle wobble (piecewise easy-ease approximated by overshoot).
			return {
				kind: "scale",
				hiddenScale: 0,
				overshoot: 0.08,
				fade: false,
				axis: "x",
			};
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
			// Jianying's 文字渐显 fades the whole block in while it grows
			// slightly into place (plus a glow pulse we approximate away).
			return { kind: "scale", hiddenScale: 0.9, overshoot: 0, fade: true };
		case "entrance:fade-text":
			// Jianying's 淡入文字 dissolves the whole block from a soft blur
			// while fading in.
			return { kind: "blur", radiusPx: 12, fade: true };
		case "exit:fade-out":
		case "loop:flicker":
			return {
				kind: "fade",
				minimumOpacity: presetId === "flicker" ? 0.35 : 0,
			};
		case "entrance:slide-up":
			// Jianying's Transform.lua offsets the whole block by
			// 1.33 × its own height (2.66 × textureH in half-screen units).
			return {
				kind: "slide",
				direction: "up",
				distance: { value: 1.33, unit: "boxHeight" },
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
		case "loop:sway":
			return {
				kind: "rotate",
				degrees: 20,
				fade: false,
				oscillation: {
					cycles: 1,
					phaseEasing: "smoothstep",
					pivot: "bottomCenter",
				},
			};
		case "loop:flip":
			// Jianying's 空间翻转 III: planar swing plus a perspective scale
			// gradient across the line, 90° out of phase with the tilt.
			return { kind: "flip", maxAngleDeg: 32, perspective: 0.35 };
		case "loop:ring-orbit":
			// Jianying's 环绕 lays the characters out around a ring: each one
			// runs the same circle, phase-spread across the whole cycle, and
			// orbit's own rotationDeg keeps every glyph on its tangent.
			return {
				kind: "orbit",
				rotation: "clockwise",
				turns: 1,
				radius: { value: 1.05, unit: "boxHeight" },
				ring: true,
				fade: false,
			};
		case "loop:jitter":
			// Jianying's stepped shake: local time floored to quarters, offsets
			// from sine products keyed on the unit's rank.
			return { kind: "jitter", steps: 4, amplitudeX: 0.04, amplitudeY: 0.027 };
		case "loop:vortex":
			// Jianying's 漩涡 (their Lua: translate.x = sin(2πt)·charW,
			// translate.y = cos(2πt), per-char phase window) — a small circle
			// per character with no glyph spin.
			return {
				kind: "orbit",
				rotation: "clockwise",
				turns: 1,
				radius: { value: 0.35, unit: "em" },
				spin: false,
				fade: false,
			};
		case "loop:pendulum":
			return {
				kind: "rotate",
				degrees: 16,
				oscillation: {
					cycles: 1,
					phaseEasing: "smoothstep",
					pivot: "bottomCenter",
				},
				fade: false,
			};
		case "loop:zoom-each":
			// 逐字放大: each character swells in sequence via the loop's
			// cyclic stagger.
			return {
				kind: "scale",
				hiddenScale: 1.5,
				overshoot: 0,
				fade: false,
				pulse: { cycles: 1, easing: "smoothstep" },
			};
		case "loop:wave-squeeze":
			return { kind: "squeeze", amount: 0.45, spatialCycles: 1.2 };
		case "loop:fold":
			return { kind: "fold", minimumScale: 0.05, phaseStepDeg: 90 };
		case "loop:arc-up":
			return { kind: "arc", riseEm: 0.45, tiltDeg: 14 };
		case "exit:spiral-down":
			return {
				kind: "spiral",
				turns: 1.25,
				radius: { value: 0.8, unit: "em" },
				drop: { value: 1.1, unit: "boxHeight" },
				fade: true,
			};
		case "exit:elastic-out":
			// The stretch-then-collapse lives in the scale overshoot: raw
			// spring easing overshoots past 1 early in the exit and clamps the
			// presence to zero, vanishing the text at a quarter progress.
			return {
				kind: "scale",
				hiddenScale: 0,
				overshoot: 0.45,
				fade: true,
			};
		case "exit:fly-up-out":
			return {
				kind: "slide",
				direction: "up",
				distance: { value: 1.3, unit: "boxHeight" },
				fade: true,
			};
		case "exit:flicker-scatter":
			return {
				kind: "scatter",
				distance: { value: 1.6, unit: "em" },
				flicker: true,
				rotateDeg: 40,
				seed: presetSeed({ presetId }),
			};
		case "exit:random-fly-out":
			return {
				kind: "scatter",
				distance: { value: 2.4, unit: "em" },
				flicker: false,
				rotateDeg: 70,
				seed: presetSeed({ presetId }),
			};
		case "exit:shrink-shake":
			return {
				kind: "scale",
				shakeEm: 0.06,
				hiddenScale: 0.15,
				overshoot: 0,
				fade: true,
			};
		case "entrance:scale-up":
			// Jianying's EnlargeIn.lua: scale 0.5 -> 1 and alpha 0 -> 1, both
			// quadOut, with no overshoot.
			return { kind: "scale", hiddenScale: 0.5, overshoot: 0, fade: true };
		case "entrance:pop-in":
			// Jianying's BounceIn.lua settles through an elastic-out curve from
			// roughly a third of the final size.
			return { kind: "scale", hiddenScale: 0.3, overshoot: 0.16, fade: true };
		case "exit:scale-down-out":
			return { kind: "scale", hiddenScale: 0.2, overshoot: 0, fade: true };
		case "loop:pulse":
			return {
				kind: "scale",
				hiddenScale: 0.85,
				overshoot: 0,
				fade: false,
				pulse: { cycles: 5, easing: "smoothstep" },
			};
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
			return {
				kind: "bounce",
				direction: "up",
				distance: { value: 0.14, unit: "boxHeight" },
				hiddenScale: 1,
				spring: BOUNCE_SPRING,
			};
		case "loop:wave":
			return {
				kind: "bounce",
				direction: "up",
				distance: { value: 0.2, unit: "em" },
				hiddenScale: 1,
				spring: BOUNCE_SPRING,
				spatialWave: { spatialCycles: 0.75, phaseOffset: 0 },
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

function staggerRatioForPreset({
	isGraphemePreset,
	presetId,
}: {
	isGraphemePreset: boolean;
	presetId: string;
}): number {
	if (
		!isGraphemePreset ||
		presetId === "wave" ||
		presetId === "sway" ||
		presetId === "jitter" ||
		presetId === "flip" ||
		// Spatially phased or seeded per unit inside the effect itself.
		presetId === "wave-squeeze" ||
		presetId === "fold" ||
		presetId === "arc-up" ||
		presetId === "flicker-scatter" ||
		presetId === "random-fly-out" ||
		presetId === "shrink-shake"
	) {
		return 0;
	}
	if (presetId === "flip-open") return 0.83;
	// Spreading phases across nearly the whole cycle is what turns orbit's
	// shared circle into Jianying's ring layout.
	if (presetId === "ring-orbit") return 0.95;
	// Jianying's 漩涡 spreads its per-char windows across most of the cycle.
	if (presetId === "vortex") return 0.8;
	if (presetId === "spiral-down") return 0.3;
	if (presetId === "fly-up-out") return 0.4;
	return 0.58;
}

export function sequenceForPreset({
	phase,
	presetId,
}: {
	phase: TextAnimationPhase;
	presetId: string;
}): TextAnimationSequence {
	// fade-characters is intentionally absent: Jianying's 文字渐显 fades the
	// whole block at once rather than staggering per grapheme.
	const graphemePresets = new Set([
		"flip-open",
		"typewriter-rhythm",
		"typewriter-cursor",
		"typewriter-leading",
		"typewriter-i",
		"typewriter-ii",
		"typewriter-preview",
		"typewriter-iv",
		"cursor-typewriter",
		"typewriter-out",
		"laser-etch",
		"sway",
		"wave",
		"jitter",
		"ring-orbit",
		"flip",
		"vortex",
		"zoom-each",
		"wave-squeeze",
		"fold",
		"arc-up",
		"spiral-down",
		"fly-up-out",
		"flicker-scatter",
		"random-fly-out",
		"shrink-shake",
	]);
	const order = presetId === "typewriter-out" ? "reverse" : "forward";
	const staggerRatio = staggerRatioForPreset({
		isGraphemePreset: graphemePresets.has(presetId),
		presetId,
	});

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
	if (presetId === "flip-open") {
		// Amaz.Ease easy-ease from the 翻动 package's AE curve table.
		return { type: "cubicBezier", x1: 0.33333, y1: 0, x2: 0.66667, y2: 1 };
	}
	if (
		presetId.includes("bounce") ||
		presetId === "pop-in" ||
		presetId === "heartbeat"
	) {
		return SOFT_SPRING;
	}
	if (presetId === "slide-up" || presetId === "scale-up") {
		return EASE_OUT_QUAD;
	}
	return NATURAL_EASE;
}
