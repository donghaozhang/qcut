import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * TextAnim-family ports. These External_Producer packages pair AE-exported
 * keyframe tables (src/AE.lua) with a bespoke driver (src/TextMain.lua) that
 * decides the per-unit mapping, stagger, and any time-reversal. Documents are
 * transcribed from BOTH — the decoding method and the shared AE format are
 * recorded in docs/task/jianying-text-anim-port/TEXTANIM-FAMILY.md. Values are
 * scale/opacity ÷100, Y-sign flipped, with anchor-collapse compensation folded
 * into translateYEm. Conventions match keyframe-documents-entrance-a.ts.
 */

type Doc = TextKeyframeDocument;

export const ENTRANCE_TEXTANIM_DOCUMENTS: Record<string, Doc> = {
	// 剪映 随机上升 (7233662263805088314), transcribed from its AE tables +
	// TextMain driver. Characters reveal in shuffled order (array_shuffle),
	// each rising ~1.17 em from below and fading in over the first ~57% of its
	// window. The driver only applies the opacity track while t < 0.7, so the
	// track's late flicker keys are dead code and are dropped here.
	"random-rise": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0.19 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.167, outTime: 0.094 },
					{ t: 0.567, v: 1, inValue: 0.833, inTime: -0.094 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: 1.169 },
					{ t: 0.167, v: 0.379 },
					{ t: 0.333, v: 0.119 },
					{ t: 0.5, v: 0.024 },
					{ t: 0.667, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 站起 (7265288917279052344). Each glyph pivots up off its baseline:
	// the driver swings the character around a point 0.375 em below its centre
	// (polar placement in the source), so the rotation 90°→0 pairs with a
	// translate that starts right-and-below home and lands at zero. X is
	// squashed to 35% at the start (foreshortened while lying flat). Its window
	// is AE [7/30, 23/30] — the rising half of a track it shares with 躺下.
	"stand-up": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.2 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationDeg: [
					{ t: 0, v: 90 },
					{ t: 0.125, v: 82.61 },
					{ t: 0.25, v: 45 },
					{ t: 0.375, v: 22.785 },
					{ t: 0.5, v: 11.917 },
					{ t: 0.625, v: 5.767 },
					{ t: 0.75, v: 2.27 },
					{ t: 0.875, v: 0.512 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 0.35 },
					{ t: 0.125, v: 0.403 },
					{ t: 0.25, v: 0.675 },
					{ t: 0.375, v: 0.835 },
					{ t: 0.5, v: 0.914 },
					{ t: 0.625, v: 0.958 },
					{ t: 0.75, v: 0.984 },
					{ t: 0.875, v: 0.996 },
					{ t: 1, v: 1 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.125, v: 0.868 },
					{ t: 0.25, v: 1 },
					{ t: 1, v: 1 },
				],
				// Pivot placement: 0.375 em right and below home while flat,
				// resolving to zero as the glyph comes upright.
				translateXEm: [
					{ t: 0, v: 0.375 },
					{ t: 0.25, v: 0.265 },
					{ t: 0.5, v: 0.077 },
					{ t: 0.75, v: 0.015 },
					{ t: 1, v: 0 },
				],
				translateYEm: [
					{ t: 0, v: 0.375 },
					{ t: 0.25, v: 0.11 },
					{ t: 0.5, v: 0.008 },
					{ t: 0.75, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 波浪弹跳 (7317536986691015218). Characters spring up in mirrored
	// pairs spreading from the line centre outward, each dipping and settling
	// with a rotation whose sign flips per side (the driver's `polarity`).
	// centerOut carries the pairing; the per-character horizontal separation
	// (majorOffset, unique per index) is dropped — a shared document cannot
	// vary translateX amplitude per unit.
	"wave-bounce": {
		sequence: { unit: "grapheme", order: "centerOut", staggerRatio: 0.45 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.15, v: 1 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: 1.2 },
					{ t: 0.35, v: -0.18 },
					{ t: 0.6, v: 0.06 },
					{ t: 0.8, v: -0.02 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 0.55 },
					{ t: 0.35, v: 1.08 },
					{ t: 0.6, v: 0.98 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.55 },
					{ t: 0.35, v: 1.08 },
					{ t: 0.6, v: 0.98 },
					{ t: 1, v: 1 },
				],
				rotationDeg: [
					{ t: 0, v: -18 },
					{ t: 0.35, v: 6 },
					{ t: 0.65, v: -2 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 甩出 (7244102679851438650). A whip-in: each glyph swings in from the
	// left with a 151% elastic overshoot on both axes and a −32°→0 tilt,
	// staggered one frame apart. The X travel is scaled by line width in the
	// source (a per-line constant, preserved here as a fixed 1.34 em) and the
	// motion-blur pass is dropped.
	"whip-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.35 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: -1.34 },
					{ t: 0.125, v: -0.36 },
					{ t: 0.25, v: -0.05 },
					{ t: 0.375, v: 0.08 },
					{ t: 0.5, v: 0.06 },
					{ t: 0.75, v: 0.02 },
					{ t: 1, v: 0 },
				],
				translateYEm: [
					{ t: 0, v: -0.6 },
					{ t: 0.125, v: -0.21 },
					{ t: 0.25, v: 0.32 },
					{ t: 0.375, v: 0.37 },
					{ t: 0.5, v: 0.28 },
					{ t: 0.75, v: 0.03 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 0.8 },
					{ t: 0.25, v: 1.51 },
					{ t: 0.375, v: 1.516 },
					{ t: 0.5, v: 1.064 },
					{ t: 0.625, v: 0.866 },
					{ t: 0.75, v: 0.914 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.6 },
					{ t: 0.25, v: 1.504 },
					{ t: 0.375, v: 1.532 },
					{ t: 0.5, v: 1.484 },
					{ t: 0.625, v: 1.306 },
					{ t: 0.75, v: 1.095 },
					{ t: 1, v: 1 },
				],
				rotationDeg: [
					{ t: 0, v: -32 },
					{ t: 0.125, v: -9.473 },
					{ t: 0.375, v: -14.351 },
					{ t: 0.625, v: -10.278 },
					{ t: 0.875, v: -1.578 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 左移弹动 (7313890082040058406). The entrance half of a package that
	// also carries its own exit (frames 76-102, not transcribed here): the line
	// slides in from the right while each glyph pops 0→112%→98%→100% two frames
	// apart. AETools layout (frame numbers + relative handles) rather than the
	// AEAdapter tables, so the curves were read from AE_Scale/AE_Position
	// directly. Per-line dX travel becomes a fixed 1.2 em; scale is per-unit.
	"slide-pop-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.4 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.1 },
					{ t: 0.304, v: 1.12, inValue: 1.12, inTime: -0.1 },
					{ t: 0.609, v: 0.98 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.1 },
					{ t: 0.304, v: 1.12, inValue: 1.12, inTime: -0.1 },
					{ t: 0.609, v: 0.98 },
					{ t: 1, v: 1 },
				],
				translateXEm: [
					{ t: 0, v: 1.2, outValue: 0.47, outTime: 0.126 },
					{ t: 1, v: 0, inValue: 0.2, inTime: -0.33 },
				],
			},
		},
	},
	// 剪映 逐字翻转 (7112241904216969765). Unlike the AE-table packages, this
	// family computes its motion from closed-form curves: each glyph slides in
	// one text-box width from the right on move_bezier (.16,.84,.44,1) while
	// flipping upright about X from 180°, and its alpha is derived from how far
	// it still is from home rather than from an opacity track. The source
	// blends three rotation curves per character index; the representative
	// curve is transcribed. rotationXDeg renders as 2D foreshortening.
	"flip-in-each": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 4 },
					{ t: 0.125, v: 2.152 },
					{ t: 0.25, v: 1.195 },
					{ t: 0.375, v: 0.654 },
					{ t: 0.5, v: 0.339 },
					{ t: 0.625, v: 0.158 },
					{ t: 0.75, v: 0.059 },
					{ t: 0.875, v: 0.012 },
					{ t: 1, v: 0 },
				],
				rotationXDeg: [
					{ t: 0, v: 180 },
					{ t: 0.25, v: 108 },
					{ t: 0.5, v: 54 },
					{ t: 0.75, v: 16 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.25, v: 0.55 },
					{ t: 0.5, v: 0.85 },
					{ t: 0.75, v: 1 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 逐字旋转 (7111643562676064805). The sister package of 逐字翻转 — same
	// closed-form family, same move_bezier and stagger constants — but the
	// glyph spins a full 360° about Z instead of flipping about X as it slides
	// in from one text-box width to the right.
	"spin-in-each": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 4 },
					{ t: 0.125, v: 2.152 },
					{ t: 0.25, v: 1.195 },
					{ t: 0.375, v: 0.654 },
					{ t: 0.5, v: 0.339 },
					{ t: 0.625, v: 0.158 },
					{ t: 0.75, v: 0.059 },
					{ t: 0.875, v: 0.012 },
					{ t: 1, v: 0 },
				],
				rotationDeg: [
					{ t: 0, v: 360 },
					{ t: 0.125, v: 193.7 },
					{ t: 0.25, v: 107.5 },
					{ t: 0.375, v: 58.9 },
					{ t: 0.5, v: 30.5 },
					{ t: 0.625, v: 14.2 },
					{ t: 0.75, v: 5.3 },
					{ t: 0.875, v: 1.1 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.25, v: 0.55 },
					{ t: 0.5, v: 0.85 },
					{ t: 0.75, v: 1 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 随机集合 (7223959789175312954). Shuffled-order gather: each character
	// drops in from ~1.37 em above while scaling 0.15→1 and settling a damped
	// tilt (−15°→0). The driver also fans each glyph in horizontally by its
	// distance from the line centre (per-unit amplitude via `k`); a shared
	// document cannot vary translateX per unit, so that horizontal gather is
	// dropped and the vertical drop + scale + tilt carry the look.
	"random-gather": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0.27 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0.15, outValue: 0.35, outTime: 0.02 },
					{ t: 0.1, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 0.15, outValue: 0.35, outTime: 0.02 },
					{ t: 0.1, v: 1, inValue: 1, inTime: -0.038 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.15, outValue: 0.35, outTime: 0.02 },
					{ t: 0.1, v: 1, inValue: 1, inTime: -0.038 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: -1.37 },
					{ t: 0.17, v: -0.9 },
					{ t: 0.33, v: -0.1 },
					{ t: 0.4, v: 0 },
					{ t: 1, v: 0 },
				],
				rotationDeg: [
					{ t: 0, v: -15 },
					{ t: 0.17, v: 15 },
					{ t: 0.3, v: -9 },
					{ t: 0.45, v: 5 },
					{ t: 0.6, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
};

export const EXIT_TEXTANIM_DOCUMENTS: Record<string, Doc> = {
	// 剪映 逐字旋出 (7229520513586958908). The driver plays its AE entrance
	// tables in REVERSE (elapsed = duration − elapsed), so the exit is that
	// entrance time-flipped: each glyph, staggered last-to-first, spins and
	// scales up to 130% then collapses toward 35% while tipping 46° as it
	// fades. Anchor (0, −0.3·h) with the scale collapse folds into translateYEm
	// = 0.3·(1 − scale). rotationDeg = +z_AE (driver negates, Amaz→CSS negates).
	"spin-out-each": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.31 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.455, v: 0.95 },
					{ t: 0.758, v: 1.3 },
					{ t: 1, v: 0.35 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.455, v: 0.95 },
					{ t: 0.758, v: 1.3 },
					{ t: 1, v: 0.35 },
				],
				rotationDeg: [
					{ t: 0, v: 0 },
					{ t: 0.455, v: 5 },
					{ t: 0.758, v: -25 },
					{ t: 1, v: 46 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.455, v: 0.015 },
					{ t: 0.758, v: -0.09 },
					{ t: 1, v: 0.195 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.848, v: 1 },
					{ t: 1, v: 0.15 },
				],
			},
		},
	},
	// 剪映 炸开 Ⅲ (7308274161992864266). Seeded per-character explosion: every
	// glyph flies off in its own random direction, spins up to ~a full turn,
	// shrinks to ~50%, and fades out over the back ~60%. Random per-unit
	// directions are exactly what the scatter effect provides; the shared
	// radial-magnitude / rotation / scale / alpha tracks are folded into its
	// amplitude. seed carried from the package (math.randomseed 20230619).
	"burst-out": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "scatter",
			distance: { value: 3, unit: "em" },
			rotateDeg: 300,
			flicker: false,
			seed: 20230619,
		},
	},
	// 剪映 躺下 (7265288999470633509). The mirror of 站起: each glyph tips over
	// forward around the same pivot 0.375 em below its centre, rotating 0→−90°,
	// squashing X to 35% and fading as it lands. Its driver reads AE
	// [51/30, 67/30] — the falling half of the track 站起 rises through.
	"lie-down": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.2 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationDeg: [
					{ t: 0, v: 0 },
					{ t: 0.125, v: -0.512 },
					{ t: 0.25, v: -2.27 },
					{ t: 0.375, v: -5.767 },
					{ t: 0.5, v: -11.917 },
					{ t: 0.625, v: -22.785 },
					{ t: 0.75, v: -45 },
					{ t: 0.875, v: -82.61 },
					{ t: 1, v: -90 },
				],
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.25, v: 0.984 },
					{ t: 0.5, v: 0.914 },
					{ t: 0.625, v: 0.835 },
					{ t: 0.75, v: 0.675 },
					{ t: 0.875, v: 0.403 },
					{ t: 1, v: 0.35 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.5, v: 0.969 },
					{ t: 0.75, v: 0.732 },
					{ t: 0.875, v: 0.246 },
					{ t: 1, v: 0 },
				],
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.5, v: -0.077 },
					{ t: 0.75, v: -0.265 },
					{ t: 1, v: -0.375 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.5, v: 0.008 },
					{ t: 0.75, v: 0.11 },
					{ t: 1, v: 0.375 },
				],
			},
		},
	},
	// 剪映 甩回 (7244102747698500156). The exit twin of 甩出: the same elastic
	// scale and tilt tracks, but the position track hurls each glyph far to the
	// right (its own MOVE_DURATION of 38/30) instead of settling home.
	"whip-out": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.35 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.25, v: 0.42 },
					{ t: 0.5, v: 1.19 },
					{ t: 0.75, v: 1.93 },
					{ t: 1, v: 2.6 },
				],
				translateYEm: [
					{ t: 0, v: -0.09 },
					{ t: 0.25, v: 0.11 },
					{ t: 0.5, v: 0.09 },
					{ t: 0.75, v: 0.02 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 0.8 },
					{ t: 0.25, v: 1.51 },
					{ t: 0.5, v: 1.064 },
					{ t: 0.75, v: 0.914 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.6 },
					{ t: 0.25, v: 1.504 },
					{ t: 0.5, v: 1.484 },
					{ t: 0.75, v: 1.095 },
					{ t: 1, v: 1 },
				],
				rotationDeg: [
					{ t: 0, v: -32 },
					{ t: 0.125, v: -9.473 },
					{ t: 0.375, v: -14.351 },
					{ t: 0.75, v: -5.877 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.7, v: 1 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 旋转缩放 (7243633648237285949). Played in reverse by its driver
	// (elapsed = duration − elapsed), so the exit is a spin-away: the block
	// rotates about the text-box centre while an elastic scale track — baked
	// per frame in the source, sampled here at its extrema — collapses it to
	// nothing. Block-level transform, hence unit "all".
	"spin-scale-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.35, v: 0.972 },
					{ t: 0.55, v: 1.014 },
					{ t: 0.78, v: 1.2 },
					{ t: 0.9, v: 0.774 },
					{ t: 1, v: 0 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.35, v: 0.972 },
					{ t: 0.55, v: 1.014 },
					{ t: 0.78, v: 1.2 },
					{ t: 0.9, v: 0.774 },
					{ t: 1, v: 0 },
				],
				rotationDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.66 },
					{ t: 1, v: 30, inValue: 25, inTime: -0.167 },
				],
			},
		},
	},
	// 剪映 环绕滑出 (7261858590808347193). The line slides right and each glyph,
	// on reaching the box edge, wraps away around a vertical axis: the source
	// places it at sin(rad)·r while turning it up to 180° about Y, then fades
	// it as it goes over. Which glyph wraps when depends on its own x, so the
	// per-character phase becomes the stagger here. rotationYDeg renders as 2D
	// foreshortening, which is what makes the wrap read as edge-on.
	"wrap-slide-out": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.55 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.25, v: 0.6 },
					{ t: 0.5, v: 1.35 },
					{ t: 0.75, v: 2.3 },
					{ t: 1, v: 3.4 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.5, v: -0.12 },
					{ t: 1, v: -0.3 },
				],
				rotationYDeg: [
					{ t: 0, v: 0 },
					{ t: 0.35, v: 42 },
					{ t: 0.6, v: 95 },
					{ t: 0.8, v: 145 },
					{ t: 1, v: 180 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.6, v: 1 },
					{ t: 0.85, v: 0.45 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 二段缩放 (7238519014866031162). Two-stage shrink-out: the whole block
	// first scales to 65% (text-level scale over the first ~42%), then each
	// glyph collapses to 0 (char-level scale over the back ~55%). Transcribed as
	// the product of the two shared tracks; the letter-spacing (tracking) sweep
	// has no QCut channel and is dropped.
	"two-stage-scale": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1, outValue: 0.942, outTime: 0.071 },
					{ t: 0.424, v: 0.65 },
					{ t: 0.455, v: 0.65, outValue: 0.542, outTime: 0.091 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.545 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 0.942, outTime: 0.071 },
					{ t: 0.424, v: 0.65 },
					{ t: 0.455, v: 0.65, outValue: 0.542, outTime: 0.091 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.545 },
				],
			},
		},
	},
};

export const LOOP_TEXTANIM_DOCUMENTS: Record<string, Doc> = {
	// 剪映 放大缩小 (7224077152587616805). Per-character zoom pulse 100→140→60→100
	// over the cycle, bottom-anchored (translateYEm = 0.3·(1 − scale)). The
	// source alternates odd/even glyphs onto an antiphase track (one at 140%
	// while its neighbour sits at 60%); a shared document cannot mirror values
	// per rank, so all glyphs pulse in sync — track1 is transcribed for every
	// character.
	"pulse-scale": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1, outValue: 1.067, outTime: 0.023 },
					{ t: 0.136, v: 1.4 },
					{ t: 0.227, v: 1.4, outValue: 1.4, outTime: 0.255 },
					{ t: 0.591, v: 0.6 },
					{ t: 0.773, v: 0.6, outValue: 0.6, outTime: 0.159 },
					{ t: 1, v: 1, inValue: 0.933, inTime: -0.038 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 1.067, outTime: 0.023 },
					{ t: 0.136, v: 1.4 },
					{ t: 0.227, v: 1.4, outValue: 1.4, outTime: 0.255 },
					{ t: 0.591, v: 0.6 },
					{ t: 0.773, v: 0.6, outValue: 0.6, outTime: 0.159 },
					{ t: 1, v: 1, inValue: 0.933, inTime: -0.038 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.136, v: -0.12 },
					{ t: 0.227, v: -0.12 },
					{ t: 0.591, v: 0.12 },
					{ t: 0.773, v: 0.12 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 悸动 (7229526981807706680). A restless vertical throb: the glyph
	// squashes to 85% then rebounds past 105% before settling, bottom-anchored
	// (translateYEm = 0.3·(1 − scaleY)). The source deals six such tracks out
	// to characters at random and scales each by a random 0.8–1.2 factor; a
	// shared document carries one representative track at unit amplitude, so
	// all glyphs throb together instead of independently.
	throb: {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.1, v: 0.942 },
					{ t: 0.2, v: 0.888 },
					{ t: 0.3, v: 0.853 },
					{ t: 0.4, v: 0.868 },
					{ t: 0.5, v: 0.934 },
					{ t: 0.6, v: 1.014 },
					{ t: 0.7, v: 1.048 },
					{ t: 0.8, v: 1.034 },
					{ t: 0.9, v: 1.017 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 0.017 },
					{ t: 0.2, v: 0.034 },
					{ t: 0.3, v: 0.044 },
					{ t: 0.4, v: 0.04 },
					{ t: 0.5, v: 0.02 },
					{ t: 0.6, v: -0.004 },
					{ t: 0.7, v: -0.014 },
					{ t: 0.8, v: -0.01 },
					{ t: 0.9, v: -0.005 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 爆闪 (7308279705252139530). Strobe: the source steps a 30-slot
	// on/off table over the cycle, hiding the whole block on the zero slots.
	// Transcribed as a stepped opacity track holding each slot's value — the
	// pattern (5 on, 2 off, 2 on, 2 off, 4 on …) is carried verbatim.
	"strobe-flash": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.167, v: 1 },
					{ t: 0.168, v: 0 },
					{ t: 0.233, v: 0 },
					{ t: 0.234, v: 1 },
					{ t: 0.3, v: 1 },
					{ t: 0.301, v: 0 },
					{ t: 0.367, v: 0 },
					{ t: 0.368, v: 1 },
					{ t: 0.5, v: 1 },
					{ t: 0.501, v: 0 },
					{ t: 0.533, v: 0 },
					{ t: 0.534, v: 1 },
					{ t: 0.567, v: 1 },
					{ t: 0.568, v: 0 },
					{ t: 0.6, v: 0 },
					{ t: 0.601, v: 1 },
					{ t: 0.633, v: 1 },
					{ t: 0.634, v: 0 },
					{ t: 0.667, v: 0 },
					{ t: 0.668, v: 1 },
					{ t: 0.7, v: 1 },
					{ t: 0.701, v: 0 },
					{ t: 0.733, v: 0 },
					{ t: 0.734, v: 1 },
					{ t: 0.8, v: 1 },
					{ t: 0.801, v: 0 },
					{ t: 0.9, v: 0 },
					{ t: 0.901, v: 1 },
					{ t: 0.933, v: 1 },
					{ t: 0.934, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 拉住 (7221747595884892731). Whole-line vertical "pull": the block
	// stretches on Y (dips to 95%, springs to ~104%, yanks down to 80%, then
	// settles) while wobbling ±15° about its lower-left corner. The corner pivot
	// is approximated by QCut's centre transform; scaleY + rotation carry it.
	"hold-stretch": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.063, v: 0.95 },
					{ t: 0.25, v: 1.04 },
					{ t: 0.396, v: 0.8 },
					{ t: 0.479, v: 1 },
					{ t: 0.542, v: 1.016 },
					{ t: 0.708, v: 0.99 },
					{ t: 1, v: 1 },
				],
				rotationDeg: [
					{ t: 0, v: 0 },
					{ t: 0.063, v: 0 },
					{ t: 0.25, v: -15 },
					{ t: 0.396, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
};
