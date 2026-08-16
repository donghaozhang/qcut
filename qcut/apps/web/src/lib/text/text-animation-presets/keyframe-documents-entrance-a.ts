import type { TextAnimationEffect } from "@/types/timeline";

/**
 * Keyframe documents transcribed from Jianying's plaintext studioAnim.lsanim
 * packages (see the jianying-text-anim-reference skill). Each entry is data
 * for the declarative keyframes interpreter: times are normalized to the
 * phase (package seconds / window length), Y values are sign-flipped from
 * the package's Y-up space, and dropped overlay videos / post passes are
 * listed per document. Behavior is reimplemented from observed math — no
 * Jianying assets or scripts are copied.
 */
export interface TextKeyframeDocument {
	sequence: {
		unit: "grapheme" | "all";
		order: "forward" | "reverse" | "random" | "centerOut";
		staggerRatio: number;
	};
	effect: Extract<TextAnimationEffect, { kind: "keyframes" }>;
}

export const ENTRANCE_KEYFRAME_DOCUMENTS_A: Record<
	string,
	TextKeyframeDocument
> = {
	// 剪映 蓝芒瞬烁 (7644887612578221366), transcribed from its plaintext
	// studioAnim.lsanim. Text tracks are byte-identical to 横掠焰光
	// (7644886170391956799); the packages differ only in glow tint (blue #55c9fa
	// vs orange), sticker video, and renderGroup expandRatioY. Dropped: Shake
	// render-group pass; DeepGlowSimple render-group pass; sticker overlay video
	// ×1.
	"blue-glint-flash": {
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
	// 剪映 兔子跳跃 (7540968058714688819), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from the largest key time (no effectAnimators, no
	// renderGroup). Dropped: sticker overlay video ×1.
	"bunny-hop": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: -0.004, outTime: 0.064 },
					{
						t: 0.233,
						v: 1,
						inValue: -0.034,
						inTime: -0.17,
						outValue: 0.651,
						outTime: 0.159,
					},
					{
						t: 0.433,
						v: 0.7,
						inValue: 0.651,
						inTime: -0.041,
						outValue: 0.688,
						outTime: 0.051,
					},
					{
						t: 0.7,
						v: 1,
						inValue: 0.688,
						inTime: -0.216,
						outValue: 0.923,
						outTime: 0.076,
					},
					{
						t: 0.8,
						v: 0.9,
						inValue: 0.923,
						inTime: -0.024,
						outValue: 0.942,
						outTime: 0.03,
					},
					{
						t: 0.9,
						v: 1,
						inValue: 0.923,
						inTime: -0.068,
						outValue: 1,
						outTime: 0.033,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.034 },
				],
				translateYEm: [
					{ t: 0, v: 0.5, outValue: 0.5, outTime: 0.008 },
					{
						t: 0.025,
						v: 0.47,
						inValue: 0.47,
						inTime: -0.008,
						outValue: 0.47,
						outTime: 0.008,
					},
					{
						t: 0.05,
						v: 0.5,
						inValue: 0.5,
						inTime: -0.008,
						outValue: 0.433,
						outTime: 0.032,
					},
					{
						t: 0.1,
						v: 0.45,
						inValue: 0.45,
						inTime: -0.016,
						outValue: 0.45,
						outTime: 0.016,
					},
					{
						t: 0.15,
						v: 0.5,
						inValue: 0.36,
						inTime: -0.033,
						outValue: 0.178,
						outTime: 0.089,
					},
					{
						t: 0.283,
						v: 0.35,
						inValue: 0.35,
						inTime: -0.044,
						outValue: 0.364,
						outTime: 0.036,
					},
					{
						t: 0.383,
						v: 0.5,
						inValue: 0.214,
						inTime: -0.063,
						outValue: 0.5,
						outTime: 0,
					},
					{
						t: 0.5,
						v: 0,
						inValue: 0,
						inTime: -0.049,
						outValue: 0,
						outTime: 0.165,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.17 },
				],
				scaleX: [
					{ t: 0, v: 0.5, outValue: 0.497, outTime: 0.017 },
					{
						t: 0.062,
						v: 1.2,
						inValue: 0.476,
						inTime: -0.045,
						outValue: 0.956,
						outTime: 0.042,
					},
					{
						t: 0.116,
						v: 0.99,
						inValue: 0.956,
						inTime: -0.011,
						outValue: 0.982,
						outTime: 0.014,
					},
					{
						t: 0.187,
						v: 1.2,
						inValue: 0.982,
						inTime: -0.057,
						outValue: 1.146,
						outTime: 0.02,
					},
					{
						t: 0.213,
						v: 1.13,
						inValue: 1.146,
						inTime: -0.006,
						outValue: 1.159,
						outTime: 0.008,
					},
					{
						t: 0.24,
						v: 1.2,
						inValue: 1.146,
						inTime: -0.018,
						outValue: 1.198,
						outTime: 0.007,
					},
					{
						t: 0.253,
						v: 1.179,
						inValue: 1.172,
						inTime: -0.007,
						outValue: 1.172,
						outTime: 0.008,
					},
					{
						t: 0.267,
						v: 1.2,
						inValue: 1.172,
						inTime: -0.008,
						outValue: 1.201,
						outTime: 0.015,
					},
					{
						t: 0.321,
						v: 1,
						inValue: 1.207,
						inTime: -0.04,
						outValue: 1.07,
						outTime: 0.037,
					},
					{
						t: 0.368,
						v: 1.06,
						inValue: 1.07,
						inTime: -0.01,
						outValue: 1.062,
						outTime: 0.012,
					},
					{
						t: 0.43,
						v: 1,
						inValue: 1.062,
						inTime: -0.05,
						outValue: 1.015,
						outTime: 0.018,
					},
					{
						t: 0.453,
						v: 1.02,
						inValue: 1.015,
						inTime: -0.006,
						outValue: 1.012,
						outTime: 0.007,
					},
					{
						t: 0.477,
						v: 1,
						inValue: 1.015,
						inTime: -0.016,
						outValue: 1.001,
						outTime: 0.006,
					},
					{
						t: 0.488,
						v: 1.006,
						inValue: 1.008,
						inTime: -0.006,
						outValue: 1.008,
						outTime: 0.007,
					},
					{
						t: 0.5,
						v: 1,
						inValue: 1.008,
						inTime: -0.007,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
				scaleY: [
					{ t: 0, v: 0.5, outValue: 0.497, outTime: 0.017 },
					{
						t: 0.062,
						v: 1.2,
						inValue: 0.476,
						inTime: -0.045,
						outValue: 0.956,
						outTime: 0.042,
					},
					{
						t: 0.116,
						v: 0.99,
						inValue: 0.956,
						inTime: -0.011,
						outValue: 0.982,
						outTime: 0.014,
					},
					{
						t: 0.187,
						v: 1.2,
						inValue: 0.982,
						inTime: -0.057,
						outValue: 1.146,
						outTime: 0.02,
					},
					{
						t: 0.213,
						v: 1.13,
						inValue: 1.146,
						inTime: -0.006,
						outValue: 1.159,
						outTime: 0.008,
					},
					{
						t: 0.24,
						v: 1.2,
						inValue: 1.146,
						inTime: -0.018,
						outValue: 1.198,
						outTime: 0.007,
					},
					{
						t: 0.253,
						v: 1.179,
						inValue: 1.172,
						inTime: -0.007,
						outValue: 1.172,
						outTime: 0.008,
					},
					{
						t: 0.267,
						v: 1.2,
						inValue: 1.172,
						inTime: -0.008,
						outValue: 1.201,
						outTime: 0.015,
					},
					{
						t: 0.321,
						v: 1,
						inValue: 1.207,
						inTime: -0.04,
						outValue: 1.07,
						outTime: 0.037,
					},
					{
						t: 0.368,
						v: 1.06,
						inValue: 1.07,
						inTime: -0.01,
						outValue: 1.062,
						outTime: 0.012,
					},
					{
						t: 0.43,
						v: 1,
						inValue: 1.062,
						inTime: -0.05,
						outValue: 1.015,
						outTime: 0.018,
					},
					{
						t: 0.453,
						v: 1.02,
						inValue: 1.015,
						inTime: -0.006,
						outValue: 1.012,
						outTime: 0.007,
					},
					{
						t: 0.477,
						v: 1,
						inValue: 1.015,
						inTime: -0.016,
						outValue: 1.001,
						outTime: 0.006,
					},
					{
						t: 0.488,
						v: 1.006,
						inValue: 1.008,
						inTime: -0.006,
						outValue: 1.008,
						outTime: 0.007,
					},
					{
						t: 0.5,
						v: 1,
						inValue: 1.008,
						inTime: -0.007,
						outValue: 1,
						outTime: 0.165,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.17 },
				],
			},
		},
	},
	// 剪映 蝴蝶穿梭 (7540970607614233906), transcribed from its plaintext
	// studioAnim.lsanim. No renderGroup duration field in this package; D=3
	// taken from the largest key time (all tracks end at t=3). Dropped: SGlow
	// white glow pass; Text_BaseSticker butterfly overlay video ×1.
	"butterfly-weave": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.55 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.05, outTime: 0.059 },
					{
						t: 0.133,
						v: 1,
						inValue: 0.95,
						inTime: -0.06,
						outValue: 1,
						outTime: 0.286,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.295 },
				],
				scaleX: [
					{ t: 0, v: 0.6, outValue: 0.63, outTime: 0.089 },
					{
						t: 0.2,
						v: 1.2,
						inValue: 1.17,
						inTime: -0.09,
						outValue: 1.19,
						outTime: 0.356,
					},
					{ t: 1, v: 1, inValue: 1.01, inTime: -0.36 },
				],
				scaleY: [
					{ t: 0, v: 0.6, outValue: 0.63, outTime: 0.089 },
					{
						t: 0.2,
						v: 1.2,
						inValue: 1.17,
						inTime: -0.09,
						outValue: 1.19,
						outTime: 0.356,
					},
					{ t: 1, v: 1, inValue: 1.01, inTime: -0.36 },
				],
			},
		},
	},
	// 剪映 礼花粒子 (7548385953153305894), transcribed from its plaintext
	// studioAnim.lsanim. D=3 taken from the largest key time (no renderGroup
	// duration array). Dropped: GodRay render-group pass; sticker overlay video
	// ×1.
	"confetti-particles": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.4 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.33, outTime: 0.33 },
					{ t: 1, v: 1, inValue: 0.66, inTime: -0.34 },
				],
				translateXEm: [
					{ t: 0, v: -0.7, outValue: 0.163, outTime: 0.347 },
					{
						t: 0.889,
						v: 0,
						inValue: 0,
						inTime: -0.293,
						outValue: 0,
						outTime: 0.037,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.048 },
				],
				rotationDeg: [
					{ t: 0, v: -30, outValue: -20.1, outTime: 0.33 },
					{ t: 1, v: 0, inValue: -10.2, inTime: -0.34 },
				],
				scaleX: [
					{ t: 0, v: 0.6, outValue: 0.765, outTime: 0.11 },
					{
						t: 0.333,
						v: 1.1,
						inValue: 0.93,
						inTime: -0.113,
						outValue: 1.043,
						outTime: 0.26,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.29 },
				],
				scaleY: [
					{ t: 0, v: 0.6, outValue: 0.765, outTime: 0.11 },
					{
						t: 0.333,
						v: 1.1,
						inValue: 0.93,
						inTime: -0.113,
						outValue: 1.043,
						outTime: 0.26,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.29 },
				],
			},
		},
	},
	// 剪映 焰尘上浮 (7644884166827347206), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from renderGroup duration [0,3]. Dropped: sticker
	// x1.
	"ember-rise": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			glowColor: "#eeb820",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{
						t: 0.34,
						v: 1,
						inValue: 1,
						inTime: -0.143,
						outValue: 1,
						outTime: 0.218,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.224 },
				],
				scaleX: [
					{ t: 0, v: 0.6, outValue: 0.6, outTime: 0.107 },
					{
						t: 0.255,
						v: 1.122,
						inValue: 1.122,
						inTime: -0.107,
						outValue: 1.122,
						outTime: 0.177,
					},
					{
						t: 0.678,
						v: 1,
						inValue: 1,
						inTime: -0.177,
						outValue: 1,
						outTime: 0.106,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.11 },
				],
				scaleY: [
					{ t: 0, v: 0.6, outValue: 0.6, outTime: 0.107 },
					{
						t: 0.255,
						v: 1.122,
						inValue: 1.122,
						inTime: -0.107,
						outValue: 1.122,
						outTime: 0.177,
					},
					{
						t: 0.678,
						v: 1,
						inValue: 1,
						inTime: -0.177,
						outValue: 1,
						outTime: 0.106,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.11 },
				],
				glowIntensity: [
					{ t: 0, v: 0.324 },
					{
						t: 0.355,
						v: 1,
						inValue: 1,
						inTime: -0.149,
						outValue: 0.72,
						outTime: 0.251,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.28 },
				],
				glowRadiusPx: [{ t: 0, v: 6 }],
			},
		},
	},
	// 剪映 风扇旋转 (7538326933243841843), transcribed from its plaintext
	// studioAnim.lsanim. D=3 (largest key time; no renderGroup duration attr).
	// Dropped: LinearWipe; sticker overlay video ×1.
	"fan-spin": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [{ t: 0, v: 1 }],
				shape: "square",
				feather: 1,
			},
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{
						t: 0.833,
						v: 1,
						inValue: 1,
						inTime: -0.35,
						outValue: 1,
						outTime: 0.055,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.057 },
				],
				translateXEm: [
					{ t: 0, v: -2, outValue: -2, outTime: 0.35 },
					{ t: 0.833, v: 0, outValue: 0, outTime: 0.055 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.057 },
				],
				rotationDeg: [
					{ t: 0, v: 5, outValue: 4.5, outTime: 0.185 },
					{
						t: 0.417,
						v: -5,
						inValue: -4.5,
						inTime: -0.188,
						outValue: -4.75,
						outTime: 0.185,
					},
					{
						t: 0.833,
						v: 0,
						inValue: -0.25,
						inTime: -0.188,
						outValue: 0,
						outTime: 0.055,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.057 },
				],
				scaleX: [
					{ t: 0, v: 0.8, outValue: 0.815, outTime: 0.185 },
					{
						t: 0.417,
						v: 1.1,
						inValue: 1.085,
						inTime: -0.188,
						outValue: 1.095,
						outTime: 0.185,
					},
					{
						t: 0.833,
						v: 1,
						inValue: 1.005,
						inTime: -0.188,
						outValue: 1,
						outTime: 0.055,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.057 },
				],
				scaleY: [
					{ t: 0, v: 0.8, outValue: 0.815, outTime: 0.185 },
					{
						t: 0.417,
						v: 1.1,
						inValue: 1.085,
						inTime: -0.188,
						outValue: 1.095,
						outTime: 0.185,
					},
					{
						t: 0.833,
						v: 1,
						inValue: 1.005,
						inTime: -0.188,
						outValue: 1,
						outTime: 0.055,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.057 },
				],
			},
		},
	},
};
