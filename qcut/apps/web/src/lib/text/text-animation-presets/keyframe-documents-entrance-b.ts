import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/** Second half of the entrance documents; conventions in keyframe-documents-entrance-a.ts. */
export const ENTRANCE_KEYFRAME_DOCUMENTS_B: Record<
	string,
	TextKeyframeDocument
> = {
	// 剪映 烟火炸旋 (7649611302968593718), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from renderGroup duration [0,3]. Dropped:
	// Text_BaseSticker firework overlay video ×1.
	"firework-blast": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			glowColor: "#2d1c03",
			colorTrack: [
				{
					t: 0,
					v: [0.8, 0.2, 0.5],
					outValue: [0.866, 0.464, 0.665],
					outTime: 0.22,
				},
				{
					t: 0.667,
					v: [1, 1, 1],
					inValue: [0.932, 0.728, 0.83],
					inTime: -0.227,
					outValue: [1, 1, 1],
					outTime: 0.11,
				},
				{ t: 1, v: [1, 1, 1], inValue: [1, 1, 1], inTime: -0.113 },
			],
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.05, outTime: 0.355 },
					{
						t: 0.798,
						v: 1,
						inValue: 0.95,
						inTime: -0.359,
						outValue: 1,
						outTime: 0.067,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.069 },
				],
				scaleX: [
					{ t: 0, v: 1.1, outValue: 1.107, outTime: 0.129 },
					{
						t: 0.336,
						v: 0.419,
						inValue: 0.419,
						inTime: -0.141,
						outValue: 0.419,
						outTime: 0.207,
					},
					{
						t: 0.829,
						v: 1,
						inValue: 1.003,
						inTime: -0.17,
						outValue: 1,
						outTime: 0.057,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.058 },
				],
				scaleY: [
					{ t: 0, v: 1.1, outValue: 1.107, outTime: 0.129 },
					{
						t: 0.336,
						v: 0.419,
						inValue: 0.419,
						inTime: -0.141,
						outValue: 0.419,
						outTime: 0.207,
					},
					{
						t: 0.829,
						v: 1,
						inValue: 1.003,
						inTime: -0.17,
						outValue: 1,
						outTime: 0.057,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.058 },
				],
				colorAmount: [{ t: 0, v: 1 }],
				glowIntensity: [
					{ t: 0, v: 1 },
					{ t: 0.722, v: 0.909, inValue: 0.909, inTime: -0.303 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.117 },
				],
				glowRadiusPx: [
					{ t: 0, v: 10 },
					{ t: 0.778, v: 8.75 },
					{ t: 1, v: 6 },
				],
			},
		},
	},
	// 剪映 横掠焰光 (7644886170391956799), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from renderGroup duration [0,3]. Dropped: Shake
	// render-group pass; DeepGlowSimple render-group pass; sticker overlay video
	// ×1.
	"flame-sweep": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [{ t: 0, v: 1 }],
				shape: "square",
				feather: 0,
			},
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.106 },
					{
						t: 0.322,
						v: 0,
						inValue: 0,
						inTime: -0.106,
						outValue: 0,
						outTime: 0.059,
					},
					{
						t: 0.5,
						v: 1,
						inValue: 1,
						inTime: -0.059,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
				translateXEm: [
					{ t: 0, v: -1, outValue: -1, outTime: 0.106 },
					{
						t: 0.322,
						v: -1,
						inValue: -1,
						inTime: -0.106,
						outValue: -1,
						outTime: 0.077,
					},
					{
						t: 0.556,
						v: -0.1,
						inValue: -0.2,
						inTime: -0.08,
						outValue: -0.018,
						outTime: 0.071,
					},
					{
						t: 0.889,
						v: 0,
						inValue: 0,
						inTime: -0.149,
						outValue: 0,
						outTime: 0.037,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.038 },
				],
			},
		},
	},
	// 剪映 自由生长 (7644904620728306987), transcribed from its plaintext
	// studioAnim.lsanim. Catalog panel is "caption" (res/WordBubbleFloat.lsanim,
	// applied to unread/reading/read ranges); phase decided as entrance from the
	// motion: fade 0->1 plus rise from 1.5 em below plus 0.1->1.2->1 overshoot
	// scale (scale.separation false -> uniform scaleX/scaleY from the x track),
	// words popping in random order.
	"free-growth": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0.27 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.33, outTime: 0.22 },
					{
						t: 0.667,
						v: 1,
						inValue: 0.66,
						inTime: -0.227,
						outValue: 1,
						outTime: 0.11,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.113 },
				],
				translateYEm: [
					{ t: 0, v: 1.5, outValue: 0.585, outTime: 0.143 },
					{
						t: 0.667,
						v: 0,
						inValue: 0,
						inTime: -0.43,
						outValue: -0.002,
						outTime: 0.074,
					},
					{
						t: 0.833,
						v: -0.05,
						inValue: -0.047,
						inTime: -0.075,
						outValue: -0.047,
						outTime: 0.074,
					},
					{ t: 1, v: 0, inValue: -0.002, inTime: -0.075 },
				],
				scaleX: [
					{ t: 0, v: 0.1, outValue: 0.771, outTime: 0.129 },
					{
						t: 0.6,
						v: 1.2,
						inValue: 1.2,
						inTime: -0.387,
						outValue: 1.2,
						outTime: 0.028,
					},
					{ t: 0.667, v: 1, inValue: 1, inTime: 0, outValue: 1, outTime: 0.11 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.113 },
				],
				scaleY: [
					{ t: 0, v: 0.1, outValue: 0.771, outTime: 0.129 },
					{
						t: 0.6,
						v: 1.2,
						inValue: 1.2,
						inTime: -0.387,
						outValue: 1.2,
						outTime: 0.028,
					},
					{ t: 0.667, v: 1, inValue: 1, inTime: 0, outValue: 1, outTime: 0.11 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.113 },
				],
			},
		},
	},
	// 剪映 金粉飘入 (7644883044037446954), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from renderGroup duration [0,3]. Dropped:
	// DeepGlowSimple; sticker overlay video ×1.
	"gold-dust-drift": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			selector: {
				start: [
					{ t: 0, v: -1, outValue: -1, outTime: 0.033 },
					{
						t: 0.1,
						v: -1,
						inValue: -1,
						inTime: -0.033,
						outValue: -0.047,
						outTime: 0.054,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.051 },
				],
				end: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.033 },
					{
						t: 0.1,
						v: 0,
						inValue: 0,
						inTime: -0.033,
						outValue: 0.953,
						outTime: 0.054,
					},
					{ t: 1, v: 2, inValue: 2, inTime: -0.051 },
				],
				shape: "rampUp",
				feather: 0,
			},
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
		},
	},
	// 剪映 彩虹渐变 (7538326518154530057), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from the largest key time (renderGroup_attrs has no
	// duration field). Dropped: RadianceGlow pass.
	"rainbow-rise": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [1, 0, 0], outValue: [0.902, 0.186, 0.33], outTime: 0.132 },
				{
					t: 0.4,
					v: [0.703, 0.563, 1],
					inValue: [0.804, 0.371, 0.66],
					inTime: -0.136,
					// biome-ignore lint/suspicious/noApproximativeNumericConstant: transcribed handle value, not Math.SQRT1_2
					outValue: [0.801, 0.707, 1],
					outTime: 0.198,
				},
				{ t: 1, v: [1, 1, 1], inValue: [0.899, 0.851, 1], inTime: -0.204 },
			],
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.048 },
					{
						t: 0.146,
						v: 0.996,
						inValue: 0.996,
						inTime: -0.048,
						outValue: 0.996,
						outTime: 0.282,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.29 },
				],
				translateYEm: [
					{ t: 0, v: 2, outValue: 0.85, outTime: 0.156 },
					{
						t: 0.399,
						v: -0.273,
						inValue: -0.273,
						inTime: -0.174,
						outValue: -0.273,
						outTime: 0.112,
					},
					{ t: 0.667, v: 0, inValue: 0, inTime: 0, outValue: 0, outTime: 0.11 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.113 },
				],
				colorAmount: [{ t: 0, v: 1 }],
			},
		},
	},
	// 剪映 卷轴展开 (7644906012201192746), transcribed from its plaintext
	// studioAnim.lsanim. Catalog panel is "caption"
	// (res/PageScrollUnfold.lsanim, range_type "reading" only, selector_scope
	// "page" -> the whole page animates as one block, hence unit "all"); phase
	// decided as entrance: fade in while the page unfolds from an 80-degree tilt
	// about the horizontal axis and grows from half size.
	"scroll-unfold": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.61, outTime: 0.107 },
					{
						t: 0.5,
						v: 1,
						inValue: 1,
						inTime: -0.322,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
				rotationXDeg: [
					{ t: 0, v: -80, outValue: -31.2, outTime: 0.107 },
					{
						t: 0.5,
						v: 0,
						inValue: 0,
						inTime: -0.322,
						outValue: 0,
						outTime: 0.165,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.17 },
				],
				scaleX: [
					{ t: 0, v: 0.5, outValue: 0.805, outTime: 0.107 },
					{
						t: 0.5,
						v: 1,
						inValue: 1,
						inTime: -0.322,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
				scaleY: [
					{ t: 0, v: 0.5, outValue: 0.805, outTime: 0.107 },
					{
						t: 0.5,
						v: 1,
						inValue: 1,
						inTime: -0.322,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
			},
		},
	},
	// 剪映 星光流转 (7548386061429345574), transcribed from its plaintext
	// studioAnim.lsanim. D=3 (no renderGroup duration attr; largest key time).
	// Dropped: SoftGlow; sticker overlay video ×1.
	"starlight-flow": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.4 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.575, outTime: 0.39 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.435 },
				],
				translateXEm: [
					{ t: 0, v: -1, outValue: -0.137, outTime: 0.39 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.435 },
				],
				rotationDeg: [
					{ t: 0, v: -45, outValue: -20.732, outTime: 0.06 },
					{
						t: 0.167,
						v: 18,
						inValue: 6.017,
						inTime: -0.053,
						outValue: 20.326,
						outTime: 0.055,
					},
					{
						t: 0.333,
						v: -9,
						inValue: -9,
						inTime: -0.055,
						outValue: -9,
						outTime: 0.055,
					},
					{
						t: 0.5,
						v: 4.5,
						inValue: 4.5,
						inTime: -0.055,
						outValue: 4.5,
						outTime: 0.055,
					},
					{
						t: 0.667,
						v: 0.9,
						inValue: 0.9,
						inTime: -0.055,
						outValue: 0.965,
						outTime: 0.105,
					},
					{ t: 1, v: 0, inValue: -1.323, inTime: -0.115 },
				],
				scaleX: [
					{ t: 0, v: 0.7, outValue: 0.799, outTime: 0.132 },
					{
						t: 0.4,
						v: 1,
						inValue: 0.898,
						inTime: -0.136,
						outValue: 1,
						outTime: 0.198,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.204 },
				],
				scaleY: [
					{ t: 0, v: 0.7, outValue: 0.799, outTime: 0.132 },
					{
						t: 0.4,
						v: 1,
						inValue: 0.898,
						inTime: -0.136,
						outValue: 1,
						outTime: 0.198,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.204 },
				],
			},
		},
	},
	// 剪映 青粒牵引 (7647442111515741446), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from renderGroup duration [0,3]. Its motion tracks
	// match 星光流转's; the teal is what separates them, so the dropped SoftGlow
	// pass's own glowColor (0.562, 0.852, 0.715) is carried here as a
	// multiplicative tint that resolves to the text's own color as it settles.
	// Dropped: the SoftGlow pass itself; Text_BaseSticker particle overlay ×1.
	"teal-pull": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.4 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [0.562, 0.852, 0.715] },
				{ t: 0.7, v: [0.562, 0.852, 0.715] },
				{ t: 1, v: [1, 1, 1] },
			],
			channels: {
				colorAmount: [{ t: 0, v: 1 }],
				opacity: [
					{ t: 0, v: 0, outValue: 0.575, outTime: 0.39 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.435 },
				],
				translateXEm: [
					{ t: 0, v: -1, outValue: -0.137, outTime: 0.39 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.435 },
				],
				rotationDeg: [
					{ t: 0, v: -45, outValue: -20.732, outTime: 0.06 },
					{
						t: 0.167,
						v: 18,
						inValue: 6.017,
						inTime: -0.053,
						outValue: 20.326,
						outTime: 0.055,
					},
					{
						t: 0.333,
						v: -9,
						inValue: -9,
						inTime: -0.055,
						outValue: -9,
						outTime: 0.055,
					},
					{
						t: 0.5,
						v: 4.5,
						inValue: 4.5,
						inTime: -0.055,
						outValue: 4.5,
						outTime: 0.055,
					},
					{
						t: 0.667,
						v: 0.9,
						inValue: 0.9,
						inTime: -0.055,
						outValue: 0.965,
						outTime: 0.105,
					},
					{ t: 1, v: 0, inValue: -1.323, inTime: -0.115 },
				],
				scaleX: [
					{ t: 0, v: 0.7, outValue: 0.799, outTime: 0.132 },
					{
						t: 0.4,
						v: 1,
						inValue: 0.898,
						inTime: -0.136,
						outValue: 1,
						outTime: 0.198,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.204 },
				],
				scaleY: [
					{ t: 0, v: 0.7, outValue: 0.799, outTime: 0.132 },
					{
						t: 0.4,
						v: 1,
						inValue: 0.898,
						inTime: -0.136,
						outValue: 1,
						outTime: 0.198,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.204 },
				],
			},
		},
	},
};
