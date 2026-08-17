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
	| "typewriter"
	// Jianying caption-pool ports (docs/task/jianying-text-anim-port/RECLASS-2026-08.md):
	| "slam"
	| "spring"
	| "overlap"
	| "expand"
	| "shine"
	| "pulse"
	| "fly-in"
	| "gather"
	| "flip"
	| "blur-roll"
	| "glitch"
	| "mischief";

/** All available karaoke mode values for UI iteration */
export const KARAOKE_MODES: { value: KaraokeMode; label: string }[] = [
	{ value: "none", label: "无" },
	{ value: "word-highlight", label: "单词高亮" },
	{ value: "word-by-word", label: "逐词显示" },
	{ value: "karaoke", label: "卡拉 OK 填充" },
	{ value: "bounce", label: "弹跳" },
	{ value: "typewriter", label: "打字机" },
	{ value: "slam", label: "缩小砸入" },
	{ value: "spring", label: "弹簧" },
	{ value: "overlap", label: "重叠" },
	{ value: "expand", label: "扩展" },
	{ value: "shine", label: "扫光" },
	{ value: "pulse", label: "律动" },
	{ value: "fly-in", label: "向下飞入" },
	{ value: "gather", label: "集合" },
	{ value: "flip", label: "空翻" },
	{ value: "blur-roll", label: "模糊滚动" },
	{ value: "glitch", label: "故障闪烁" },
	{ value: "mischief", label: "调皮" },
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
	/** Horizontal offset in pixels (positive = right) */
	offsetX?: number;
	/** 2D rotation in degrees */
	rotationDeg?: number;
	/** Gaussian blur radius in pixels */
	blurPx?: number;
}
