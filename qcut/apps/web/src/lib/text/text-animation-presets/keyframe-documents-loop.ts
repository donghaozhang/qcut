import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/** T-script Lua ports, loop phase; conventions in keyframe-documents-entrance-a.ts. */
export const LOOP_KEYFRAME_DOCUMENTS: Record<string, TextKeyframeDocument> = {
	// 剪映 涂鸦手绘 II (7276407576625943100), transcribed from its T-script Lua data
	// tables. The source runs a fixed 0.8 s cycle (time % 0.8) and QUANTIZES
	// progress to 0.25 steps, so every char jumps between exactly 4 poses per
	// cycle - the classic boiling-line doodle. Dropped: hand-drawn sketch shader
	// pass; first-cycle typewriter reveal; per-char chaotic sine poses.
	"doodle-boil-ii": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0.09 },
					{ t: 0.245, v: 0.09 },
					{ t: 0.25, v: -0.1 },
					{ t: 0.495, v: -0.1 },
					{ t: 0.5, v: 0.04 },
					{ t: 0.745, v: 0.04 },
					{ t: 0.75, v: -0.07 },
					{ t: 0.995, v: -0.07 },
					{ t: 1, v: 0.09 },
				],
				translateYEm: [
					{ t: 0, v: -0.05 },
					{ t: 0.245, v: -0.05 },
					{ t: 0.25, v: 0.03 },
					{ t: 0.495, v: 0.03 },
					{ t: 0.5, v: 0.07 },
					{ t: 0.745, v: 0.07 },
					{ t: 0.75, v: -0.06 },
					{ t: 0.995, v: -0.06 },
					{ t: 1, v: -0.05 },
				],
			},
		},
	},
	// 剪映 涂鸦手绘 (7276407256965452346), transcribed from its T-script Lua data
	// tables. Block-level ratcheted pop-up transcribed exactly: scaleChange =
	// progress/0.5 with a stopTime ratchet that only commits when scaleChange >=
	// stopTime + 0.2, yielding a 5-step staircase (jumps to 0.2/0.4/0.6/0.8/1.0
	// at t = 0.1/0.2/0.3/0.4/0.5, invisible before 0.1, full size for the whole
	// second half). Dropped: Per-char boiling wriggle; Vertical-layout branch;
	// ImageBusinessSlider.lua.
	"graffiti-doodle": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0 },
					{ t: 0.099, v: 0 },
					{ t: 0.1, v: 0.2 },
					{ t: 0.199, v: 0.2 },
					{ t: 0.2, v: 0.4 },
					{ t: 0.299, v: 0.4 },
					{ t: 0.3, v: 0.6 },
					{ t: 0.399, v: 0.6 },
					{ t: 0.4, v: 0.8 },
					{ t: 0.499, v: 0.8 },
					{ t: 0.5, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0 },
					{ t: 0.099, v: 0 },
					{ t: 0.1, v: 0.2 },
					{ t: 0.199, v: 0.2 },
					{ t: 0.2, v: 0.4 },
					{ t: 0.299, v: 0.4 },
					{ t: 0.3, v: 0.6 },
					{ t: 0.399, v: 0.6 },
					{ t: 0.4, v: 0.8 },
					{ t: 0.499, v: 0.8 },
					{ t: 0.5, v: 1 },
					{ t: 1, v: 1 },
				],
				translateYEm: [
					{ t: 0, v: 0.6 },
					{ t: 0.099, v: 0.6 },
					{ t: 0.1, v: 0.48 },
					{ t: 0.199, v: 0.48 },
					{ t: 0.2, v: 0.36 },
					{ t: 0.299, v: 0.36 },
					{ t: 0.3, v: 0.24 },
					{ t: 0.399, v: 0.24 },
					{ t: 0.4, v: 0.12 },
					{ t: 0.499, v: 0.12 },
					{ t: 0.5, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 调皮 (6917143282690560526), transcribed from its T-script Lua data
	// tables. Continuous stochastic drift, not keyframed in the source: each
	// char linearly lerps translate.y between random targets in [0,
	// 0.1]*char.height UP (their Y-up -> translateYEm in [-0.1, 0]) and rotate.z
	// between random targets in +/-3 degrees (negated; symmetric range so the
	// sign flip is invisible). Dropped: per-char independent random retarget
	// clocks; per-char rotation pivot below the glyph; unused empty
	// animateChar/animate rigs and the ANIMSEQ material macro.
	"playful-wiggle": {
		sequence: { unit: "grapheme", order: "random", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateYEm: [
					{ t: 0, v: -0.04 },
					{ t: 0.35, v: -0.09 },
					{ t: 0.7, v: -0.01 },
					{ t: 1, v: -0.04 },
				],
				rotationDeg: [
					{ t: 0, v: -1.8 },
					{ t: 0.35, v: 2.6 },
					{ t: 0.7, v: -2.2 },
					{ t: 1, v: -1.8 },
				],
			},
		},
	},
	// 剪映 彩虹-马卡龙 (6921528300573561358), transcribed from its T-script Lua data
	// tables. i18nKey rainbowMacaron. Dropped: Every-4th-pass extra palette
	// advance; Space/newline glyphs are skipped when assigning palette stops.
	"rainbow-macaron": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "colorCycle",
			palette: ["#ffcca6", "#fff9bc", "#caffaf", "#c3e1ff", "#d3bfff"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: true,
			envelope: "constant",
		},
	},
	// 剪映 彩虹 (6908592625406710280), transcribed from its T-script Lua data
	// tables. FORMAT DEVIATION, intentional: the T-script contains zero keyframe
	// segments — animateRoot and animateChar channels are all empty, and the
	// effect is hard-coded in seek(): char.color = colors[(floor(time/duration)
	// + i - spaces) % 5], stepped once per self.duration (1 s), shifted one stop
	// per character. Dropped: every-4th-cycle extra palette skip; space/newline
	// glyphs do not consume a palette stop.
	"rainbow-mocha": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "colorCycle",
			palette: ["#523831", "#E8D0C8", "#CEA9A9", "#BB9C90", "#8B7364"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: true,
			envelope: "constant",
		},
	},
	// 剪映 彩虹-新年 (6916820045519655432), transcribed from its T-script Lua data
	// tables. Byte-identical script to 彩虹 (6908592625406710280) except the
	// palette table — see rainbow-macaron's notes for the full mechanism and for
	// why this is emitted as TextColorCycleEffect instead of a keyframes literal
	// (the script has zero keyframe segments; the stepped per-rank palette
	// rotation is inexpressible as keyframes+stagger). Dropped: every-4th-cycle
	// extra palette skip; space/newline glyphs do not consume a palette stop.
	"rainbow-new-year": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "colorCycle",
			palette: ["#F2A697", "#F17B67", "#EF4829", "#F3CFC9", "#F05D43"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: true,
			envelope: "constant",
		},
	},
	// 剪映 彩虹-情人节 (6916820108211917325), transcribed from its T-script Lua data
	// tables. i18nKey rainbowValentine. Dropped: Every-4th-pass extra palette
	// advance; Space/newline glyphs skipped in stop assignment.
	"rainbow-valentine": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "colorCycle",
			palette: ["#f7b7d5", "#f391c0", "#ef62a5", "#fbddeb", "#f179b2"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: true,
			envelope: "constant",
		},
	},
	// 剪映 呐喊 (7426688167740214562), transcribed from its T-script Lua data
	// tables. Block-level (animateRoot-equivalent) AE curves evaluated by
	// AETools at 16 fps over 22 frames (~1.375 s natural duration, hence
	// defaultDuration 1.4). Dropped: rotateBlurIntensity material uniform; CC
	// Blur AE track; iTime / blurType=1 / blurDirection={1,0} material uniforms;
	// animateChar block.
	"scream-shake": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 0 },
					{ t: 0.136, v: 0, outValue: 0.217, outTime: 0.023 },
					{
						t: 0.273,
						v: 1.3,
						inValue: 1.357,
						inTime: -0.136,
						outValue: 1.214,
						outTime: 0.206,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.527 },
				],
				scaleY: [
					{ t: 0, v: 0 },
					{ t: 0.136, v: 0, outValue: 0.217, outTime: 0.023 },
					{
						t: 0.273,
						v: 1.3,
						inValue: 1.357,
						inTime: -0.136,
						outValue: 1.214,
						outTime: 0.206,
					},
					{ t: 1, v: 1, inValue: 1, inTime: -0.527 },
				],
				rotationDeg: [
					{ t: 0, v: -10 },
					{ t: 0.136, v: -10, outValue: -59.8, outTime: 0.182 },
					{
						t: 0.318,
						v: -7,
						inValue: 65,
						inTime: -0.182,
						outValue: -13.428,
						outTime: 0.016,
					},
					{
						t: 0.364,
						v: 12,
						inValue: 13.802,
						inTime: -0.03,
						outValue: 9.167,
						outTime: 0.047,
					},
					{
						t: 0.455,
						v: -9,
						inValue: -10.992,
						inTime: -0.041,
						outValue: -7.827,
						outTime: 0.024,
					},
					{
						t: 0.5,
						v: 7,
						inValue: 8.59,
						inTime: -0.033,
						outValue: 4.745,
						outTime: 0.047,
					},
					{
						t: 0.591,
						v: -6,
						inValue: -7.028,
						inTime: -0.05,
						outValue: -5.71,
						outTime: 0.014,
					},
					{
						t: 0.636,
						v: 0,
						inValue: -0.575,
						inTime: -0.005,
						outValue: 0.773,
						outTime: 0.007,
					},
					{
						t: 0.682,
						v: 3.742,
						inValue: 3.742,
						inTime: -0.019,
						outValue: 3.742,
						outTime: 0.031,
					},
					{
						t: 0.773,
						v: 0,
						inValue: 1.392,
						inTime: -0.022,
						outValue: -2.266,
						outTime: 0.036,
					},
					{
						t: 0.864,
						v: -2.744,
						inValue: -3.298,
						inTime: -0.018,
						outValue: -2.294,
						outTime: 0.015,
					},
					{ t: 0.955, v: 0, inValue: 0, inTime: -0.015 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 空间翻转 I (7163896186972148261), transcribed from its T-script Lua data
	// tables. i18nKey spaceFlipI. Dropped: Perspective camera projection; rot_z
	// material uniform; wideAngleAnimation blit algorithm node.
	"space-flip-i": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationXDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.375 },
					{
						t: 0.636,
						v: -329.542,
						inValue: -242.686,
						inTime: -0.196,
						outValue: -349.243,
						outTime: 0.063,
					},
					{ t: 1, v: -360, inValue: -360, inTime: -0.01 },
				],
			},
		},
	},
	// 剪映 空间翻转 II (7163901901589713444), transcribed from its T-script Lua data
	// tables. Single block-level ADBE_Rotate_Y track, AE speed/influence keys at
	// frames 0/22/32 (16 fps, normalized boundary 22/32 = 0.688), values 0 ->
	// 341.294 -> 360, negated per convention. Dropped: perspective camera
	// projection.
	"space-flip-ii": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationYDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.406 },
					{
						t: 0.688,
						v: -341.294,
						inValue: -267.423,
						inTime: -0.228,
						outValue: -356.587,
						outTime: 0.095,
					},
					{ t: 1, v: -360, inValue: -360, inTime: -0.007 },
				],
			},
		},
	},
	// 剪映 空间翻转 III (7163892769176424991), transcribed from its T-script Lua data
	// tables. Whole-block yaw, ADBE_Rotate_Y_0_0 at 16 fps over 32 frames = the
	// script's hardcoded self.duration = 2 s. Dropped: True 3D perspective
	// projection; ADBE_Rotate_Z_0_1 curve; bloom force-disable while the
	// animation is active.
	"space-flip-iii": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationYDeg: [
					{ t: 0, v: 50, outValue: 50, outTime: 0.36 },
					{
						t: 0.5,
						v: -50,
						inValue: -50,
						inTime: -0.36,
						outValue: -50,
						outTime: 0.372,
					},
					{ t: 1, v: 50, inValue: 42.929, inTime: -0.337 },
				],
			},
		},
	},
	// 剪映 扭动 (7123093247672455711), transcribed from its T-script Lua data
	// tables. NOT a keyframes literal, deliberately: the script quantizes the
	// shared clock to quarter poses (nt - mod(nt, 0.25)) and derives each char's
	// offset from translate.x = cos(24.8*sin(2*pi*t) + 7.9*i) *
	// sin(sin(2*pi*t)*2*pi + i) * 3 and translate.y = sin(19.1*cos(2*pi*t) +
	// 33.6*i) * cos(cos(2*pi*t)*2*pi - i) * 2 — per-rank chaotic tracks cannot
	// be expressed as one shared keyframe tra Dropped: iTime material uniform.
	"wriggle": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: { kind: "jitter", steps: 4, amplitudeX: 0.04, amplitudeY: 0.027 },
	},
};
