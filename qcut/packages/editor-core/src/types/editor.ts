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

/** Orientation group a canvas preset is listed under in the ratio menu. */
export type CanvasPresetGroup = "landscape" | "portrait";

/** Predefined canvas size preset (e.g., 16:9, 9:16, 1:1) */
export interface CanvasPreset {
	/** Display name of the preset (e.g., "16:9", "9:16") */
	name: string;
	/** i18n key overriding `name` in menus, for locale-specific labels. */
	nameKey?: string;
	/** Preset width in pixels */
	width: number;
	/** Preset height in pixels */
	height: number;
	/** Menu section the preset belongs to; ungrouped presets list first. */
	group?: CanvasPresetGroup;
	/** i18n key for a platform annotation shown after the name (e.g. 抖音). */
	badgeKey?: string;
}
