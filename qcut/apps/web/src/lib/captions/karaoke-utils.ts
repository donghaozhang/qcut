// Adapted from OpenReel Video (MIT License)

/**
 * Karaoke utility functions — pure rendering logic for 6 animation modes.
 *
 * Each mode function takes word-level timing data + current playback time
 * and returns per-word render state (color, scale, opacity, offset).
 *
 * No React or browser dependencies — directly unit-testable.
 *
 * @module lib/captions/karaoke-utils
 */

import type { WordItem } from "@/types/word-timeline";
import type { KaraokeMode, KaraokeSegment } from "./karaoke-types";

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** Bounce easing for the bounce animation mode */
function easeOutBounce(t: number): number {
	const n1 = 7.5625;
	const d1 = 2.75;
	let v = t;
	if (v < 1 / d1) return n1 * v * v;
	if (v < 2 / d1) {
		v -= 1.5 / d1;
		return n1 * v * v + 0.75;
	}
	if (v < 2.5 / d1) {
		v -= 2.25 / d1;
		return n1 * v * v + 0.9375;
	}
	v -= 2.625 / d1;
	return n1 * v * v + 0.984375;
}

/**
 * Standard CSS cubic-bezier easing: solves x(t) = progress for t, returns
 * y(t). Newton iteration is plenty at render precision.
 */
function cubicBezier(
	x1: number,
	y1: number,
	x2: number,
	y2: number
): (progress: number) => number {
	const sample = (t: number, a: number, b: number) =>
		3 * t * (1 - t) * (1 - t) * a + 3 * t * t * (1 - t) * b + t * t * t;
	return (progress: number) => {
		const x = clamp(progress, 0, 1);
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		let t = x;
		for (let i = 0; i < 6; i++) {
			const error = sample(t, x1, x2) - x;
			if (Math.abs(error) < 1e-4) break;
			const dx =
				3 * (1 - t) * (1 - t) * x1 +
				6 * t * (1 - t) * (x2 - x1) +
				3 * t * t * (1 - x2);
			if (Math.abs(dx) < 1e-6) break;
			t -= error / dx;
			t = clamp(t, 0, 1);
		}
		return sample(t, y1, y2);
	};
}

/** 缩小's slam curve; the source drives each spoken word 10→1 with it. */
const slamEase = cubicBezier(0.43, 0.09, 0.44, 0.96);
/** 扩展's sharp-attack spread curve. */
const expandEase = cubicBezier(0.074, 0, 0.324, 1);
/** 律动's beat ease. */
const pulseEase = cubicBezier(0.72, 0, 0.28, 1);

/** 弹簧's elastic-out: exp(−7t)·sin((t−0.075)·2π/0.3)+1, from its driver. */
function springElastic(t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	return Math.exp(-7 * t) * Math.sin(((t - 0.075) * 2 * Math.PI) / 0.3) + 1;
}

/** A word's 0..1 progress through its own spoken slot. */
function wordProgress(word: WordItem, time: number): number {
	return clamp(
		(time - word.start) / Math.max(0.05, word.end - word.start),
		0,
		1
	);
}

/**
 * Shared shape for the Jianying caption-pool entrance mechanisms: words
 * before their slot are hidden, the active word plays `animate(progress)`,
 * spoken words rest. Curves are transcribed from the caption-pool drivers
 * (docs/task/jianying-text-anim-port/RECLASS-2026-08.md) — here they run on
 * the real word clock the sources used.
 */
function wordEntrance(
	words: WordItem[],
	time: number,
	animate: (progress: number) => Pick<KaraokeSegment, "opacity" | "scale">
): KaraokeSegment[] {
	return words.map((word) => {
		if (time < word.start) {
			return {
				wordId: word.id,
				text: word.text,
				state: "hidden" as const,
				opacity: 0,
				scale: 1,
				offsetY: 0,
			};
		}
		if (time >= word.end) {
			return {
				wordId: word.id,
				text: word.text,
				state: "completed" as const,
				opacity: 1,
				scale: 1,
				offsetY: 0,
			};
		}
		return {
			wordId: word.id,
			text: word.text,
			state: "active" as const,
			offsetY: 0,
			...animate(wordProgress(word, time)),
		};
	});
}

/** 剪映 缩小: the word slams from large to rest (source 10×, toned to 3×). */
function slam(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.05, 0, 1),
		scale: 3 - 2 * slamEase(progress),
	}));
}

/** 剪映 弹簧: the word springs in on the driver's elastic-out. */
function spring(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.08, 0, 1),
		scale: Math.max(0, springElastic(progress)),
	}));
}

/** 剪映 重叠: the word drops onto the line from 1.35×. */
function overlap(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.06, 0, 1),
		scale: 1.35 - 0.35 * clamp(progress / 0.4, 0, 1),
	}));
}

/** 剪映 扩展: the word spreads 0.85→1.06 and settles. */
function expand(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => {
		const spread = expandEase(clamp(progress / 0.5, 0, 1));
		const settle = clamp((progress - 0.5) / 0.5, 0, 1);
		return {
			opacity: clamp(progress / 0.08, 0, 1),
			scale: 0.85 + 0.21 * spread - 0.06 * settle,
		};
	});
}

/** 剪映 波形扫光: a light band brightens the word being spoken. */
function shine(
	words: WordItem[],
	time: number,
	highlightColor: string
): KaraokeSegment[] {
	return words.map((word) => {
		const isActive = time >= word.start && time < word.end;
		const progress = wordProgress(word, time);
		// The band peaks mid-word and hands off to the next.
		const band = isActive ? Math.sin(progress * Math.PI) : 0;
		return {
			wordId: word.id,
			text: word.text,
			state: isActive
				? ("active" as const)
				: time >= word.end
					? ("completed" as const)
					: ("upcoming" as const),
			opacity: 1,
			scale: 1 + 0.06 * band,
			offsetY: 0,
			...(band > 0.25 ? { color: highlightColor } : {}),
		};
	});
}

/** 剪映 律动: the spoken word bumps on the beat ease (RGB split dropped). */
function pulse(words: WordItem[], time: number): KaraokeSegment[] {
	return words.map((word) => {
		const isActive = time >= word.start && time < word.end;
		const progress = wordProgress(word, time);
		// Up fast, dip, settle — the driver's beat shape on (.72,0,.28,1).
		const beat = isActive
			? progress < 0.3
				? 1 + 0.12 * pulseEase(progress / 0.3)
				: progress < 0.55
					? 1.12 - 0.14 * pulseEase((progress - 0.3) / 0.25)
					: 0.98 + 0.02 * pulseEase((progress - 0.55) / 0.45)
			: 1;
		return {
			wordId: word.id,
			text: word.text,
			state: isActive
				? ("active" as const)
				: time >= word.end
					? ("completed" as const)
					: ("upcoming" as const),
			opacity: 1,
			scale: beat,
			offsetY: 0,
		};
	});
}

/** Deterministic per-word hash in [0,1): seeded flicker without Math.random. */
function seededUnit(wordId: string, salt: number): number {
	let state = salt >>> 0;
	for (let i = 0; i < wordId.length; i++) {
		state = Math.imul(state ^ wordId.charCodeAt(i), 0x9e3779b1);
	}
	state ^= state >>> 15;
	state = Math.imul(state, 0x85ebca77);
	state ^= state >>> 13;
	return (state >>> 0) / 0xffffffff;
}

/** 向下飞入's sharp-attack rise. */
const flyEase = cubicBezier(0, 0.78, 0.2, 0.99);
/** 向下飞入's blur clear. */
const flyBlurEase = cubicBezier(0.61, 1, 0.88, 1);
/** 向右集合's shared gather ease (same constants as the text-anim port). */
const gatherEase = cubicBezier(0.16, 0.81, 0.44, 1);

/** 剪映 向下飞入: the word rises in from below on a slight diagonal, its
 * directional blur (3px step) clearing as it lands. */
function flyIn(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.15, 0, 1),
		scale: 1,
	})).map((segment, index) => {
		if (segment.state !== "active") return segment;
		const progress = wordProgress(words[index], time);
		const motion = flyEase(progress);
		return {
			...segment,
			offsetY: 26 * (1 - motion),
			offsetX: 7 * (1 - motion),
			blurPx: 3 * (1 - flyBlurEase(progress)),
		};
	});
}

/** 剪映 向右集合: the word slides in from the right on the gather ease. */
function gather(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.12, 0, 1),
		scale: 1,
	})).map((segment, index) => {
		if (segment.state !== "active") return segment;
		const progress = wordProgress(words[index], time);
		return { ...segment, offsetX: 36 * (1 - gatherEase(progress)) };
	});
}

/** 剪映 空翻: the word somersaults a full turn into place. */
function flip(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.1, 0, 1),
		scale: 0.6 + 0.4 * gatherEase(progress),
	})).map((segment, index) => {
		if (segment.state !== "active") return segment;
		const progress = wordProgress(words[index], time);
		return { ...segment, rotationDeg: 360 * (1 - gatherEase(progress)) };
	});
}

/** 剪映 模糊滚动: the word rolls through a blur with the driver's pulse
 * train — mix(1,1.5)·mix(1,.7)·mix(1,.7)·mix(1,1.2) over its slot. */
function blurRoll(words: WordItem[], time: number): KaraokeSegment[] {
	return words.map((word) => {
		const isActive = time >= word.start && time < word.end;
		if (!isActive) {
			const done = time >= word.end;
			return {
				wordId: word.id,
				text: word.text,
				state: done ? ("completed" as const) : ("hidden" as const),
				opacity: done ? 1 : 0,
				scale: 1,
				offsetY: 0,
			};
		}
		const progress = wordProgress(word, time);
		const stage = (from: number, to: number) =>
			clamp((progress - from) / Math.max(0.001, to - from), 0, 1);
		const scale =
			(1 + 0.5 * stage(0, 0.3)) *
			(1 - 0.3 * stage(0.3, 0.55)) *
			(1 - 0.3 * stage(0.55, 0.75)) *
			(1 + 0.2 * stage(0.75, 1));
		return {
			wordId: word.id,
			text: word.text,
			state: "active" as const,
			opacity: clamp(progress / 0.1, 0, 1),
			scale,
			offsetY: 8 * (1 - gatherEase(progress)),
			blurPx: 4 * (1 - clamp(progress / 0.6, 0, 1)),
		};
	});
}

/** 剪映 故障闪烁: the active word stutters through seeded alpha flicker
 * with highlight flashes (the driver rolls a random alpha per step). */
function glitch(
	words: WordItem[],
	time: number,
	highlightColor: string
): KaraokeSegment[] {
	return words.map((word) => {
		const isActive = time >= word.start && time < word.end;
		const done = time >= word.end;
		if (!isActive) {
			return {
				wordId: word.id,
				text: word.text,
				state: done ? ("completed" as const) : ("hidden" as const),
				opacity: done ? 1 : 0,
				scale: 1,
				offsetY: 0,
			};
		}
		const progress = wordProgress(word, time);
		const step = Math.floor(progress * 8);
		const flickerAlpha = 0.35 + 0.65 * seededUnit(word.id, step + 1);
		const flash = seededUnit(word.id, step + 101) > 0.6;
		return {
			wordId: word.id,
			text: word.text,
			state: "active" as const,
			// Settles solid over the last quarter of the slot.
			opacity: progress > 0.75 ? 1 : flickerAlpha,
			scale: 1,
			offsetY: 0,
			offsetX: flash ? (seededUnit(word.id, step + 201) - 0.5) * 4 : 0,
			...(flash && progress <= 0.75 ? { color: highlightColor } : {}),
		};
	});
}

/** 剪映 调皮: the word dips and rocks −15°→+15°→0 (the mischief-hop pair
 * of tracks from the text-anim port, on the word clock). */
function mischief(words: WordItem[], time: number): KaraokeSegment[] {
	return wordEntrance(words, time, (progress) => ({
		opacity: clamp(progress / 0.08, 0, 1),
		scale: 1,
	})).map((segment, index) => {
		if (segment.state !== "active") return segment;
		const progress = wordProgress(words[index], time);
		const dip =
			progress < 0.2
				? 0
				: progress < 0.4
					? (progress - 0.2) / 0.2
					: progress < 0.76
						? 1 - (progress - 0.4) / 0.36
						: 0;
		const rock =
			progress < 0.2
				? -15 * (progress / 0.2)
				: progress < 0.76
					? -15 + 30 * ((progress - 0.2) / 0.56)
					: 15 * (1 - (progress - 0.76) / 0.24);
		return {
			...segment,
			offsetY: 6 * dip,
			rotationDeg: rock,
		};
	});
}

/** Word highlight: current word changes color + scales up 15%, floats up 2px */
function wordHighlight(
	words: WordItem[],
	time: number,
	highlightColor: string
): KaraokeSegment[] {
	return words.map((word) => {
		const isActive = time >= word.start && time < word.end;
		const isComplete = time >= word.end;
		return {
			wordId: word.id,
			text: word.text,
			state: isActive ? "active" : isComplete ? "completed" : "upcoming",
			opacity: 1,
			scale: isActive ? 1.15 : 1,
			offsetY: isActive ? -2 : 0,
			color: isActive || isComplete ? highlightColor : undefined,
		};
	});
}

/** Karaoke fill: progressive left-to-right CSS gradient color sweep per word */
function karaokeFill(
	words: WordItem[],
	time: number,
	highlightColor: string,
	upcomingColor: string
): KaraokeSegment[] {
	return words.map((word) => {
		const duration = word.end - word.start;
		const elapsed = time - word.start;
		const progress = duration > 0 ? clamp(elapsed / duration, 0, 1) : 0;
		const isUpcoming = time < word.start;
		const isActive = time >= word.start && time < word.end;
		const isComplete = time >= word.end;

		let color: string | undefined;
		if (isUpcoming) color = upcomingColor;
		else if (isComplete) color = highlightColor;
		else if (isActive) {
			const pct = Math.round(progress * 100);
			color = `linear-gradient(90deg, ${highlightColor} ${pct}%, ${upcomingColor} ${pct}%)`;
		}

		return {
			wordId: word.id,
			text: word.text,
			state: isActive ? "active" : isComplete ? "completed" : "upcoming",
			opacity: 1,
			scale: isActive ? 1.05 : 1,
			offsetY: 0,
			color,
		};
	});
}

/** Word-by-word: show only the active word at a time */
function wordByWord(words: WordItem[], time: number): KaraokeSegment[] {
	const activeWord = words.find((w) => time >= w.start && time < w.end);
	if (!activeWord) {
		// After all words: show last word as completed
		const lastWord = words[words.length - 1];
		if (lastWord && time >= lastWord.end) {
			return [
				{
					wordId: lastWord.id,
					text: lastWord.text,
					state: "completed",
					opacity: 1,
					scale: 1,
					offsetY: 0,
				},
			];
		}
		return [];
	}
	return [
		{
			wordId: activeWord.id,
			text: activeWord.text,
			state: "active",
			opacity: 1,
			scale: 1,
			offsetY: 0,
		},
	];
}

/** Bounce: words bounce in with easeOutBounce easing */
function bounce(words: WordItem[], time: number): KaraokeSegment[] {
	const animDuration = 0.3;
	return words.map((word) => {
		if (time < word.start) {
			return {
				wordId: word.id,
				text: word.text,
				state: "hidden" as const,
				opacity: 0,
				scale: 0,
				offsetY: 20,
			};
		}
		const timeSinceStart = time - word.start;
		const progress = clamp(timeSinceStart / animDuration, 0, 1);
		const bp = easeOutBounce(progress);
		const isActive = time >= word.start && time < word.end;
		return {
			wordId: word.id,
			text: word.text,
			state: isActive ? ("active" as const) : ("completed" as const),
			opacity: bp,
			scale: 0.5 + bp * 0.5,
			offsetY: 20 * (1 - bp),
		};
	});
}

/** Typewriter: words appear sequentially, last word fades in */
function typewriter(words: WordItem[], time: number): KaraokeSegment[] {
	const visible = words.filter((w) => time >= w.start);
	if (visible.length === 0) return [];
	return visible.map((word, i) => {
		const isLast = i === visible.length - 1;
		const opacity = isLast ? clamp((time - word.start) / 0.1, 0, 1) : 1;
		return {
			wordId: word.id,
			text: word.text,
			state: "active" as const,
			opacity,
			scale: 1,
			offsetY: 0,
		};
	});
}

/** Static: all words visible with no animation */
function staticMode(words: WordItem[]): KaraokeSegment[] {
	return words.map((w) => ({
		wordId: w.id,
		text: w.text,
		state: "completed" as const,
		opacity: 1,
		scale: 1,
		offsetY: 0,
	}));
}

/**
 * Main entry: compute per-word render state based on karaoke mode.
 *
 * @param words - Word items with timing data
 * @param currentTime - Current playback time in seconds
 * @param mode - Karaoke animation mode
 * @param highlightColor - Color for active/completed words (default: "#ffff00")
 * @param upcomingColor - Color for upcoming words in karaoke-fill mode (default: "rgba(255,255,255,0.5)")
 * @returns Array of KaraokeSegment render states
 */
export function getKaraokeSegments(
	words: WordItem[],
	currentTime: number,
	mode: KaraokeMode,
	highlightColor = "#ffff00",
	upcomingColor = "rgba(255, 255, 255, 0.5)"
): KaraokeSegment[] {
	if (words.length === 0) return [];

	switch (mode) {
		case "word-highlight":
			return wordHighlight(words, currentTime, highlightColor);
		case "karaoke":
			return karaokeFill(words, currentTime, highlightColor, upcomingColor);
		case "word-by-word":
			return wordByWord(words, currentTime);
		case "bounce":
			return bounce(words, currentTime);
		case "typewriter":
			return typewriter(words, currentTime);
		case "slam":
			return slam(words, currentTime);
		case "spring":
			return spring(words, currentTime);
		case "overlap":
			return overlap(words, currentTime);
		case "expand":
			return expand(words, currentTime);
		case "shine":
			return shine(words, currentTime, highlightColor);
		case "pulse":
			return pulse(words, currentTime);
		case "fly-in":
			return flyIn(words, currentTime);
		case "gather":
			return gather(words, currentTime);
		case "flip":
			return flip(words, currentTime);
		case "blur-roll":
			return blurRoll(words, currentTime);
		case "glitch":
			return glitch(words, currentTime, highlightColor);
		case "mischief":
			return mischief(words, currentTime);
		default:
			return staticMode(words);
	}
}

// Re-export for testing
export { clamp, easeOutBounce };
