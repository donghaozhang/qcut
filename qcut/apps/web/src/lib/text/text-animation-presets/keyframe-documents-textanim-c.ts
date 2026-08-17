import type { TextKeyframeDocument } from "./keyframe-documents-entrance-a";

/**
 * Caption-pool ports. The six sources here are karaoke word-sync drivers —
 * their clock is `textTimeData.words[i].start_time/end_time` from speech
 * alignment, one word animating per spoken slot. QCut's preset system has no
 * word clock, so every document below keeps the per-word CURVES verbatim and
 * substitutes the speech clock with word-unit stagger: words animate in
 * layout order at an even rhythm instead of on speech onsets. That
 * substitution is the one semantic drop shared by the whole file.
 */

type Doc = TextKeyframeDocument;

export const ENTRANCE_TEXTANIM_DOCUMENTS_C: Record<string, Doc> = {
	// 剪映 缩小 (7139817221617881613). Each spoken word slams from huge to
	// rest on bezier (.43,.09,.44,.96); the source shows one word at a time
	// at 10×, filling the frame. With the whole layout visible the amplitude
	// is toned to 3× so neighbouring words don't swallow each other — the
	// curve shape is the source's.
	"shrink-slam-in": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.6 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.05, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 3, outValue: 2.82, outTime: 0.237 },
					{ t: 0.55, v: 1, inValue: 1.08, inTime: -0.308 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 3, outValue: 2.82, outTime: 0.237 },
					{ t: 0.55, v: 1, inValue: 1.08, inTime: -0.308 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 弹簧 (7130873727985652232). Each word springs from nothing on the
	// driver's elastic-out — exp(−7t)·sin((t−0.075)·2π/0.3)+1 — baked here as
	// its overshoot keys (peak 1.32 at 20%, dip 0.85, settling ripples).
	"spring-pop-in": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.6 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.08, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 0 },
					{ t: 0.2, v: 1.32 },
					{ t: 0.35, v: 0.85 },
					{ t: 0.5, v: 1.09 },
					{ t: 0.65, v: 0.96 },
					{ t: 0.8, v: 1.01 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0 },
					{ t: 0.2, v: 1.32 },
					{ t: 0.35, v: 0.85 },
					{ t: 0.5, v: 1.09 },
					{ t: 0.65, v: 0.96 },
					{ t: 0.8, v: 1.01 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 重叠 (7132695115646112286). The source reveals words cumulatively,
	// the newest dropping onto the line over its neighbours. Transcribed as a
	// sharp 1.35→1 drop per word — the overlap reads from the drop landing
	// while the previous word is already resting.
	"overlap-drop-in": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.6 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.06, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 1.35, outValue: 1.24, outTime: 0.06 },
					{ t: 0.4, v: 1, inValue: 1, inTime: -0.2 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 1.35, outValue: 1.24, outTime: 0.06 },
					{ t: 0.4, v: 1, inValue: 1, inTime: -0.2 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
	// 剪映 扩展 (7252235386850644539), 44-frame word clock. Letter spacing
	// spreads 0.85→1.1 on the sharp-attack bezier (.074,0,.324,1) while the
	// word settles 0.95→1 — word-unit scaleX around the word centre IS that
	// spread. The source ends 10% wide because the next word replaces it;
	// here the word stays, so the spread overshoots and settles back to 1.
	// Dropped: the word-tail alpha fade (frames 36–44) and the small jitter.
	"expand-in": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.4 },
		effect: {
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0 },
					{ t: 0.08, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleX: [
					{ t: 0, v: 0.85, outValue: 0.87, outTime: 0.037 },
					{ t: 0.5, v: 1.06, inValue: 1.06, inTime: -0.338 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 0.95, outValue: 0.96, outTime: 0.037 },
					{ t: 0.5, v: 1, inValue: 1, inTime: -0.338 },
					{ t: 1, v: 1 },
				],
			},
		},
	},
};

export const LOOP_TEXTANIM_DOCUMENTS_C: Record<string, Doc> = {
	// 剪映 波形扫光 (7380252021711966729). The active pass is a light band
	// sweeping the word (show_white / final_alpha material drive; the
	// per-char branch is commented out in the source). A cyclic per-grapheme
	// glow-and-white flash, staggered across the line, is that sweep: each
	// character brightens as the band passes.
	"wave-shine": {
		sequence: { unit: "grapheme", order: "forward", staggerRatio: 0.95 },
		effect: {
			kind: "keyframes",
			color: "#ffffff",
			channels: {
				glowIntensity: [
					{ t: 0, v: 0 },
					{ t: 0.12, v: 0.85 },
					{ t: 0.3, v: 0 },
					{ t: 1, v: 0 },
				],
				glowRadiusPx: [{ t: 0, v: 10 }],
				colorAmount: [
					{ t: 0, v: 0 },
					{ t: 0.12, v: 0.75 },
					{ t: 0.3, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
	// 剪映 律动 (7392863172773810751). A glitchy beat per word: the word
	// bumps up in scale while an RGB separation spikes 0→15→9→2 and a
	// gaussian blur stutters (41→59→44→72→9→…→0, all on the (.72,0,.28,1)
	// beat ease). Scale and split carry the read; the blur stutter rides
	// along at preview scale.
	"rhythm-pulse": {
		sequence: { unit: "word", order: "forward", staggerRatio: 0.5 },
		effect: {
			kind: "keyframes",
			channels: {
				scaleX: [
					{ t: 0, v: 1 },
					{ t: 0.12, v: 1.12, outValue: 1.12, outTime: 0.05 },
					{ t: 0.3, v: 0.98 },
					{ t: 0.5, v: 1 },
					{ t: 1, v: 1 },
				],
				scaleY: [
					{ t: 0, v: 1 },
					{ t: 0.12, v: 1.12, outValue: 1.12, outTime: 0.05 },
					{ t: 0.3, v: 0.98 },
					{ t: 0.5, v: 1 },
					{ t: 1, v: 1 },
				],
				rgbSplitPx: [
					{ t: 0, v: 0 },
					{ t: 0.08, v: 6 },
					{ t: 0.2, v: 2.5 },
					{ t: 0.45, v: 0 },
					{ t: 1, v: 0 },
				],
			},
		},
	},
};
