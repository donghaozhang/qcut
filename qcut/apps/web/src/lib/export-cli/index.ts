/**
 * Export CLI Module - Main Barrel Export
 *
 * Provides modular utilities for video export via FFmpeg CLI.
 * Extracted from export-engine-cli.ts for better maintainability.
 *
 * @example
 * // Import specific utilities
 * import { escapeTextForFFmpeg, resolveFontPath } from "@/lib/export-cli/filters";
 * import { extractVideoSources } from "@/lib/export-cli/sources";
 *
 * // Or import from main barrel
 * import { buildTextOverlayFilters, buildStickerOverlayFilters } from "@/lib/export-cli";
 */

// Types
export type {
	VideoSourceInput,
	EffectOverlaySourceInput,
	AudioFileInput,
	StickerSourceForFilter,
	ProgressCallback,
	FontConfig,
	Platform,
	TextElement,
} from "./types";

// Filters
export {
	// Text escape utilities
	escapeTextForFFmpeg,
	escapePathForFFmpeg,
	colorToFFmpeg,
	// Font resolution
	resolveFontPath,
	WINDOWS_FONT_BASE_PATH,
	// Text overlay
	convertTextElementToDrawtext,
	buildTextOverlayFilters,
	// Sticker overlay
	buildStickerOverlayFilters,
} from "./filters";

// Sources
export {
	extractVideoSources,
	extractVideoInputPath,
	extractStickerSources,
	extractEffectOverlaySources,
} from "./sources";
