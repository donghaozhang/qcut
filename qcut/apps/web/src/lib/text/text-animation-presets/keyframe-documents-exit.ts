import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/** Exit-phase documents; see keyframe-documents-entrance.ts for conventions. */
export const EXIT_KEYFRAME_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	// 剪映 立体翻书 (7526837871102283018), transcribed from its plaintext
	// studioAnim.lsanim. D=3 (no effectAnimators; largest key t).
	"book-flip-out": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.42 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.42 },
				],
				translateYEm: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.21 },
					{
						t: 0.5,
						v: 0.2,
						inValue: 0.2,
						outValue: 0.2,
						inTime: -0.21,
						outTime: 0.21,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.21 },
				],
				rotationYDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.42 },
					{ t: 1, v: 90, inValue: 90, inTime: -0.42 },
				],
			},
			selector: {
				start: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.28 },
					{ t: 0.667, v: -1, inValue: -1, inTime: -0.28 },
				],
				end: [
					{ t: 0, v: 2, outValue: 2, outTime: 0.28 },
					{ t: 0.667, v: 0, inValue: 0, inTime: -0.28 },
				],
				shape: "rampUp",
				feather: 1,
			},
		},
	},
	// 剪映 爱心飘散 (7540971343894891822), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from max key time. Dropped: SGlow; 1 sticker.
	"hearts-drift": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [1, 1, 1], outValue: [1, 0.835, 0.901], outTime: 0.33 },
				{ t: 1, v: [1, 0.5, 0.7], inValue: [1, 0.67, 0.802], inTime: -0.34 },
			],
			channels: {
				opacity: [
					{ t: 0, v: 1, outValue: 1, outTime: 0.42 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.42 },
				],
				translateYEm: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.33 },
					{ t: 1, v: -1, inValue: -1, inTime: -0.34 },
				],
				colorAmount: [{ t: 0, v: 1 }],
			},
		},
	},
	// 剪映 小猫吞字 (7540967743827332361), transcribed from its plaintext
	// studioAnim.lsanim. D=3 from max key time. Dropped: LinearWipe; 1 sticker.
	"kitten-swallow": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [
					{ t: 0, v: 0, outValue: 0.33, outTime: 0.276 },
					{
						t: 0.837,
						v: 1,
						inValue: 0.66,
						inTime: -0.285,
						outValue: 1,
						outTime: 0.054,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.055 },
				],
				shape: "square",
				feather: 1,
			},
			channels: {
				opacity: [
					{ t: 0, v: 1, outValue: 0.18, outTime: 0.075 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.835 },
				],
				rotationXDeg: [
					{ t: 0, v: 0, outValue: -51.75, outTime: 0.39 },
					{ t: 1, v: -90, inValue: -90, inTime: -0.435 },
				],
				scaleX: [
					{ t: 0, v: 1, outValue: 0.425, outTime: 0.39 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.435 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 0.425, outTime: 0.39 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.435 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 1, v: -0.5 },
				],
			},
		},
	},
	// 剪映 稻草人收割 (7540969013073939750), transcribed from its plaintext
	// studioAnim.lsanim. D=3 (renderGroup_attrs has no duration; largest key
	// t=3). Dropped: LinearWipe post pass; 1 sticker: scarecrow/scythe overlay
	// video res/video_output2.mp4.
	"scarecrow-harvest": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.8 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1, outValue: 0, outTime: 0.262 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.435 },
				],
				scaleX: [
					{ t: 0, v: 1, outValue: 0.827, outTime: 0.39 },
					{ t: 1, v: 0.7, inValue: 0.7, inTime: -0.435 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 0.827, outTime: 0.39 },
					{ t: 1, v: 0.7, inValue: 0.7, inTime: -0.435 },
				],
			},
		},
	},
	// 剪映 扭曲消散 (7526840044951309594), transcribed from its plaintext
	// studioAnim.lsanim. D=3. Dropped: TurbulenceDisplacement post pass.
	"twist-dissolve": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1, outValue: 0.67, outTime: 0.33 },
					{ t: 1, v: 0, inValue: 0.34, inTime: -0.34 },
				],
				translateXEm: [{ t: 0, v: 0.08 }],
				translateYEm: [{ t: 0, v: 0.05 }],
				rotationDeg: [{ t: 0, v: -15 }],
				scaleX: [
					{ t: 0, v: 1, outValue: 0.736, outTime: 0.33 },
					{ t: 1, v: 0.2, inValue: 0.472, inTime: -0.34 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 0.736, outTime: 0.33 },
					{ t: 1, v: 0.2, inValue: 0.472, inTime: -0.34 },
				],
				blurPx: [
					{ t: 0, v: 0, outValue: 3.3, outTime: 0.33 },
					{ t: 1, v: 10, inValue: 6.6, inTime: -0.34 },
				],
			},
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [
					{ t: 0, v: 0, outValue: 0.015, outTime: 0.148 },
					{
						t: 0.333,
						v: 0.3,
						inValue: 0.285,
						outValue: 0.32,
						inTime: -0.15,
						outTime: 0.148,
					},
					{
						t: 0.667,
						v: 0.7,
						inValue: 0.68,
						outValue: 0.715,
						inTime: -0.15,
						outTime: 0.148,
					},
					{ t: 1, v: 1, inValue: 0.985, inTime: -0.15 },
				],
				shape: "square",
				feather: 1,
			},
		},
	},
};
