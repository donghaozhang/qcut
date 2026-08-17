import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * lsanim-pool ports, exit and loop phases. Same family and decoding method as
 * keyframe-documents-lsanim-a.ts.
 *
 * Every document here is an EFFECT-CHAIN port: in this family the character
 * motion usually lives in an encrypted `custom_script` expression selector, so
 * only packages whose readable effect chain IS the preset's identity are
 * carried over — a "glow spin in" whose spin we cannot read would ship as
 * static text with a halo, which is catalog noise rather than a port. See
 * docs/task/jianying-text-anim-port/LSANIM-POOL.md.
 */

type Doc = TextKeyframeDocument;

export const EXIT_LSANIM_DOCUMENTS_A: Record<string, Doc> = {
	// 剪映 像素辉光 (D=3). The line drops away while a Mosaic deconstructs it —
	// cell 1000 → 1 in the source's own units, read here as the block breaking
	// into coarse pixels as it goes. SGlow rides along with constant
	// brightness, so only the mosaic and the fall are animated.
	"pixel-glow-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				// Source cell 1000 → 100 → 1 in its own units; 34 → 1 px reads
				// as the same deconstruction at preview scale.
				pixelateCell: [
					{ t: 0, v: 1 },
					{ t: 0.5, v: 6 },
					{ t: 0.85, v: 34 },
					{ t: 1, v: 34 },
				],
				opacity: [
					{ t: 0.0, v: 1.0, outValue: 1.0, outTime: 0.2723 },
					{
						t: 0.5793,
						v: 1.0,
						inValue: 1.0,
						inTime: -0.197,
						outValue: 0.425,
						outTime: 0.164,
					},
					{ t: 1.0, v: 0.0, inValue: 0.0, inTime: -0.183 },
				],
				translateYEm: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.3133 },
					{
						t: 0.6667,
						v: 1.0,
						inValue: 0.43,
						inTime: -0.17,
						outValue: 1.0,
						outTime: 0.11,
					},
					{ t: 1.0, v: 1.0, inValue: 1.0, inTime: -0.1133 },
				],
			},
		},
	},
	// 剪映 亮度渐变 (D=3). A slow swell and release: a soft bloom rises to 0.3
	// at the midpoint with a matching gaussian, both returning to zero — the
	// block brightens through its own exit rather than moving.
	"brighten-fade-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				blurPx: [
					{ t: 0.0, v: 0.0, outValue: 0.0357, outTime: 0.2227 },
					{
						t: 0.5,
						v: 0.7143,
						inValue: 0.6786,
						inTime: -0.225,
						outValue: 0.6786,
						outTime: 0.2227,
					},
					{ t: 1.0, v: 0.0, inValue: 0.0357, inTime: -0.225 },
				],
				bloomIntensity: [
					{ t: 0.0, v: 0.0, outValue: 0.015, outTime: 0.2227 },
					{
						t: 0.5,
						v: 0.3,
						inValue: 0.285,
						inTime: -0.225,
						outValue: 0.285,
						outTime: 0.2227,
					},
					{ t: 1.0, v: 0.0, inValue: 0.015, inTime: -0.225 },
				],
			},
		},
	},
	// 剪映 模糊淡出 (D=3). The block dissolves into blur in three steps
	// (1.8 → 4.3 → 5.4 px) with a bloom that peaks early and hangs on, then
	// both snap off at the very last frame.
	"blur-fade-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				blurPx: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.14 },
					{ t: 0.3333, v: 1.7857, outValue: 1.7857, outTime: 0.14 },
					{ t: 0.6667, v: 4.2857, outValue: 4.2857, outTime: 0.126 },
					{ t: 0.9667, v: 5.3571, outValue: 3.5893, outTime: 0.011 },
					{ t: 1.0, v: 0.0, inValue: 1.8214, inTime: -0.0113 },
				],
				bloomIntensity: [
					{ t: 0.0, v: 0.0, outValue: 0.198, outTime: 0.11 },
					{
						t: 0.3333,
						v: 0.6,
						inValue: 0.396,
						inTime: -0.1133,
						outValue: 0.442,
						outTime: 0.11,
					},
					{
						t: 0.6667,
						v: 0.12,
						inValue: 0.283,
						inTime: -0.1133,
						outValue: 0.08,
						outTime: 0.11,
					},
					{ t: 1.0, v: 0.0, inValue: 0.041, inTime: -0.1133 },
				],
			},
		},
	},
	// 剪映 破碎消散 (D=3). Turbulence tears the block apart mid-exit and a
	// gaussian takes over for the last third. The source's turbulence size 2.0
	// maps far past our field, so the amplitude is capped at 18 px — beyond
	// that the glyphs stop reading as text. Dropped: the Dust pass's own
	// particle progress.
	"dust-scatter-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				displaceAmplitudePx: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.011 },
					{
						t: 0.0333,
						v: 0.0,
						inValue: 0.0,
						inTime: -0.0113,
						outValue: 0.0,
						outTime: 0.196,
					},
					{
						t: 0.5,
						v: 18.0,
						inValue: 18.0,
						inTime: -0.196,
						outValue: 18.0,
						outTime: 0.055,
					},
					{ t: 0.6667, v: 18.0, inValue: 18.0, inTime: -0.0567 },
					{ t: 1.0, v: 0.0, inValue: 0.0, inTime: -0.14 },
				],
				blurPx: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.22 },
					{ t: 0.6667, v: 0.0, inValue: 0.0, inTime: -0.2267 },
					{ t: 1.0, v: 17.8571, inValue: 17.8571, inTime: -0.14 },
				],
			},
		},
	},
	// 剪映 故障消散 (D=3). Chromatic separation spikes while a bloom flares,
	// its offset rescaled from the source's 0.5 (half the block width — far
	// past legibility here) to 26 px, keeping the curve shape.
	// the pair carrying the exit — the block glitches apart in place. Dropped:
	// the Dust particle progress and the Y half of the aberration offset (our
	// split is single-axis).
	"glitch-dissolve-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rgbSplitPx: [
					{ t: 0.0, v: 0.0, outValue: 8.58, outTime: 0.33 },
					{ t: 1.0, v: 26.0, inValue: 17.16, inTime: -0.34 },
				],
				bloomIntensity: [
					{ t: 0.0, v: 0.0, outValue: 0.132, outTime: 0.275 },
					{
						t: 0.8333,
						v: 0.4,
						inValue: 0.264,
						inTime: -0.2833,
						outValue: 0.268,
						outTime: 0.055,
					},
					{ t: 1.0, v: 0.0, inValue: 0.136, inTime: -0.0567 },
				],
			},
		},
	},
	// 剪映 文字淡隐 (D=3). A directional smear grows as a bloom lifts, so the
	// block streaks out of frame without actually translating.
	"smear-fade-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				dirBlurPx: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.022 },
					{
						t: 0.0667,
						v: 0.0,
						inValue: 0.0,
						inTime: -0.0227,
						outValue: 1.815,
						outTime: 0.33,
					},
					{
						t: 0.6667,
						v: 33.0,
						inValue: 6.27,
						inTime: -0.195,
						outValue: 12.87,
						outTime: 0.036,
					},
					{
						t: 0.8333,
						v: 0.0,
						inValue: 0.0,
						inTime: -0.1073,
						outValue: 0.0,
						outTime: 0.055,
					},
					{ t: 1.0, v: 0.0, inValue: 0.0, inTime: -0.0567 },
				],
				bloomIntensity: [
					{ t: 0.0, v: 0.0, outValue: 0.0, outTime: 0.022 },
					{
						t: 0.0667,
						v: 0.0,
						inValue: 0.0,
						inTime: -0.0227,
						outValue: 0.055,
						outTime: 0.33,
					},
					{
						t: 0.6667,
						v: 1.0,
						inValue: 0.19,
						inTime: -0.195,
						outValue: 0.39,
						outTime: 0.036,
					},
					{
						t: 0.8333,
						v: 0.0,
						inValue: 0.0,
						inTime: -0.1073,
						outValue: 0.0,
						outTime: 0.055,
					},
					{ t: 1.0, v: 0.0, inValue: 0.0, inTime: -0.0567 },
				],
			},
		},
	},
};

export const LOOP_LSANIM_DOCUMENTS_A: Record<string, Doc> = {
	// 剪映 能量脉冲 (D=3). A turbulence field breathes through the glyph edges
	// each cycle. Dropped: the RadianceGlow angle sweep (our bloom has no
	// directional term).
	"energy-pulse-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				displaceAmplitudePx: [
					{ t: 0.0, v: 0.0, outValue: 0.45, outTime: 0.1483 },
					{
						t: 0.3333,
						v: 9.0,
						inValue: 8.55,
						inTime: -0.15,
						outValue: 8.55,
						outTime: 0.1483,
					},
					{
						t: 0.6667,
						v: 0.0,
						inValue: 0.45,
						inTime: -0.15,
						outValue: 0.0,
						outTime: 0.11,
					},
					{ t: 1.0, v: 0.0, inValue: 0.0, inTime: -0.1133 },
				],
			},
		},
	},
	// 剪映 文字亮闪 (D=3). A clean bloom breath — 0.3 → 1 → 0.3 per cycle,
	// symmetric handles, so the loop seam is exact.
	"flash-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				bloomIntensity: [
					{ t: 0.0, v: 0.3, outValue: 0.335, outTime: 0.2227 },
					{
						t: 0.5,
						v: 1.0,
						inValue: 0.965,
						inTime: -0.225,
						outValue: 0.965,
						outTime: 0.2227,
					},
					{ t: 1.0, v: 0.3, inValue: 0.335, inTime: -0.225 },
				],
			},
		},
	},
	// 剪映 闪色循环 (D=3). The same breath as 文字亮闪 but carried on the
	// package's own tint, so the block pulses in colour rather than in
	// brightness alone.
	"color-flash-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				bloomIntensity: [
					{ t: 0.0, v: 0.2, outValue: 0.215, outTime: 0.2227 },
					{
						t: 0.5,
						v: 0.5,
						inValue: 0.485,
						inTime: -0.225,
						outValue: 0.485,
						outTime: 0.2227,
					},
					{ t: 1.0, v: 0.2, inValue: 0.215, inTime: -0.225 },
				],
			},
		},
	},
};
