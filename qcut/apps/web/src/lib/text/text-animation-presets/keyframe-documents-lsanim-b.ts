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
	// 剪映 右移淡出 (7649346444947688746), D=3. The silhouette starts crumbling
	// a third of the way in — RoughEdge chews the outline against a 0.15-cell
	// noise field (edgeSize 0 → 3, noiseIntensity 0 → 0.5) — while a
	// directional blur smears it rightward and both release at the very end.
	// The erosion is the new GPU pass: displacement moves whole bands and
	// cannot eat an edge.
	"rough-fade-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterAngleDeg: 0,
			channels: {
				roughEdgePx: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.11 },
					{
						t: 0.3333,
						v: 0,
						inValue: 0,
						inTime: -0.1133,
						outValue: 0,
						outTime: 0.0313,
					},
					{
						t: 0.4,
						v: 0.5,
						inValue: 0.357,
						inTime: -0.017,
						outValue: 0.5,
						outTime: 0.143,
					},
					{
						t: 0.8333,
						v: 0.5,
						inValue: 0.5,
						inTime: -0.1473,
						outValue: 0.213,
						outTime: 0.065,
					},
					{ t: 1, v: 0.85, inValue: 0.7, inTime: -0.0723 },
				],
				roughEdgeNoise: [
					{ t: 0, v: 0 },
					{ t: 0.4, v: 0.5 },
					{ t: 1, v: 0.6 },
				],
				dirBlurPx: [
					{ t: 0, v: 0, outValue: 1.1, outTime: 0.2967 },
					{
						t: 0.6667,
						v: 22,
						inValue: 20.9,
						inTime: -0.3,
						outValue: 9.35,
						outTime: 0.13,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.145 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.75, v: 1 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 文字消散 (D=3, DistortChroma + RadialBlur). The red and blue warps
	// run exactly opposite (+5 / −5, same curve), which IS a chromatic
	// separation — so the pass we already have covers it; only the naming
	// differed. A radial blur spikes with them at the same instant, read here
	// as an outward echo. Both clear by two-thirds, leaving the block to sit
	// out the rest of the exit.
	"chroma-dissolve-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rgbSplitPx: [
					{ t: 0, v: 0, outValue: 5.28, outTime: 0.055 },
					{
						t: 0.1667,
						v: 16,
						inValue: 10.56,
						inTime: -0.0567,
						outValue: 10.72,
						outTime: 0.165,
					},
					{
						t: 0.6667,
						v: 0,
						inValue: 5.44,
						inTime: -0.17,
						outValue: 0,
						outTime: 0.11,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.1133 },
				],
				echoAmount: [
					{ t: 0, v: 0 },
					{ t: 0.1667, v: -0.3 },
					{ t: 0.3333, v: 0 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.55, v: 1 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 红色灰尘 (D=3). Turbulence roughens the glyph edges while a
	// PixelSprint pushes pixels out from the centre (intensity 0.25, centre
	// 0.5/0.5 — an outward echo here) and a Dust pass sweeps the block away.
	// The dust progress drives the fade since our shatter cannot chain with a
	// keyframe document.
	"red-dust-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterScale: 16,
			rasterEvolution: 2,
			colorTrack: [
				{ t: 0, v: [1, 0.45, 0.35] },
				{ t: 1, v: [1, 0.3, 0.2] },
			],
			channels: {
				colorAmount: [{ t: 0, v: 0.7 }],
				displaceAmplitudePx: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.0807 },
					{
						t: 0.2443,
						v: 6,
						inValue: 6,
						inTime: -0.0807,
						outValue: 6,
						outTime: 0.066,
					},
					{
						t: 0.4443,
						v: 6,
						inValue: 6,
						inTime: -0.066,
						outValue: 6,
						outTime: 0.1833,
					},
					{ t: 1, v: 4.2, inValue: 4.2, inTime: -0.189 },
				],
				echoAmount: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.11 },
					{
						t: 0.3333,
						v: -0.25,
						inValue: -0.25,
						inTime: -0.11,
						outValue: -0.25,
						outTime: 0.22,
					},
					{ t: 1, v: -0.25, inValue: -0.25, inTime: -0.2267 },
				],
				opacity: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.055 },
					{
						t: 0.1667,
						v: 1,
						inValue: 1,
						inTime: -0.055,
						outValue: 0.67,
						outTime: 0.275,
					},
					{ t: 1, v: 0, inValue: 0.34, inTime: -0.2833 },
				],
			},
		},
	},
	// 剪映 横向分割 (7563555749822090522), D=3. The line tears in half: three
	// selectors share one clock and differ only by SHAPE — rampDown weights
	// the leading characters (they lift 1.5 em), rampUp weights the trailing
	// ones (they drop 1.5 em), and a square window fades the whole line out.
	// A directional smear grows to 33 px through the tear. This is the
	// multi-layer selector case: each layer carries its own window and its
	// own channels, so the two halves move opposite ways instead of
	// cancelling.
	"horizontal-split-out": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterAngleDeg: 90,
			channels: {
				dirBlurPx: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.055 },
					{
						t: 0.1667,
						v: 0,
						inValue: 0,
						inTime: -0.0567,
						outValue: 0.99,
						outTime: 0.5967,
					},
					{
						t: 0.8333,
						v: 33,
						inValue: 7.26,
						inTime: -0.21,
						outValue: 22.11,
						outTime: 0.055,
					},
					{ t: 1, v: 0, inValue: 11.22, inTime: -0.0567 },
				],
			},
			layers: [
				{
					// rampDown: strongest at the head of the line.
					selector: {
						start: [{ t: 0, v: 0 }],
						end: [{ t: 0, v: 1 }],
						shape: "rampDown",
						feather: 1,
					},
					channels: {
						translateYEm: [
							{ t: 0, v: 0 },
							{
								t: 0.4443,
								v: -1.5,
								inValue: -1.5,
								inTime: -0.1867,
								outValue: -1.5,
								outTime: 0.1833,
							},
							{ t: 1, v: -1.5, inValue: -1.5, inTime: -0.189 },
						],
					},
				},
				{
					// rampUp: strongest at the tail, so that half drops.
					selector: {
						start: [{ t: 0, v: 0 }],
						end: [{ t: 0, v: 1 }],
						shape: "rampUp",
						feather: 1,
					},
					channels: {
						translateYEm: [
							{ t: 0, v: 0, outValue: 0, outTime: 0.1867 },
							{ t: 0.4443, v: 1.5, outValue: 1.5, outTime: 0.1833 },
							{ t: 1, v: 1.5, inValue: 1.5, inTime: -0.189 },
						],
					},
				},
				{
					// Square window: the whole line fades together.
					channels: {
						opacity: [
							{ t: 0, v: 1, outValue: 1, outTime: 0.055 },
							{
								t: 0.1667,
								v: 1,
								inValue: 1,
								inTime: -0.0567,
								outValue: 0.67,
								outTime: 0.231,
							},
							{
								t: 0.8667,
								v: 0,
								inValue: 0,
								inTime: -0.231,
								outValue: 0,
								outTime: 0.044,
							},
							{ t: 1, v: 0, inValue: 0, inTime: -0.0453 },
						],
					},
				},
			],
		},
	},
	// 剪映 像素辉光 (D=3). The line drops away while a Mosaic deconstructs it —
	// cell 1000 → 1 in the source's own units, read here as the block breaking
	// into coarse pixels as it goes. SGlow rides along with constant
	// brightness, so only the mosaic and the fall are animated — but "rides
	// along" still needs the pass: without a bloomIntensity value the
	// evaluator emits no bloom at all and the 辉光 half of the name is lost.
	// The package has since left the local cache, so the constant is set
	// in-family (brighten-fade-out's transcribed peak) with the default
	// radius rather than re-transcribed.
	"pixel-glow-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				bloomIntensity: [{ t: 0, v: 0.3 }],
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
	// 剪映 文字淡变 (D=3, CrossBlur). radiusX and radiusY are keyframed
	// identically (0 → 1.2 → 0), so the "cross" blur is isotropic here and
	// collapses onto our single blur channel — a breath in and out of focus.
	"soft-focus-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				blurPx: [
					{ t: 0, v: 0, outValue: 0.72, outTime: 0.2227 },
					{
						t: 0.5,
						v: 14.4,
						inValue: 13.68,
						inTime: -0.225,
						outValue: 13.68,
						outTime: 0.2227,
					},
					{ t: 1, v: 0, inValue: 0.72, inTime: -0.225 },
				],
			},
		},
	},
	// 剪映 彩色火焰 family. The source runs a multi-pass procedural fire that
	// no drawImage composition can fake — it was the one class the earlier
	// sweep correctly called out of reach, and the WebGL2 harness is what
	// changed that. The pass grows fBm noise out of the glyph alpha (each
	// pixel fed by the alpha below it, so the fire licks upward) and shades it
	// through a blackbody ramp. Reach and blaze breathe over the cycle.
	// GPU-only by design: without WebGL2 the block draws untouched rather
	// than showing a flat orange stand-in.
	"flame-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterEvolution: 3,
			channels: {
				flameIntensity: [
					{ t: 0, v: 0.85 },
					{ t: 0.35, v: 1.1 },
					{ t: 0.7, v: 0.8 },
					{ t: 1, v: 0.85 },
				],
				flameReach: [
					{ t: 0, v: 1 },
					{ t: 0.5, v: 1.35 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 雨刷 (7664907544720198953). Not a wipe at all — the block swings
	// like a windshield wiper about a pivot below itself: 0 → −20° on quadOut
	// over the first quarter, sweeping to +20° on quadInOut through the
	// middle half, then easing back on quadIn. The source drives it from the
	// caption page's own progress and rotates the whole transform, so this is
	// a loop document with a bottom pivot rather than a per-word mode. The
	// three easing segments are baked to keys here; angles are negated for
	// CSS's clockwise-positive convention.
	"wiper-swing": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			pivot: "bottomCenter",
			channels: {
				rotationDeg: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 12.8 },
					{ t: 0.15, v: 16.8 },
					{ t: 0.25, v: 20 },
					{ t: 0.4, v: 12.8 },
					{ t: 0.5, v: 0 },
					{ t: 0.6, v: -12.8 },
					{ t: 0.75, v: -20 },
					{ t: 0.85, v: -16.8 },
					{ t: 0.9, v: -12.8 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
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
	// 剪映 闪色循环 (D=3). The readable chain is a white SoftGlow driving two
	// tracks in lockstep: exposure 0.2→0.5→0.2 (→ bloomIntensity) and
	// glowIntensity 5→15→5 (→ glow, normalized by its peak). The package's
	// glowColor is [1,1,1,1] — the 闪色 tint itself rides the encrypted
	// selector custom_script (see LSANIM-POOL.md) and cannot be transcribed,
	// so the port's identity is the double glow breath, not a colour cycle.
	"color-flash-loop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			glowColor: "#ffffff",
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
				glowIntensity: [
					{ t: 0.0, v: 0.33, outValue: 0.363, outTime: 0.2227 },
					{
						t: 0.5,
						v: 1.0,
						inValue: 0.967,
						inTime: -0.225,
						outValue: 0.967,
						outTime: 0.2227,
					},
					{ t: 1.0, v: 0.33, inValue: 0.363, inTime: -0.225 },
				],
				glowRadiusPx: [{ t: 0, v: 14 }],
			},
		},
	},
};
