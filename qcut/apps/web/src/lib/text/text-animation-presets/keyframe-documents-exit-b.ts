import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/** T-script Lua ports, exit phase; conventions in keyframe-documents-entrance-a.ts. */
export const EXIT_KEYFRAME_DOCUMENTS_B: Record<string, TextKeyframeDocument> = {
	// 剪映 羽化向左擦除 (6897085246206906893), transcribed from its T-script Lua data
	// tables. Root-only data: percent {0,1,0,1,Amaz.Ease.quadOut} plus constant
	// transition=0.2 (the feather). Dropped: The wipe fragment shader itself;
	// ANIMSEQ macro branch and unused blur uniforms; animateChar table.
	"feather-erase-left": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [
					{ t: 0, v: 1.1, outValue: 0.3, outTime: 0.333 },
					{ t: 1, v: -0.1, inValue: -0.1, inTime: -0.333 },
				],
				end: [{ t: 0, v: 2 }],
				shape: "square",
				feather: 0.2,
			},
		},
	},
	// 剪映 羽化向右擦除 (6897085341811872270), transcribed from its T-script Lua data
	// tables. The entire animation is one root channel: percent 0 -> 1 with
	// Amaz.Ease.quadOut driving the shader's wipe front; quadOut (y = 2t - t^2)
	// is EXACTLY cubic-bezier(1/3, 2/3, 2/3, 1), so the selector end track
	// carries outValue 0.667/outTime 0.333 and inValue 1/inTime -0.333. Dropped:
	// pixel-space feathered wipe shader; empty animateChar rig.
	"feather-erase-right": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [
					{ t: 0, v: 0, outValue: 0.667, outTime: 0.333 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.333 },
				],
				shape: "square",
				feather: 0.2,
			},
		},
	},
	// 剪映 逐字虚影 (7034717113130422791), transcribed from its T-script Lua data
	// tables. Custom seek(), not the standard animateChar table. Dropped:
	// Material pass; Per-char peak-scale law charScale[i]=(i/n)^(1/4)+0.2; Per-
	// char growth ease sweep controls {0.5-0.15p, 0.35+0.15p, 0.41+0.57p,
	// 0.98-0.57p}.
	"ghost-swell": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.7 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.3, v: 1 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.96, v: 2 },
					{ t: 1, v: 0 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.96, v: 2 },
					{ t: 1, v: 0 },
				],
				blurPx: [
					{ t: 0, v: 0, outValue: 2.33, outTime: 0.24 },
					{ t: 1, v: 4.4, inValue: 4.27, inTime: -0.58 },
				],
			},
		},
	},
	// 剪映 叠影并出 (7259634082760364603), transcribed from its T-script Lua data
	// tables. AE-export script, not the animateRoot/animateChar T-format:
	// ae_attribute segments {bezier,{f0,f1},{v0,v1}} on a 22-frame clip, played
	// in REVERSE (rt = duration - seekTime) to turn an entrance-authored damped
	// wobble into an exit. Dropped: GaussianBlurX/GaussianBlurY directional-blur
	// materials; commented-out ADBE_Position_0_0 second ghost-layer position
	// track; root-level blur runs on the GLOBAL exit clock; folding it.
	"ghost-trail-out": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.045, v: 0, outValue: 0.113, outTime: 0.068 },
					{
						t: 0.455,
						v: 0.678,
						inValue: 0.678,
						inTime: -0.266,
						outValue: 0.611,
						outTime: 0.064,
					},
					{
						t: 0.636,
						v: -1,
						inValue: -1,
						inTime: -0.057,
						outValue: -1,
						outTime: 0.067,
					},
					{
						t: 0.864,
						v: 1.271,
						inValue: 0.895,
						inTime: -0.075,
						outValue: 0.978,
						outTime: 0.058,
					},
					{ t: 1, v: -2.3, inValue: -1.705, inTime: -0.023 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.98, v: 1 },
					{ t: 1, v: 0 },
				],
				blurPx: [
					{ t: 0, v: 0 },
					{ t: 0.459, v: 0, outValue: 4, outTime: 0.053 },
					{ t: 0.777, v: 24, inValue: 20, inTime: -0.053 },
					{ t: 1, v: 24 },
				],
			},
		},
	},
	// 剪映 发光模糊 (7057801223109349925), transcribed from its T-script Lua data
	// tables. seek() clamps time to duration-time, so the WHOLE document runs on
	// a reversed clock; the authored entrance tracks (alpha 0->1 and radius
	// 1.8->0 over [0,0.95], scale 1.25->1 over [0,1], all ease
	// {0.49,0.1,0.34,0.99}) were time-reversed: reversed bezier =
	// {0.66,0.01,0.51,0.9}, and the [0,0.95] spans land on exit [0.05,1] with a
	// 5% identity hold at the start. Dropped: blurStep track
	// {0,1,3,0,{0.61,1,0.88,1}} and blurDirection; boldWidth track; Vertical-
	// typesetting branch.
	"glow-blur-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.05, v: 1, outValue: 0.99, outTime: 0.627 },
					{ t: 1, v: 0, inValue: 0.1, inTime: -0.466 },
				],
				scaleX: [
					{ t: 0, v: 1, outValue: 1.003, outTime: 0.66 },
					{ t: 1, v: 1.25, inValue: 1.225, inTime: -0.49 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 1.003, outTime: 0.66 },
					{ t: 1, v: 1.25, inValue: 1.225, inTime: -0.49 },
				],
				glowIntensity: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 0, outValue: 0.009, outTime: 0.627 },
					{ t: 1, v: 0.9, inValue: 0.81, inTime: -0.466 },
				],
				glowRadiusPx: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 0, outValue: 0.24, outTime: 0.627 },
					{ t: 1, v: 24, inValue: 21.6, inTime: -0.466 },
				],
			},
		},
	},
	// 剪映 滚出 (7023684709737566728), transcribed from its T-script Lua data
	// tables. Root channels exact: alpha {0.6,1,1,0,linear} -> opacity fade over
	// t 0.6..1; blurStep {0,1,0,3,{0.12,0,0.39,0}} -> blurPx 0->12 (x4 rule)
	// with both handle values 0 (extreme ease-in — blur stays ~0 then spikes).
	// Dropped: wrap-around reel shader; shader motion blur blurSize_all 0->2
	// following reversed bezier {0.52,0.18,0.72,0.3} — the root blurStep
	// channel; multiline / vertical-layout variant; root .
	"roll-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 0, outValue: 0.189, outTime: 0.135 },
					{ t: 1, v: -12.6, inValue: 0.126, inTime: -0.09 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.6, v: 1 },
					{ t: 1, v: 0 },
				],
				blurPx: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.12 },
					{ t: 1, v: 12, inValue: 0, inTime: -0.61 },
				],
			},
		},
	},
	// 剪映 波浪弹出 (6917178803521327630), transcribed from its T-script Lua data
	// tables. seek() evaluates animateChar at 1-nt, so the authored entrance
	// tracks (translate.y: {0,0.3,-0.3h,+0.4h,{0.33,1,0.68,1}} then
	// {0.3,1,+0.4h,0,{0.37,0,0.48,1.36}}; color.w: 0->1 linear over [0,0.3])
	// were time-reversed for this exit: each char dips slightly (outValue +0.144
	// from the reversed 1.36 overshoot), pops up 0.4 char-heights by t=0.7, then
	// drops to 0.3 char-heights below wh Dropped: Root animate() table is
	// entirely empty; Per-char color RGB is constant white.
	"wave-pop-out": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.7, v: 1 },
					{ t: 1, v: 0 },
				],
				translateYEm: [
					{ t: 0, v: 0, outValue: 0.144, outTime: 0.364 },
					{
						t: 0.7,
						v: -0.4,
						inValue: -0.4,
						inTime: -0.259,
						outValue: -0.4,
						outTime: 0.096,
					},
					{ t: 1, v: 0.3, inValue: -0.4, inTime: -0.099 },
				],
			},
		},
	},
	// 剪映 右下擦除 (7090146831836910110), transcribed from its T-script Lua data
	// tables. Prefab params decoded from binary anim.prefab: rorateAngle=45,
	// minValue=-0.049, maxValue=0.824, smoothRange=0.31,
	// bezierParams1={0.164,0.211,0,1}. Dropped: 45-degree diagonal cut through
	// individual glyphs; Leading-edge fade on the visible side only; Multi-line
	// behaviour.
	"wipe-bottom-right": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [{ t: 0, v: -2 }],
				end: [
					{ t: 0, v: -0.6, outValue: -0.21, outTime: 0.164 },
					{ t: 1, v: 1.25, inValue: 1.25, inTime: -1 },
				],
				shape: "square",
				feather: 0.44,
			},
		},
	},
};
