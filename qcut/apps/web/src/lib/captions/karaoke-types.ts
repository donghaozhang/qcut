// Adapted from OpenReel Video (MIT License)

/**
 * Karaoke subtitle types — shared across rendering and export.
 *
 * @module lib/captions/karaoke-types
 */

/** Available karaoke animation modes */
export type KaraokeMode =
	| "none"
	| "word-highlight"
	| "word-by-word"
	| "karaoke"
	| "bounce"
	| "typewriter";

/** All available karaoke mode values for UI iteration */
export const KARAOKE_MODES: { value: KaraokeMode; label: string }[] = [
	{ value: "none", label: "无" },
	{ value: "word-highlight", label: "单词高亮" },
	{ value: "word-by-word", label: "逐词显示" },
	{ value: "karaoke", label: "卡拉 OK 填充" },
	{ value: "bounce", label: "弹跳" },
	{ value: "typewriter", label: "打字机" },
];

/** Per-word render state computed by karaoke utils */
export interface KaraokeSegment {
	/** ID of the source WordItem */
	wordId: string;
	/** Word text */
	text: string;
	/** Timing state relative to current playback time */
	state: "upcoming" | "active" | "completed" | "hidden";
	/** Opacity (0-1) */
	opacity: number;
	/** Scale factor (1 = normal) */
	scale: number;
	/** Vertical offset in pixels (negative = up) */
	offsetY: number;
	/** Color override — may be a CSS color or a linear-gradient string */
	color?: string;
}
