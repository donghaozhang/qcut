/**
 * Export CLI Filters - Barrel Export
 *
 * Re-exports all filter-related utilities for convenient imports.
 */

// Text escape utilities
export {
	escapeTextForFFmpeg,
	escapePathForFFmpeg,
	colorToFFmpeg,
} from "./text-escape";

// Font resolution
export { resolveFontPath, WINDOWS_FONT_BASE_PATH } from "./font-resolver";

// Text overlay filter building
export {
	convertTextElementToDrawtext,
	buildTextOverlayFilters,
} from "./text-overlay";

// Sticker overlay filter building
export { buildStickerOverlayFilters } from "./sticker-overlay";

// Image overlay filter building
export {
	buildImageOverlayFilters,
	getImageInputStartIndex,
} from "./image-overlay";

// Caption overlay filter building
export { buildCaptionOverlayFilters } from "./caption-overlay";
