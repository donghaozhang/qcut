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
		case "entrance:fade-reveal":
			// Jianying's 淡入显现 (7660451431320669481), transcribed verbatim
			// from its plaintext studioAnim.lsanim keyframe tracks: fade + rise
			// from 0.5 em below + slight Y swivel + 0.8→1 uniform scale, all
			// settling at 2/3 of the phase. This preset is pure data — the
			// declarative keyframes interpreter plays it.
			return {
				kind: "keyframes",
				channels: {
					opacity: [
						{ t: 0, v: 0 },
						{ t: 2 / 3, v: 1 },
						{ t: 1, v: 1 },
					],
					translateYEm: [
						{ t: 0, v: 0.5 },
						{ t: 2 / 3, v: 0 },
						{ t: 1, v: 0 },
					],
					rotationYDeg: [
						{ t: 0, v: -5 },
						{ t: 2 / 3, v: 0 },
						{ t: 1, v: 0 },
					],
					scaleX: [
						{ t: 0, v: 0.8 },
						{ t: 2 / 3, v: 1 },
						{ t: 1, v: 1 },
					],
					scaleY: [
						{ t: 0, v: 0.8 },
						{ t: 2 / 3, v: 1 },
						{ t: 1, v: 1 },
					],
				},
			};
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
		case "loop:flip-3d":
			return {
				kind: "flip3d",
				axis: "y",
				maxAngleDeg: 60,
				cameraFovDeg: 30,
				motionRatio: 0.8,
				motionEasing: {
					type: "cubicBezier",
					x1: 0.55,
					y1: 0.06,
					x2: 0.4,
					y2: 0.96,
				},
			};
		case "loop:cylinder-3d":
			return {
				kind: "cylinder3d",
				turns: 1,
				tiltXDeg: 20,
				cameraFovDeg: 60,
				coverage: 5 / 6,
				radiusRatio: 1.2 / (Math.PI * 2),
				startYawDeg: 540,
			};
		case "loop:jitter-3d":
			return {
				kind: "jitter3d",
				cameraFovDeg: 60,
				groupYawDeg: 20,
				rotationXDeg: 15,
				rotationYDeg: 15,
				rotationZDeg: 10,
				positionJitter: 0.03,
				scaleFrom: 2 / 3,
				scaleTo: 1,
				frequency: 12,
				seed: presetSeed({ presetId }),
				trailSamples: 12,
				trailStrength: 0.65,
				trapezoidAmount: 0.12,
			};
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
		case "entrance:confetti-burst":
			// 彩带喷射: ribbons fountain upward from the text and rain back
			// down while the text holds. Palette and fan pending calibration
			// against the Jianying capture.
			return {
				kind: "burst",
				shape: "ribbon",
				count: 46,
				speed: { value: 5, unit: "em" },
				directionDeg: 0,
				spreadDeg: 360,
				gravity: { value: 1.6, unit: "em" },
				lifeRandom: 0.45,
				sizeEm: 0.2,
				sizeRandom: 0.45,
				rays: { count: 24, length: { value: 3.4, unit: "em" } },
				palette: [
					"#f43f5e",
					"#fb923c",
					"#facc15",
					"#22c55e",
					"#3b82f6",
					"#a855f7",
				],
				flutter: 0.8,
				seed: presetSeed({ presetId }),
			};
		case "loop:lucky-bag":
			// 福袋炸开: coins pop out in every direction each cycle.
			return {
				kind: "burst",
				shape: "coin",
				count: 20,
				speed: { value: 3.2, unit: "em" },
				directionDeg: 0,
				spreadDeg: 360,
				gravity: { value: 1.1, unit: "em" },
				lifeRandom: 0.4,
				sizeEm: 0.5,
				sizeRandom: 0.7,
				palette: ["#fbbf24", "#f59e0b", "#fde68a", "#ef4444"],
				flutter: 0.25,
				seed: presetSeed({ presetId }),
			};
		case "loop:color-bounce":
			// 变色弹跳, calibrated from the plaintext package (7522411659407789353):
			// a feathered window sweeps outward tinting characters pure yellow
			// [1,1,0] and lifting them 0.2 em; both hold until the cycle restarts.
			return {
				kind: "colorCycle",
				palette: ["#ffff00"],
				amount: 1,
				cycles: 1,
				rankOffset: 0,
				stepped: false,
				envelope: "hold",
				bounceEm: 0.2,
			};
		case "exit:particle-shatter":
			// LumiDust port: noise dissolve front, seeded tile drift, gravity.
			return {
				kind: "shatter",
				tilePx: 4,
				// Fitted against the reference 25/50/75% frames: released dust
				// sparkles roughly in place rather than migrating off the glyph,
				// so the drift stays a fraction of the em box. Distances are
				// magnitudes (normalization clamps negatives to zero), so the
				// upward direction rides on gravityRotDeg.
				distortion: 0.18,
				gravity: { value: 0.22, unit: "em" },
				gravityRotDeg: 180,
				front: "noise",
				frontRotDeg: 0,
				// A wide feather is what makes the mid-exit frame read as a dense
				// sparkle mass instead of a hard erosion edge.
				feather: 0.5,
			};
		case "exit:spiral-down":
			// Reference tumbles at full brightness and vanishes by falling
			// away, not by fading.
			return {
				kind: "spiral",
				turns: 1.25,
				radius: { value: 1.4, unit: "em" },
				drop: { value: 1.2, unit: "boxHeight" },
				fade: false,
			};
		case "exit:elastic-out":
			// Captured reference: characters tumble upside down while they
			// shrink away, staggered — a half-turn tumble with a slight drop.
			return {
				kind: "tumble",
				spinDeg: 180,
				drop: { value: 0.3, unit: "em" },
				fade: false,
			};
		case "exit:fly-up-out":
			// Their Lua: translate {0,2000,0}→0 reversed, per-char window of
			// only 10% of the phase, motion blur from a shader. The blur
			// effect gives us slide + blur in one.
			return {
				kind: "blur",
				direction: "up",
				distance: { value: 2, unit: "boxHeight" },
				radiusPx: 12,
				fade: false,
			};
		case "exit:flicker-scatter":
			// Captured reference: units strobe near home and drift apart only
			// late in the exit.
			return {
				kind: "scatter",
				distance: { value: 1.2, unit: "em" },
				flicker: true,
				rotateDeg: 20,
				seed: presetSeed({ presetId }),
			};
		case "exit:random-fly-out":
			// RotateFlyOut.lua: scale 1→0, rotate 0→-720°, drop 1.5–2.5 char
			// heights, cubic-in, in shuffled per-char order.
			return {
				kind: "tumble",
				spinDeg: -720,
				drop: { value: 2, unit: "em" },
				fade: false,
			};
		case "exit:shrink-shake":
			// Reference stays big and bright as a motion-blur smear; only the
			// scale collapse ends it.
			return {
				kind: "scale",
				shakeEm: 0.09,
				hiddenScale: 0.3,
				overshoot: 0,
				fade: false,
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
		presetId === "jitter-3d" ||
		presetId === "flip" ||
		// Spatially phased or seeded per unit inside the effect itself.
		presetId === "wave-squeeze" ||
		presetId === "fold" ||
		presetId === "arc-up" ||
		presetId === "flicker-scatter" ||
		presetId === "shrink-shake"
	) {
		return 0;
	}
	if (presetId === "flip-open") return 0.83;
	// 变色弹跳's window front takes most of the cycle to sweep the line.
	if (presetId === "color-bounce") return 0.7;
	// Spreading phases across nearly the whole cycle is what turns orbit's
	// shared circle into Jianying's ring layout.
	if (presetId === "ring-orbit") return 0.95;
	// Jianying's 漩涡 spreads its per-char windows across most of the cycle.
	if (presetId === "vortex") return 0.8;
	if (presetId === "spiral-down") return 0.3;
	// Their Lua gives each character a window of only 10% of the phase.
	if (presetId === "fly-up-out") return 0.9;
	// RotateFlyOut spreads shuffled start times across 60% of the phase.
	if (presetId === "random-fly-out" || presetId === "elastic-out") return 0.6;
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
		"jitter-3d",
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
		"elastic-out",
		"color-bounce",
	]);
	const order =
		presetId === "typewriter-out"
			? "reverse"
			: presetId === "random-fly-out" || presetId === "elastic-out"
				? "random"
				: // Reference 变色弹跳: the tint window opens from the text center
					// outward, so the color front reaches both ends last.
					presetId === "color-bounce"
					? "centerOut"
					: "forward";
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
	if (
		presetId === "particle-shatter" ||
		presetId === "confetti-burst" ||
		presetId === "fly-up-out" ||
		presetId === "elastic-out" ||
		presetId === "random-fly-out" ||
		presetId === "flicker-scatter" ||
		presetId === "spiral-down" ||
		presetId === "shrink-shake"
	) {
		// These effects carry their own drive curves (cubic-in tumble, squared
		// spiral drop, hold-then-drift scatter); their Lua references run on
		// linear time, and an eased phase would double-bend the motion.
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
