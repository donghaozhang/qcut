/**
 * Editor domain types — canvas, background, sizing.
 * Extracted from apps/web/src/types/editor.ts
 *
 * @module @qcut/editor-core/types/editor
 */

/** Types of background fill options for video canvas */
export type BackgroundType = "blur" | "mirror" | "color";

/** Canvas dimensions for video projects */
export interface CanvasSize {
	/** Canvas width in pixels */
	width: number;
	/** Canvas height in pixels */
	height: number;
}

/** Canvas sizing mode determining how dimensions are set */
export type CanvasMode = "preset" | "original" | "custom";

/** Predefined canvas size preset (e.g., 16:9, 9:16, 1:1) */
export interface CanvasPreset {
	/** Display name of the preset (e.g., "16:9", "9:16") */
	name: string;
	/** Preset width in pixels */
	width: number;
	/** Preset height in pixels */
	height: number;
}
