import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * TextAnim-family ports, second file (the first reached the repo's 800-line
 * limit). Same conventions and decoding method as
 * keyframe-documents-textanim.ts — see
 * docs/task/jianying-text-anim-port/TEXTANIM-FAMILY.md.
 */

type Doc = TextKeyframeDocument;

export const ENTRANCE_TEXTANIM_DOCUMENTS_B: Record<string, Doc> = {
	// 剪映 马赛克滑入 (7667041862917655859). The block resolves out of a coarse
	// mosaic: the source feeds a 40 px cell size to its pixelate shader while
	// the text slides in. Now expressible directly — the raster post-pass runs
	// the same downscale/upscale on the block's offscreen render, so the cell
	// size animates as an ordinary keyframe channel.
	"mosaic-in": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				pixelateCell: [
					{ t: 0, v: 40 },
					{ t: 0.65, v: 8 },
					{ t: 0.9, v: 1 },
					{ t: 1, v: 1 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.2, v: 1 },
					{ t: 1, v: 1 },
				],
				translateXEm: [
					{ t: 0, v: 0.8 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 向右集合 (7081206983461704199). Glyphs converge in from half a text
	// box away on a shared ease (.16,.81,.44,1), staggered back-to-front —
	// (size − i)/size in the driver — so the rightmost character lands first
	// and the line gathers toward it. The source blends three per-index bezier
	// curves, but all three constants are identical here, so the blend
	// collapses to that one curve and the transcription is exact.
	"gather-right": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 2 },
					{ t: 0.125, v: 1.1 },
					{ t: 0.25, v: 0.623 },
					{ t: 0.375, v: 0.348 },
					{ t: 0.5, v: 0.184 },
					{ t: 0.625, v: 0.088 },
					{ t: 0.75, v: 0.033 },
					{ t: 0.875, v: 0.007 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 渐变拖尾 (7308277117622424090). Each glyph slides in diagonally from
	// up and to the right (the source's offset, ~0.35 em at the default
	// duration) and snaps visible once it is a tenth of the way in, staggered
	// so the line arrives as a trailing diagonal. The smear itself comes from a
	// feedback-blur pass that is dropped — what remains is the entrance move.
	"trail-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.6 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0.35 },
					{ t: 1, v: 0 },
				],
				translateYEm: [
					{ t: 0, v: 0.35 },
					{ t: 1, v: 0 },
				],
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.099, v: 0 },
					{ t: 0.1, v: 1 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
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
	// 剪映 扭曲模糊 (7089261793406620197), D=2. Characters fade in and grow
	// 0.95→1 on the bezier (.22,.6,.52,.93) with a 25% in-line stagger while
	// the whole block boils under a noise warp plus a blur (blurSize 2,
	// noiseInfo drifting 0.2 per cycle) that both clear over the last ~30%
	// (blur_live_time 0.781, wave_progress.y = remap01(0.7, 1, p)). The warp
	// is the displacement raster pass; with a per-grapheme document the pass
	// follows the strongest unit, so it keeps boiling until the last
	// character settles — matching the source's global clear wave. Dropped:
	// the warp shader's exact noise (ours is the shared value-noise field).
	"warp-blur-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.25 },
		effect: {
			kind: "keyframes",
			rasterScale: 24,
			rasterEvolution: 1.5,
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.6, outTime: 0.22 },
					{ t: 1, v: 1, inValue: 0.93, inTime: -0.48 },
				],
				scaleX: [
					{ t: 0, v: 0.95, outValue: 0.98, outTime: 0.22 },
					{ t: 1, v: 1, inValue: 0.9965, inTime: -0.48 },
				],
				scaleY: [
					{ t: 0, v: 0.95, outValue: 0.98, outTime: 0.22 },
					{ t: 1, v: 1, inValue: 0.9965, inTime: -0.48 },
				],
				displaceAmplitudePx: [
					{ t: 0, v: 6 },
					{ t: 0.55, v: 4 },
					{ t: 0.8, v: 0 },
					{ t: 1, v: 0 },
				],
				blurPx: [
					{ t: 0, v: 6 },
					{ t: 0.55, v: 4 },
					{ t: 0.8, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 描边填充 (7308269965453300262), D=0.9. The line arrives as pure
	// stroke copies sliding in from off-axis (offset 0.25·(1−ss), ss on the
	// sharp-attack bezier (.027,.82,.667,1), alpha on (.027,.28,.667,1)),
	// the block holds 82% scale until halfway then settles to 100%
	// (ADBE_Scale_0_0: 82→100 over frames 25–44, S-eased), and the fill pops
	// word-by-word over the last third (alpha_p = remap01(0.67, 1, p)) — the
	// stroke hides where the fill lands. The stroke↔fill swap is the
	// outlineAmount channel; word order and the pop spread come from the
	// word-unit stagger. Dropped: the extra echo copies (6 staggered offsets
	// per clone) and the alternating ± slide direction — one stroke layer
	// slides from above.
	"stroke-fill-in": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.28, outTime: 0.004 },
					{ t: 0.15, v: 1, inValue: 1, inTime: -0.05 },
				],
				translateYEm: [
					{ t: 0, v: -1.2, outValue: -0.21, outTime: 0.014 },
					{ t: 0.5, v: 0, inValue: 0, inTime: -0.167 },
				],
				outlineAmount: [
					{ t: 0, v: 1 },
					{ t: 0.68, v: 1 },
					{ t: 0.78, v: 0 },
					{ t: 1, v: 0 },
				],
				scaleX: [
					{ t: 0, v: 0.82 },
					{ t: 0.5, v: 0.82, outValue: 0.82, outTime: 0.167 },
					{ t: 1, v: 1, inValue: 0.998, inTime: -0.167 },
				],
				scaleY: [
					{ t: 0, v: 0.82 },
					{ t: 0.5, v: 0.82, outValue: 0.82, outTime: 0.167 },
					{ t: 1, v: 1, inValue: 0.998, inTime: -0.167 },
				],
			},
		},
	},
	// 剪映 发光闪入 (7308272157442707978), D=2 from the driver. Each character's
	// alpha is pow(noise, 1.5) flicker that "recovers" to solid in character
	// order over the back half while a glow halo burns early and dies by ~95%.
	// The noise is transcribed as a low-biased flicker track whose minima rise
	// toward 1 (the driver's mix(noise, 1, p) recovery), decorrelated across
	// characters by the stagger; the halo rides the per-unit glow channels so
	// each character's flicker modulates its own glow. Dropped: the second
	// clone-layer noise (glow already tracks the glyph alpha here); the
	// self-colored glow (u_TextColor) — ours stays white.
	"glow-flicker-in": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 0.6 },
					{ t: 0.12, v: 0.15 },
					{ t: 0.19, v: 0.85 },
					{ t: 0.26, v: 0.1 },
					{ t: 0.33, v: 0.7 },
					{ t: 0.4, v: 0.25 },
					{ t: 0.47, v: 0.9 },
					{ t: 0.54, v: 0.3 },
					{ t: 0.61, v: 0.95 },
					{ t: 0.68, v: 0.45 },
					{ t: 0.75, v: 1 },
					{ t: 0.82, v: 0.7 },
					{ t: 0.9, v: 1 },
					{ t: 1, v: 1 },
				],
				glowIntensity: [
					{ t: 0, v: 0.9 },
					{ t: 0.7, v: 0.55 },
					{ t: 0.95, v: 0 },
					{ t: 1, v: 0 },
				],
				glowRadiusPx: [{ t: 0, v: 14 }],
			},
		},
	},
};

export const EXIT_TEXTANIM_DOCUMENTS_B: Record<string, Doc> = {
	// 剪映 模糊发光 (7301536173959156274). The block turns edge-on about Y (89°
	// over the first ~19 frames, easing hard out) while its height stretches to
	// 110% and then crushes to 85% — the source pairs that with a heavy
	// directional-blur and glow stack, which is dropped; the turn plus the
	// squash is what carries the exit. rotationYDeg renders as 2D
	// foreshortening, so the line thins away as it rotates.
	"blur-glow-out": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			channels: {
				rotationYDeg: [
					{ t: 0, v: 0, outValue: 0, outTime: 0.56 },
					{ t: 0.567, v: 89, inValue: 89, inTime: -0.19 },
					{ t: 0.649, v: 109 },
					{ t: 1, v: 109 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.147, v: 1 },
					{ t: 0.561, v: 1.1, inValue: 1.1, inTime: -0.28 },
					{ t: 1, v: 0.85, inValue: 0.85, inTime: -0.29 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.7, v: 1 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 向左解散 (7083752251742753287). The exit twin of 向右集合: identical
	// constants and stagger, played as a dispersal — each glyph slides half a
	// text box to the left, the line coming apart from the right end first.
	"scatter-left": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				translateXEm: [
					{ t: 0, v: 0 },
					{ t: 0.125, v: -0.007 },
					{ t: 0.25, v: -0.033 },
					{ t: 0.375, v: -0.088 },
					{ t: 0.5, v: -0.184 },
					{ t: 0.625, v: -0.348 },
					{ t: 0.75, v: -0.623 },
					{ t: 0.875, v: -1.1 },
					{ t: 1, v: -2 },
				],
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.6, v: 1 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 发光闪出 (7308275717505028617). Verbatim the 发光闪入 driver plus
	// `progress = 1 - progress` (confirmed by package diff), so this document
	// is the entrance track time-reversed: solid characters destabilize into
	// pow(noise, 1.5) flicker — minima sinking instead of rising — while the
	// glow ignites and burns brightest at the vanish point. The reversed
	// recovery order means the LAST character breaks up first, hence
	// order "reverse". Same drops as the entrance (clone-layer noise,
	// self-colored glow).
	"glow-flicker-out": {
		sequence: { unit: "grapheme", order: "reverse", staggerRatio: 0.3 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 1 },
					{ t: 0.1, v: 1 },
					{ t: 0.18, v: 0.7 },
					{ t: 0.25, v: 1 },
					{ t: 0.32, v: 0.45 },
					{ t: 0.39, v: 0.95 },
					{ t: 0.46, v: 0.3 },
					{ t: 0.53, v: 0.9 },
					{ t: 0.6, v: 0.25 },
					{ t: 0.67, v: 0.7 },
					{ t: 0.74, v: 0.1 },
					{ t: 0.81, v: 0.85 },
					{ t: 0.88, v: 0.15 },
					{ t: 0.95, v: 0.6 },
					{ t: 1, v: 0 },
				],
				glowIntensity: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 0 },
					{ t: 0.3, v: 0.55 },
					{ t: 1, v: 0.9 },
				],
				glowRadiusPx: [{ t: 0, v: 14 }],
			},
		},
	},
};

export const LOOP_TEXTANIM_DOCUMENTS_B: Record<string, Doc> = {
	// 剪映 环形滚动 (7179135028343870012). Not a circular path — a modulo
	// marquee: every character slides one full wrap period (line width +
	// 200 px ≈ 3.5 em) per cycle and re-enters from the far edge, odd rows
	// running the opposite way. The parametric marquee kind IS that formula
	// (mix over one period, mod, recenter), so nothing is approximated; the
	// source's commented-out edge fade never runs and is not carried.
	"ring-scroll": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: { kind: "marquee", gapEm: 3.5, alternate: true },
	},
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
	// 剪映 色差故障 (6835878163575214605). Chromatic-aberration glitch: the
	// source pushes a per-character offset vector into a channel-splitting
	// shader so the red and cyan fringes jump around the text. The raster pass
	// reproduces the look block-wide — the separation is keyframed to stutter
	// rather than drift, which is what makes it read as a glitch. The source's
	// per-character offset directions are not representable block-wide.
	"chroma-glitch": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterAngleDeg: 0,
			channels: {
				rgbSplitPx: [
					{ t: 0, v: 0 },
					{ t: 0.08, v: 0 },
					{ t: 0.09, v: 7 },
					{ t: 0.16, v: 7 },
					{ t: 0.17, v: 0 },
					{ t: 0.38, v: 0 },
					{ t: 0.39, v: -5 },
					{ t: 0.46, v: -5 },
					{ t: 0.47, v: 0 },
					{ t: 0.7, v: 0 },
					{ t: 0.71, v: 9 },
					{ t: 0.8, v: 9 },
					{ t: 0.81, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 水墨晕开 (7134190113780666887 family). Ink-bleed boil: the glyph
	// edges wobble on a slowly evolving noise field rather than moving as a
	// whole. The displacement pass is the general form of that shader — bands
	// of the rendered block offset by value noise, advancing over the cycle.
	"ink-boil": {
		sequence: { unit: "all", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "keyframes",
			rasterScale: 18,
			rasterEvolution: 6,
			channels: {
				displaceAmplitudePx: [{ t: 0, v: 2.2 }],
			},
		},
	},
	// 剪映 超强晃动 (7065208406633615909). Every glyph shakes on its own seeded
	// frequency and amplitude — the driver rolls a per-character frequency
	// (around 6) and rotation range (±30° on Z, ±10/±15 on X/Y) plus a 0.2–0.5
	// character-width wobble. QCut's jitter is that same per-unit stepped
	// shake, so the parametric kind is the mechanism rather than an
	// approximation; the source's X/Y tilts are dropped (Z dominates).
	"wild-shake": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0 },
		effect: {
			kind: "jitter",
			steps: 24,
			amplitudeX: 0.35,
			amplitudeY: 0.35,
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
