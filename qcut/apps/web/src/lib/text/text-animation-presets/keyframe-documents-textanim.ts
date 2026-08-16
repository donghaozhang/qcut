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
