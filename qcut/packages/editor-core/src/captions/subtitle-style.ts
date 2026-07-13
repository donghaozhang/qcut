/**
 * Subtitle style utilities — shared between CLI and renderer.
 *
 * Pure functions with no browser/React dependencies.
 *
 * @module @qcut/editor-core/captions/subtitle-style
 */

import type { SubtitleStyle } from "../types/timeline.js";

/** Default subtitle style used as fallback when no style is set */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
	fontFamily: "Arial",
	fontSize: 48,
	letterSpacing: 0,
	textAlign: "center",
	fontColor: "#ffffff",
	fontOpacity: 1,
	bold: false,
	italic: false,
	underline: false,
	outlineColor: "#000000",
	outlineWidth: 2,
	shadowColor: "#000000",
	shadowOffset: { x: 1, y: 1 },
	backgroundColor: "#000000",
	bgOpacity: 0.8,
	position: {
		align: "bottom",
		x: 50,
		y: 90,
	},
	lineSpacing: 1.4,
	animationType: "none",
	animationDuration: 0.6,
	animationDelay: 0,
};

/** Resolve a caption's style, falling back to defaults for missing fields */
export function resolveSubtitleStyle(
	style?: Partial<SubtitleStyle>
): SubtitleStyle {
	if (!style)
		return {
			...DEFAULT_SUBTITLE_STYLE,
			shadowOffset: { ...DEFAULT_SUBTITLE_STYLE.shadowOffset },
			position: { ...DEFAULT_SUBTITLE_STYLE.position },
		};
	return {
		...DEFAULT_SUBTITLE_STYLE,
		...style,
		shadowOffset: {
			...DEFAULT_SUBTITLE_STYLE.shadowOffset,
			...style.shadowOffset,
		},
		position: {
			...DEFAULT_SUBTITLE_STYLE.position,
			...style.position,
		},
	};
}

/** Convert hex color + opacity to rgba string */
export function hexToRgba(hex: string, opacity: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Convert RGB hex to ASS color format (&HAABBGGRR)
 * ASS uses BGR order with alpha where 00 = fully opaque
 */
export function rgbToASSColor(hex: string, opacity: number): string {
	const r = hex.slice(1, 3);
	const g = hex.slice(3, 5);
	const b = hex.slice(5, 7);
	const a = Math.round((1 - opacity) * 255)
		.toString(16)
		.padStart(2, "0");
	return `&H${a}${b}${g}${r}`.toUpperCase();
}

/** Convert ASS color (&HAABBGGRR) to hex + opacity */
export function assColorToRgb(assColor: string): {
	hex: string;
	opacity: number;
} {
	const color = assColor.replace(/^&H/i, "");
	const padded = color.padStart(8, "0");
	const a = parseInt(padded.slice(0, 2), 16);
	const b = padded.slice(2, 4);
	const g = padded.slice(4, 6);
	const r = padded.slice(6, 8);
	return {
		hex: `#${r}${g}${b}`.toLowerCase(),
		opacity: 1 - a / 255,
	};
}

/** Map SubtitleStyle alignment to ASS alignment number (numpad layout) */
export function alignToASSAlignment(
	align: SubtitleStyle["position"]["align"],
	textAlign: SubtitleStyle["textAlign"] = "center"
): number {
	const horizontalOffset =
		textAlign === "left" ? 1 : textAlign === "right" ? 3 : 2;
	if (align === "top") return 6 + horizontalOffset;
	if (align === "center") return 3 + horizontalOffset;
	return horizontalOffset;
}

export function assAlignmentToTextAlign(
	alignment: number
): SubtitleStyle["textAlign"] {
	const column = ((Math.max(1, alignment) - 1) % 3) + 1;
	if (column === 1) return "left";
	if (column === 3) return "right";
	return "center";
}

/** Map ASS alignment number back to SubtitleStyle alignment */
export function assAlignmentToAlign(
	alignment: number
): SubtitleStyle["position"]["align"] {
	if (alignment >= 7) return "top";
	if (alignment >= 4) return "center";
	return "bottom";
}
