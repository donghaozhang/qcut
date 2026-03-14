/**
 * Captions module — shared subtitle utilities for CLI and renderer.
 * @module @qcut/editor-core/captions
 */

export {
	DEFAULT_SUBTITLE_STYLE,
	resolveSubtitleStyle,
	hexToRgba,
	rgbToASSColor,
	assColorToRgb,
	alignToASSAlignment,
	assAlignmentToAlign,
} from "./subtitle-style.js";

export {
	generateASS,
	secondsToASSTime,
	type ASSGeneratorOptions,
} from "./ass-generator.js";

export {
	parseASS,
	assTimeToSeconds,
	assStyleToSubtitleStyle,
	type ASSStyle,
	type ASSEvent,
	type ASSDocument,
} from "./ass-parser.js";
