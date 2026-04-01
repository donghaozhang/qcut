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
		default:
			return staticMode(words);
	}
}

// Re-export for testing
export { clamp, easeOutBounce };
