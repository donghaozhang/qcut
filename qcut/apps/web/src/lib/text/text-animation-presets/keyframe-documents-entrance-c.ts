import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/** T-script Lua ports, entrance phase; conventions in keyframe-documents-entrance-a.ts. */
export const ENTRANCE_KEYFRAME_DOCUMENTS_C: Record<
	string,
	TextKeyframeDocument
> = {
	// 剪映 模糊 (6923094735116571150), transcribed from its T-script Lua data
	// tables. Root-only animation (animateChar mode 0, duration 0.8 present but
	// every char channel table is empty, so unit=all, staggerRatio 0). Dropped:
	// blurType=1 with blurDirection; funcEaseBlurAction1/3, funcEaseAction3
	// helpers are defined but unused by this package's data.
	"blur-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.4, v: 1 },
				],
				blurPx: [
					{ t: 0, v: 12, outValue: 0, outTime: 0.61 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.12 },
				],
			},
		},
	},
	// 剪映 彩色映射 (7039655272222036516), transcribed from its T-script Lua data
	// tables. Custom clone-layer script, not the standard
	// animateRoot/animateChar T-format. Dropped: 5 clone text layers in palette
	// #D447F2/#68E8E3/#90F520/#F2EF3C/#BF4A36 converging staggered; RT ping-pong
	// blend compositing chain; per-layer alignment offsets; bloom force-disable
	// .
	"color-mapping": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 18, outValue: 5.76, outTime: 0 },
					{ t: 0.389, v: 1, inValue: 5.93, inTime: -0.35 },
				],
				scaleY: [
					{ t: 0, v: 18, outValue: 5.76, outTime: 0 },
					{ t: 0.389, v: 1, inValue: 5.93, inTime: -0.35 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.1, v: 1 },
				],
			},
			colorTrack: [
				{ t: 0, v: [0.373, 0.212, 0.784] },
				{ t: 0.8, v: [0.373, 0.212, 0.784] },
				{ t: 1, v: [1, 1, 1] },
			],
		},
	},
	// 剪映 逐字显影 (7038882772450021896), transcribed from its T-script Lua data
	// tables. Custom per-char timing, not mode 0/1: char i's window runs from
	// (i-1-0.7)*D/n to the END of the phase, so per-char durations shrink along
	// the line while all chars land at scale 1 together at t=1; nearest QCut
	// stagger model is staggerRatio 0.8 (starts spread over 80%, equal slots).
	// Dropped: shader 'appear' develop wash on the block RT; per-char ease
	// spread; per-char peak scale 1+((i/n)^0.25+0.2), ranging ~1.96.
	"develop-reveal": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.8 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 2.1 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 2.1 },
					{ t: 1, v: 1 },
				],
				blurPx: [
					{ t: 0, v: 4.4, outValue: 4.268, outTime: 0.58 },
					{ t: 1, v: 0, inValue: 2.332, inTime: -0.24 },
				],
			},
		},
	},
	// 剪映 右下擦开 (7088576340361744903), transcribed from its T-script Lua data
	// tables. Single-pass shader wipe, shader source read: mask =
	// smoothstep(0,0.31,dist)*step(lineY,uv.y), i.e. Dropped: true 45-degree
	// screen-space wipe line.
	"diagonal-wipe-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [
					{ t: 0, v: -0.448, outValue: 0.498, outTime: 0 },
					{ t: 1, v: 1.752, inValue: 1.026, inTime: -0.75 },
				],
				end: [{ t: 0, v: 3 }],
				shape: "square",
				feather: 0.44,
			},
		},
	},
	// 剪映 弹性伸缩 II (7308272646913790490), transcribed from its T-script Lua data
	// tables. AE scale track (frames 0/5/9/14/20/26/33 at 30 fps, window = 33/45
	// of phase → key t = frame/33) runs 3.0 → 0.15 → −0.88 → 0.15 → 1.23 → 0.9 →
	// 1.0: the negative keys mirror the glyph through zero twice (canvas
	// negative scale). Dropped: Position-dependent line-stretch collapse;
	// Antisymmetric rotation fan; Odd/even char-count index recentering; Single-
	// char fallback branch.
	"elastic-stretch-ii": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.27 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0, outTime: 0 },
					{ t: 0.152, v: 1, inValue: 1, inTime: -0.091 },
				],
				scaleX: [
					{ t: 0, v: 3, outValue: 3, outTime: 0.051 },
					{
						t: 0.152,
						v: 0.15,
						inValue: 1.163,
						inTime: -0.05,
						outValue: -0.571,
						outTime: 0.039,
					},
					{
						t: 0.273,
						v: -0.88,
						inValue: -0.88,
						inTime: -0.039,
						outValue: -0.88,
						outTime: 0.047,
					},
					{
						t: 0.424,
						v: 0.15,
						inValue: -0.597,
						inTime: -0.048,
						outValue: 0.95,
						outTime: 0.049,
					},
					{
						t: 0.606,
						v: 1.23,
						inValue: 1.23,
						inTime: -0.077,
						outValue: 1.23,
						outTime: 0.074,
					},
					{
						t: 0.788,
						v: 0.9,
						inValue: 0.9,
						inTime: -0.066,
						outValue: 0.9,
						outTime: 0.071,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.068 },
				],
				scaleY: [
					{ t: 0, v: 3, outValue: 3, outTime: 0.051 },
					{
						t: 0.152,
						v: 0.15,
						inValue: 1.163,
						inTime: -0.05,
						outValue: -0.571,
						outTime: 0.039,
					},
					{
						t: 0.273,
						v: -0.88,
						inValue: -0.88,
						inTime: -0.039,
						outValue: -0.88,
						outTime: 0.047,
					},
					{
						t: 0.424,
						v: 0.15,
						inValue: -0.597,
						inTime: -0.048,
						outValue: 0.95,
						outTime: 0.049,
					},
					{
						t: 0.606,
						v: 1.23,
						inValue: 1.23,
						inTime: -0.077,
						outValue: 1.23,
						outTime: 0.074,
					},
					{
						t: 0.788,
						v: 0.9,
						inValue: 0.9,
						inTime: -0.066,
						outValue: 0.9,
						outTime: 0.071,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.068 },
				],
				rotationDeg: [
					{ t: 0, v: -30, outValue: -30, outTime: 0 },
					{
						t: 0.273,
						v: 15,
						inValue: 15,
						inTime: -0.115,
						outValue: 15,
						outTime: 0.167,
					},
					{ t: 0.67, v: 0, inValue: 0, inTime: -0.167 },
				],
			},
		},
	},
	// 剪映 羽化向左擦开 (6897084292908716557), transcribed from its T-script Lua data
	// tables. Shader-mask wipe re-expressed as an animated range selector:
	// window [0,end] holds the still-hidden characters (opacity channel constant
	// 0, weight = hiddenness), end shrinking 1→0 so the reveal front travels
	// leftward — 向左擦开 wipes the cover toward the left, uncovering the line
	// right-to-left; direction inferred from the name since the material/shader
	// is not in the package. Dropped: Pixel-space feathered wipe mask;
	// animateChar block is entirely empty.
	"feather-wipe-left": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [
					{ t: 0, v: 1, outValue: 0.333, outTime: 0.333 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.333 },
				],
				shape: "square",
				feather: 0.2,
			},
		},
	},
	// 剪映 羽化向右擦开 (6897084405781631496), transcribed from its T-script Lua data
	// tables. Root data drives two shader uniforms only: percent
	// {0,1,0,1,Amaz.Ease.quadOut} -> u_percent and constant u_transition=0.2
	// (feather width). Dropped: sub-glyph feathered alpha ramp; inert root
	// defaults.
	"feather-wipe-right": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [{ t: 0, v: 0 }],
			},
			selector: {
				start: [
					{ t: 0, v: 0, outValue: 0.8, outTime: 0.333 },
					{ t: 1, v: 1.2, inValue: 1.2, inTime: -0.333 },
				],
				end: [{ t: 0, v: 2 }],
				shape: "square",
				feather: 0.2,
			},
		},
	},
	// 剪映 向下飞入 (7088942186561016356), transcribed from its T-script Lua data
	// tables. Custom seek() bypasses animateChar: drop offset in the runtime is
	// one full output-texture height; transcribed as 2 em from the script's
	// vestigial animateChar translate track {0,2000,0}→{0,0,0} using the
	// 1000-units≈1-em (one text-box height) convention. Dropped: Per-char
	// horizontal approach fan; Seeded per-char random start jitter of ±5% of the
	// stagger span; Adaptive per-row char duration; Root motion-blur
	// configuration blurType=1 with blu.
	"fly-in-down": {
		sequence: { unit: "grapheme", order: "centerOut", staggerRatio: 0.6 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 1, outTime: 0 },
					{ t: 1, v: 1, inValue: 1, inTime: -1 },
				],
				translateYEm: [
					{ t: 0, v: -2, outValue: -0.44, outTime: 0 },
					{ t: 1, v: 0, inValue: -0.02, inTime: -0.8 },
				],
				blurPx: [
					{ t: 0, v: 12, outValue: 0, outTime: 0.61 },
					{ t: 1, v: 0, inValue: 0, inTime: -0.12 },
				],
			},
		},
	},
	// 剪映 叠影并入 (7259634012774208059), transcribed from its T-script Lua data
	// tables. AE position track ADBE_Position_1_1 relative to its settle value
	// gives a decaying horizontal oscillation: dx = −230 → +127.107 → −100 →
	// +67.833 → 0 AE px, keyed at frames 0/3/8/12/21 of a 22-frame clock (t =
	// frame/22; holds 0 from t=0.955). Dropped: Directional ghost-trail passes;
	// Per-row stagger restart; Unused commented ADBE_Position_0_0 track;
	// vertical-typesetting dx/dy swap; rtHorz pecentX/pecentY buffer scaling;
	// material .
	"ghost-merge-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.28 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.02, v: 1 },
				],
				translateXEm: [
					{ t: 0, v: -2, outValue: -1.483, outTime: 0.023 },
					{
						t: 0.136,
						v: 1.105,
						inValue: 0.85,
						inTime: -0.058,
						outValue: 0.778,
						outTime: 0.075,
					},
					{
						t: 0.364,
						v: -0.87,
						inValue: -0.87,
						inTime: -0.067,
						outValue: -0.87,
						outTime: 0.057,
					},
					{
						t: 0.545,
						v: 0.59,
						inValue: 0.531,
						inTime: -0.064,
						outValue: 0.59,
						outTime: 0.266,
					},
					{ t: 0.955, v: 0, inValue: 0.098, inTime: -0.068 },
				],
				blurPx: [
					{ t: 0, v: 20 },
					{ t: 0.223, v: 20, outValue: 16.667, outTime: 0.053 },
					{ t: 0.541, v: 0, inValue: 3.333, inTime: -0.053 },
				],
			},
		},
	},
	// 剪映 波纹 II (7380252738594017818), transcribed from its T-script Lua data
	// tables. Caption package, classified ENTRANCE: the only per-character data
	// is a progressive alpha reveal — glyphs of words already spoken hold alpha
	// 1, glyphs of the currently-spoken word ramp linearly
	// clamp((t-wordStart)/(wordEnd-wordStart)) from 0 to 1 as one group, and
	// glyphs of future words hold 0; text goes from hidden to fully shown, which
	// is entrance semantics (the ripple overlay Dropped: turbulence ripple
	// material pass, deliberately time-quantized to 0.2 s steps; transcript word
	// timings from data_val.json; EditorSDK start_time offset handling and the
	// per-effect ran.
	"ripple-karaoke": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.9 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 冲屏位移 (7078181271393800711), transcribed from its T-script Lua data
	// tables. The live animation is the tween param list in updateAnim(), block-
	// level only. Dropped: 4-pass glitch shader chain; dormant
	// animate()/animateChar() tables; hard position/scale snaps are encoded as
	// 0.001-apart key pairs; if QCut ever grows a hold flag these should beco.
	"screen-rush": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0, outValue: 7.68, outTime: 0 },
					{ t: 0.1, v: 7.68, inValue: 7.68, inTime: -0.1 },
					{ t: 0.101, v: 0, outValue: -1.92, outTime: 0 },
					{ t: 0.15, v: -1.92, inValue: -1.92, inTime: -0.049 },
					{ t: 0.151, v: 0, outValue: 3.84, outTime: 0 },
					{ t: 0.2, v: 3.84, inValue: 3.84, inTime: -0.049 },
					{ t: 0.201, v: -0.96, outValue: 0, outTime: 0 },
					{ t: 0.3, v: 0, inValue: 0, inTime: -0.099 },
					{ t: 0.4, v: 0, outValue: -12.48, outTime: 0 },
					{
						t: 0.5,
						v: -12.48,
						inValue: -12.48,
						inTime: -0.1,
						outValue: 12.48,
						outTime: 0,
					},
					{
						t: 0.6,
						v: 12.48,
						inValue: 12.48,
						inTime: -0.1,
						outValue: -0.48,
						outTime: 0,
					},
					{
						t: 0.7,
						v: -0.48,
						inValue: -0.48,
						inTime: -0.1,
						outValue: 0,
						outTime: 0,
					},
					{ t: 0.8, v: 0, inValue: 0, inTime: -0.1 },
				],
				translateYEm: [
					{ t: 0, v: 0 },
					{ t: 0.2, v: 0 },
					{ t: 0.201, v: -0.11, outValue: 0, outTime: 0 },
					{ t: 0.3, v: 0, inValue: 0, inTime: -0.099 },
					{ t: 0.4, v: 0, outValue: -3.78, outTime: 0 },
					{
						t: 0.5,
						v: -3.78,
						inValue: -3.78,
						inTime: -0.1,
						outValue: 2.16,
						outTime: 0,
					},
					{
						t: 0.6,
						v: 2.16,
						inValue: 2.16,
						inTime: -0.1,
						outValue: 0.54,
						outTime: 0,
					},
					{ t: 0.7, v: 0.54, inValue: 0.54, inTime: -0.1 },
					{ t: 0.8, v: 0.54 },
					{ t: 0.801, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.3, v: 1, outValue: 2, outTime: 0 },
					{ t: 0.4, v: 2, inValue: 2, inTime: -0.1, outValue: 1.3, outTime: 0 },
					{ t: 0.5, v: 1.3, inValue: 1.3, inTime: -0.1 },
					{ t: 0.501, v: 1, outValue: 2, outTime: 0 },
					{ t: 0.6, v: 2, inValue: 2, inTime: -0.099 },
					{ t: 0.601, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.3, v: 1, outValue: 2, outTime: 0 },
					{ t: 0.4, v: 2, inValue: 2, inTime: -0.1, outValue: 1.3, outTime: 0 },
					{ t: 0.5, v: 1.3, inValue: 1.3, inTime: -0.1 },
					{ t: 0.501, v: 1, outValue: 2, outTime: 0 },
					{ t: 0.6, v: 2, inValue: 2, inTime: -0.099 },
					{ t: 0.601, v: 1 },
				],
			},
		},
	},
	// 剪映 波浪弹入 (6917178744775905806), transcribed from its T-script Lua data
	// tables. Standard T-format, channels exact.
	"wave-bounce-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateYEm: [
					{ t: 0, v: 0.3, outValue: -0.4, outTime: 0.099 },
					{
						t: 0.3,
						v: -0.4,
						inValue: -0.4,
						inTime: -0.096,
						outValue: -0.4,
						outTime: 0.259,
					},
					{ t: 1, v: 0, inValue: 0.144, inTime: -0.364 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.3, v: 1 },
				],
			},
		},
	},
};
