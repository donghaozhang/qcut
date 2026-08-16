import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * TextAnim-family ports, second file (the first reached the repo's 800-line
 * limit). Same conventions and decoding method as
 * keyframe-documents-textanim.ts — see
 * docs/task/jianying-text-anim-port/TEXTANIM-FAMILY.md.
 */

type Doc = TextKeyframeDocument;

export const ENTRANCE_TEXTANIM_DOCUMENTS_B: Record<string, Doc> = {
	// 剪映 跳跳捣蛋鬼 (7200340219109839419). Each glyph dips and springs back
	// over a 25-frame window while rocking −15° → +15° → 0, staggered so the
	// line bounces along. The keyframes live inline in the driver as a
	// three-tuple variant (bezier / frame span / value pair, no type code).
	// Vertical travel is the source's (y − 400)/800 × 10 char-heights.
	"mischief-hop": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.2, v: 0, outValue: 0, outTime: 0.033 },
					{ t: 0.4, v: -0.5, inValue: -0.5, inTime: -0.14 },
					{ t: 0.76, v: 0, inValue: 0, inTime: -0.25 },
					{ t: 1, v: 0 },
				],
				rotationDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.067 },
					{ t: 0.2, v: -15, inValue: -15, inTime: -0.033 },
					{ t: 0.76, v: 15, inValue: 15, inTime: -0.093 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.08 },
				],
			},
		},
	},
};

export const LOOP_TEXTANIM_DOCUMENTS_B: Record<string, Doc> = {
	// 剪映 摇摆 I (6908281696253121038). A metronome sway: the whole line tips
	// ±20° about a pivot at its baseline (the source anchors each glyph at
	// −0.5·height). Its clock is not a plain cosine — the driver reshapes time
	// with a per-half smoothstep before taking cos, which is what makes the
	// sway hang at each extreme instead of gliding through. Curve evaluated
	// from that closed form; it closes on itself, so the loop is seamless.
	"metronome-sway": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationDeg: [
					{ t: 0, v: 20 },
					{ t: 0.0625, v: 19.82 },
					{ t: 0.125, v: 17.64 },
					{ t: 0.1875, v: 10.91 },
					{ t: 0.25, v: 0 },
					{ t: 0.3125, v: -10.89 },
					{ t: 0.375, v: -17.63 },
					{ t: 0.4375, v: -19.81 },
					{ t: 0.5, v: -20 },
					{ t: 0.5625, v: -19.82 },
					{ t: 0.625, v: -17.66 },
					{ t: 0.6875, v: -10.94 },
					{ t: 0.75, v: -0.05 },
					{ t: 0.8125, v: 10.86 },
					{ t: 0.875, v: 17.61 },
					{ t: 0.9375, v: 19.81 },
					{ t: 1, v: 20 },
				],
				// Pivoting at the baseline rather than the centre lifts the line
				// slightly as it swings through the extremes.
				translateYEm: [
					{ t: 0, v: -0.03 },
					{ t: 0.25, v: 0 },
					{ t: 0.5, v: -0.03 },
					{ t: 0.75, v: 0 },
					{ t: 1, v: -0.03 },
				],
			},
		},
	},
	// 剪映 颤抖 II (6986920909927879199). A whole-block tremble: the source
	// jitters the text transform (not the individual glyphs) to a seeded random
	// offset each step, scaled by its radius. QCut's jitter effect is that same
	// stepped shake, so the parametric kind is the exact mechanism.
	tremble: {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "jitter",
			steps: 12,
			amplitudeX: 0.08,
			amplitudeY: 0.08,
		},
	},
};
