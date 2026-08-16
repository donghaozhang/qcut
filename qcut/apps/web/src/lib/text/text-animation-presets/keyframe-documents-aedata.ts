import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * AEData-family ports. These packages pair After-Effects-exported keyframe
 * tables with a bespoke driver script that decides how each track reaches the
 * characters, so the documents below come from reading BOTH: the tables give
 * the curves, the driver gives the per-unit mapping and stagger. Conventions
 * (time normalization, Y-sign flip, em units) are documented in
 * keyframe-documents-entrance-a.ts.
 */
export const ENTRANCE_AEDATA_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	// 剪映 模糊缩小 (7294147761765618186), transcribed from its AEData keyframe tables
	// and driver script. Driver AnimScript.lua: charProgress =
	// clamp(textProgress + 1 - (i+1)/N) gives each char a window 1.0 wide in the
	// 2.0-wide textProgress span, offset 1/N per char -> staggerRatio 0.5
	// forward. Dropped: block-level zoom ADBE_Scale_0_2; line-center horizontal
	// spread; outer stagger-clock ease; per-LINE delay; single-char-line
	// variant; unused ADBE_Position_2_0_2 track and t.
	"blur-shrink": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.516, outTime: 0.012 },
					{ t: 1, v: 1, inValue: 1.001, inTime: -0.516 },
				],
				scaleX: [
					{ t: 0, v: 1.4, outValue: 1.194, outTime: 0.012 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.516 },
				],
				scaleY: [
					{ t: 0, v: 1.4, outValue: 1.194, outTime: 0.012 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.516 },
				],
				translateYEm: [
					{ t: 0, v: 0.5, outValue: 0.242, outTime: 0.012 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.516 },
				],
				blurPx: [
					{ t: 0, v: 10, outValue: 4.844, outTime: 0.012 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.516 },
				],
				glowIntensity: [
					{ t: 0, v: 0.45 },
					{ t: 0.326, v: 0.45, outValue: 0.375, outTime: 0.112 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.225 },
				],
				glowRadiusPx: [
					{ t: 0, v: 21 },
					{ t: 0.587, v: 21, outValue: 17.5, outTime: 0.069 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.138 },
				],
			},
		},
	},
	// 剪映 跳跳糖 (7329815894933115432), transcribed from its AEData keyframe tables
	// and driver script. 38-frame clip (all_frame 37, extra.json 1.26666 s ≈ 30
	// fps). Dropped: Jelly mesh-warp passes; ADBE_WRPMESH_0003 track; Radial-
	// blur spin-smear pass; Directional blur; Vertical-typesetting branch.
	"candy-pop": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0.65, outValue: 0.689, outTime: 0.033 },
					{
						t: 0.189,
						v: 1.05,
						inValue: 0.959,
						inTime: -0.078,
						outValue: 1.094,
						outTime: 0.038,
					},
					{ t: 0.297, v: 1, inValue: 1, inTime: -0.032 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.65, outValue: 0.689, outTime: 0.033 },
					{
						t: 0.189,
						v: 1.05,
						inValue: 0.959,
						inTime: -0.078,
						outValue: 1.094,
						outTime: 0.038,
					},
					{ t: 0.297, v: 1, inValue: 1, inTime: -0.032 },
					{ t: 1, v: 1 },
				],
				rotationDeg: [
					{ t: 0, v: -255, outValue: -212.5, outTime: 0.032 },
					{ t: 0.189, v: 0, inValue: 0, inTime: -0.063 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0.6, outValue: 0.667, outTime: 0.032 },
					{ t: 0.189, v: 1, inValue: 1, inTime: -0.063 },
					{ t: 1, v: 1 },
				],
				blurPx: [
					{ t: 0, v: 50 },
					{ t: 0.189, v: 50, outValue: 50, outTime: 0.036 },
					{
						t: 0.297,
						v: 7.5,
						inValue: 7.5,
						inTime: -0.036,
						outValue: 7.5,
						outTime: 0.036,
					},
					{
						t: 0.405,
						v: 40,
						inValue: 40,
						inTime: -0.036,
						outValue: 40,
						outTime: 0.036,
					},
					{
						t: 0.514,
						v: 10,
						inValue: 10,
						inTime: -0.036,
						outValue: 10,
						outTime: 0.036,
					},
					{
						t: 0.784,
						v: 2.5,
						inValue: 2.5,
						inTime: -0.09,
						outValue: 2.5,
						outTime: 0.072,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.072 },
				],
			},
		},
	},
	// 剪映 文字描边 (7644861404075265286), transcribed from its AEData keyframe tables
	// and driver script. Driver TextAnim.lua: letters i≤count get instanceColor
	// alpha 1 else 0, count = floor((GetVal(ADBE_Time_0_0,p)/100)·(letterNum+2))
	// — a stepped typewriter on an AE-remapped clock (type-pause-type-pause-
	// type). Dropped: SDF stroke-outline base layer; Irregular AE typing clock;
	// Caret quad geometry; Two phantom slots in the reveal formula; Second
	// CaptionModule clone rig / customWordLineCou.
	"outline-typewriter": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.9 },
		effect: {
			kind: "typewriter",
			reveal: "step",
			cursor: { text: "|", blinkPeriod: 0.1, persist: true },
		},
	},
	// 剪映 放大震动 (7267849370727354936), transcribed from its AEData keyframe tables
	// and driver script. Driver AnimScript.lua applies ADBE_Scale (x0.01) as
	// u_Zoom and (ADBE_Position - 400)/800*2.2 as a whole-block RT offset - pure
	// block transform, fully transcribed. Dropped: shader ghost/motion-trail
	// pass; 'R' attribute; vertical-typesetting axis swap and the aspect-ratio
	// compensation on the shader's y offset.
	"zoom-shake": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0, outValue: 0.233, outTime: 0.052 },
					{
						t: 0.313,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.104,
						outValue: 1.4,
						outTime: 0.062,
					},
					{
						t: 0.521,
						v: 0.95,
						inValue: 0.986,
						inTime: -0.073,
						outValue: 0.913,
						outTime: 0.075,
					},
					{
						t: 0.729,
						v: 1.05,
						inValue: 1.022,
						inTime: -0.06,
						outValue: 1.091,
						outTime: 0.088,
					},
					{ t: 0.938, v: 1, inValue: 1.008, inTime: -0.035 },
				],
				scaleY: [
					{ t: 0, v: 0, outValue: 0.233, outTime: 0.052 },
					{
						t: 0.313,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.104,
						outValue: 1.4,
						outTime: 0.062,
					},
					{
						t: 0.521,
						v: 0.95,
						inValue: 0.986,
						inTime: -0.073,
						outValue: 0.913,
						outTime: 0.075,
					},
					{
						t: 0.729,
						v: 1.05,
						inValue: 1.022,
						inTime: -0.06,
						outValue: 1.091,
						outTime: 0.088,
					},
					{ t: 0.938, v: 1, inValue: 1.008, inTime: -0.035 },
				],
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.313, v: 0.107 },
					{ t: 0.417, v: -0.951 },
					{ t: 0.521, v: 0.808 },
					{ t: 0.625, v: -0.024 },
					{ t: 0.729, v: 0.289 },
					{ t: 0.833, v: -0.422 },
					{ t: 0.938, v: 0 },
				],
				translateYEm: [
					{ t: 0, v: 1 },
					{ t: 0.313, v: -0.179 },
					{ t: 0.417, v: 0.136 },
					{ t: 0.521, v: 0.066 },
					{ t: 0.625, v: 0.306 },
					{ t: 0.729, v: -0.049 },
					{ t: 0.833, v: -0.132 },
					{ t: 0.938, v: 0 },
				],
			},
		},
	},
};

export const EXIT_AEDATA_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	// 剪映 粒子消散 (7504221924973645110), transcribed from its AEData keyframe tables
	// and driver script. Exact mechanism match for QCut's parametric shatter
	// kind (LumiDust/LumiVertParticle family): noise dissolve front over the
	// rasterized text with released dust drifting on velocity + turbulence.
	// Dropped: LumiVertParticle instanced GPU pass; quad burn shader on the base
	// text; burn-front acceleration; clone caption chain
	// c_module2/cloneTextSticker2 feeding rt_1 to the parti.
	"particle-dissolve": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "shatter",
			tilePx: 3,
			distortion: 0.35,
			gravity: { value: 1.1, unit: "em" },
			gravityRotDeg: 112,
			front: "noise",
			frontRotDeg: 0,
			feather: 0.35,
		},
	},
	// 剪映 滑动下落 (7270726693277405733), transcribed from its AEData keyframe tables
	// and driver script. Driver TextAnim.lua, single-line path transcribed (rule
	// 3). Dropped: multi-line stagger; multi-line amplitude variant; unused
	// master spatial track ADBE_Position_0_0; textAlign forced to 0.
	"slide-drop-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.5 },
					{ t: 0.5, v: 1, inValue: 1, inTime: -0.5 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.5, v: 0, outValue: 0, outTime: 0.5 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.167 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.844, v: 1 },
					{ t: 0.906, v: 0.3 },
					{ t: 0.938, v: 0.3 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
};

export const LOOP_AEDATA_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	// 剪映 交替缩放 (7672700146982964531), transcribed from its AEData keyframe tables
	// and driver script. Driver: generic curve engine (TextAnim.lua) +
	// customAnimConfigs/basicAnim/anim_scaleBreath.lua. Dropped:
	// valueInvertByIndex even-rank mirror; tri-layer clone stack; per-char
	// static 4-color recolor from colorScheme 21 粉蓝黄玫; shadow force-disable;
	// vestigial modules/AEData.lua o.
	"alternating-scale": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1, outValue: 1.067, outTime: 0.092 },
					{
						t: 0.229,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.106,
						outValue: 1.4,
						outTime: 0.026,
					},
					{
						t: 0.301,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.022,
						outValue: 1.4,
						outTime: 0.164,
					},
					{
						t: 0.532,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.157,
						outValue: 0.6,
						outTime: 0.038,
					},
					{
						t: 0.651,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.042,
						outValue: 0.6,
						outTime: 0.141,
					},
					{ t: 0.952, v: 1, inValue: 0.933, inTime: -0.119 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 1, outValue: 1.067, outTime: 0.092 },
					{
						t: 0.229,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.106,
						outValue: 1.4,
						outTime: 0.026,
					},
					{
						t: 0.301,
						v: 1.4,
						inValue: 1.4,
						inTime: -0.022,
						outValue: 1.4,
						outTime: 0.164,
					},
					{
						t: 0.532,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.157,
						outValue: 0.6,
						outTime: 0.038,
					},
					{
						t: 0.651,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.042,
						outValue: 0.6,
						outTime: 0.141,
					},
					{ t: 0.952, v: 1, inValue: 0.933, inTime: -0.119 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: 0, outValue: -0.1, outTime: 0.092 },
					{
						t: 0.229,
						v: -0.6,
						inValue: -0.6,
						inTime: -0.106,
						outValue: -0.6,
						outTime: 0.026,
					},
					{
						t: 0.301,
						v: -0.6,
						inValue: -0.6,
						inTime: -0.022,
						outValue: -0.6,
						outTime: 0.164,
					},
					{
						t: 0.532,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.157,
						outValue: 0.6,
						outTime: 0.038,
					},
					{
						t: 0.651,
						v: 0.6,
						inValue: 0.6,
						inTime: -0.042,
						outValue: 0.6,
						outTime: 0.141,
					},
					{ t: 0.952, v: 0, inValue: 0.1, inTime: -0.119 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 呼吸灯 (7672699753506852105), transcribed from its AEData keyframe tables
	// and driver script. Fully custom driver (no keyframe tables consumed): per
	// char, phase = p*2*pi + (i-1)*2*pi/n, breath = sin(phase)*0.5+0.5, bright =
	// 0.3+0.7*breath, and instanceColor = (bright, bright*(0.7+0.3*breath),
	// bright*(0.4+0.6*breath)) — cool white (#FFFFFF) at the breath peak
	// decaying to dim warm amber (#4D361F) at the trough, with the bright spot
	// travelling through t Dropped: Deep-glow stroke halo pass; Whole-text
	// single-wavelength phasing; Tint mode; Dead AEData ADBE_Text_Percent_Offset
	// track.
	"breathing-light": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "colorCycle",
			palette: [
				"#A68D74",
				"#E5DBD1",
				"#FFFFFF",
				"#E5DBD1",
				"#A68D74",
				"#674C32",
				"#4D361F",
				"#674C32",
			],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: false,
			envelope: "constant",
		},
	},
	// 剪映 逐个显出 (7672700625825647923), transcribed from its AEData keyframe tables
	// and driver script. Bespoke TextAnim.lua engine + anim_flutter.lua
	// (activePreset flutter, activeSelector flutterSequential, perCharAnim=true,
	// enableFade=true) — the 翻动 flip-open mechanism turned into a sequential
	// reveal. Dropped: Tri-font clone-sticker layers; Per-char 4-color palette
	// rotation, colorScheme 17 橘子汽水 #FFF4E0/#FFD4A8/#FF9A5C/#FF6B35; n-dependent
	// stagger; ~4.8% end hold from the m=min(.
	"one-by-one-reveal": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.131 },
					{
						t: 0.392,
						v: 1,
						inValue: 1,
						inTime: -0.131,
						outValue: 1,
						outTime: 0.036,
					},
					{
						t: 0.5,
						v: 0.9,
						inValue: 0.9,
						inTime: -0.036,
						outValue: 0.9,
						outTime: 0.036,
					},
					{
						t: 0.608,
						v: 1,
						inValue: 1,
						inTime: -0.036,
						outValue: 1,
						outTime: 0.041,
					},
					{
						t: 0.732,
						v: 0.95,
						inValue: 0.95,
						inTime: -0.041,
						outValue: 0.95,
						outTime: 0.089,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.089 },
				],
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.37 },
					{ t: 1, v: 1, inValue: 1, inTime: -0.37 },
				],
			},
		},
	},
	// 剪映 频闪边框 (7308280718302384690), transcribed from its AEData keyframe tables
	// and driver script. Whole-block strobe transcribed exactly from the
	// embedded ae_attribute ADBE_Opacity_0_3 track (the branch selected for the
	// preset's default 2s duration, self.duration > 1.5), 16 fps AE
	// speed/influence keys at frames 0/4.0005/8/16/19/20/22/23/26/29, values
	// 0/100/0/0/100/60/20/0/100/0, normalized by the 29-frame span. Dropped:
	// Persistent full-alpha outline; Duration-conditional alternate strobe
	// tracks; Dead PEDG_000 track; Unused modules/AEData.lua
	// ADBE_Text_Percent_Offset attrs and the comment.
	"strobe-outline": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.046 },
					{
						t: 0.138,
						v: 0.95,
						inValue: 0.95,
						inTime: -0.046,
						outValue: 0.95,
						outTime: 0.046,
					},
					{ t: 0.276, v: 0, inValue: 0, inTime: -0.046 },
					{ t: 0.552, v: 0, outValue: 0, outTime: 0.034 },
					{
						t: 0.655,
						v: 0.95,
						inValue: 0.95,
						inTime: -0.034,
						outValue: 0.95,
						outTime: 0.011,
					},
					{
						t: 0.69,
						v: 0.57,
						inValue: 0.57,
						inTime: -0.011,
						outValue: 0.57,
						outTime: 0.012,
					},
					{
						t: 0.759,
						v: 0.19,
						inValue: 0.19,
						inTime: -0.023,
						outValue: 0.19,
						outTime: 0.006,
					},
					{
						t: 0.793,
						v: 0,
						inValue: 0,
						inTime: -0.006,
						outValue: 0,
						outTime: 0.017,
					},
					{
						t: 0.897,
						v: 0.95,
						inValue: 0.95,
						inTime: -0.017,
						outValue: 0.95,
						outTime: 0.017,
					},
					{ t: 1, v: 0, inValue: 0, inTime: -0.017 },
				],
			},
		},
	},
	// 剪映 波浪滑过 (7672700009195785510), transcribed from its AEData keyframe tables
	// and driver script. Bespoke TextAnim.lua engine +
	// customAnimConfigs/basicAnim/anim_waveIII.lua (activePreset waveIII,
	// activeSelector simultaneous, perCharAnim=false, rawTiming). Dropped: Tri-
	// font clone-sticker layers; Per-char 4-color palette rotation, colorScheme
	// 21 粉蓝黄玫 #F8D9E6/#CCEBF7/#FBE8A1/#F9AED2; shadowEnabled=false override and
	// rt/wrap/seq/Gaussi.
	"wave-glide": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.333 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: -12, outValue: -4.8, outTime: 0.067 },
					{
						t: 0.476,
						v: 0,
						inValue: -2.4,
						inTime: -0.476,
						outValue: 9.96,
						outTime: 0.029,
					},
					{ t: 0.952, v: 12, inValue: 10.08, inTime: -0.4 },
					{ t: 1, v: 12 },
				],
				translateYEm: [
					{ t: 0, v: -0.355 },
					{ t: 0.011, v: -0.784 },
					{ t: 0.02, v: -0.922 },
					{ t: 0.031, v: -0.705 },
					{ t: 0.045, v: 0 },
					{ t: 0.068, v: 0.705 },
					{ t: 0.114, v: 0.922 },
					{ t: 0.216, v: 0.705 },
					{ t: 0.426, v: 0 },
					{ t: 0.48, v: -0.705 },
					{ t: 0.486, v: -0.922 },
					{ t: 0.495, v: -0.705 },
					{ t: 0.507, v: 0 },
					{ t: 0.53, v: 0.705 },
					{ t: 0.574, v: 0.922 },
					{ t: 0.685, v: 0.717 },
					{ t: 0.952, v: 0.062 },
					{ t: 1, v: 0.062 },
				],
				rotationDeg: [
					{ t: 0, v: -25.28 },
					{ t: 0.011, v: -12.56 },
					{ t: 0.02, v: 0 },
					{ t: 0.031, v: 15.8 },
					{ t: 0.045, v: 39.25 },
					{ t: 0.068, v: 15.68 },
					{ t: 0.114, v: 0 },
					{ t: 0.216, v: -15.8 },
					{ t: 0.426, v: -39.25 },
					{ t: 0.48, v: -15.68 },
					{ t: 0.486, v: 0 },
					{ t: 0.495, v: 15.8 },
					{ t: 0.507, v: 39.25 },
					{ t: 0.53, v: 15.68 },
					{ t: 0.574, v: 0 },
					{ t: 0.685, v: -15.37 },
					{ t: 0.952, v: -33.28 },
					{ t: 1, v: -33.28 },
				],
			},
		},
	},
};
