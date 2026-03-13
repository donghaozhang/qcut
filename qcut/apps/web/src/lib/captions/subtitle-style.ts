/**
 * Subtitle style utilities — re-exports shared logic from @qcut/editor-core,
 * plus browser-specific `subtitleStyleToCSS`.
 */

import type { SubtitleStyle } from "@/types/timeline";

// Re-export shared utilities from editor-core
export {
	DEFAULT_SUBTITLE_STYLE,
	resolveSubtitleStyle,
	hexToRgba,
	rgbToASSColor,
	assColorToRgb,
	alignToASSAlignment,
	assAlignmentToAlign,
} from "@qcut/editor-core";

import { hexToRgba } from "@qcut/editor-core";

/** Convert SubtitleStyle to CSS properties for DOM-based rendering */
export function subtitleStyleToCSS(style: SubtitleStyle): React.CSSProperties {
	const fontWeight = style.bold ? "bold" : "normal";
	const fontStyle = style.italic ? "italic" : "normal";
	const textDecoration = style.underline ? "underline" : "none";

	const alignMap: Record<SubtitleStyle["position"]["align"], string> = {
		top: "flex-start",
		center: "center",
		bottom: "flex-end",
	};

	return {
		fontFamily: `${style.fontFamily}, sans-serif`,
		fontSize: `${style.fontSize}px`,
		color: style.fontColor,
		opacity: style.fontOpacity,
		fontWeight,
		fontStyle,
		textDecoration,
		textShadow: `${style.shadowOffset.x}px ${style.shadowOffset.y}px 2px ${style.shadowColor}`,
		WebkitTextStroke:
			style.outlineWidth > 0
				? `${style.outlineWidth}px ${style.outlineColor}`
				: undefined,
		backgroundColor:
			style.bgOpacity > 0
				? hexToRgba(style.backgroundColor, style.bgOpacity)
				: "transparent",
		lineHeight: `${style.lineSpacing}`,
		textAlign: "center" as const,
		padding: "8px 16px",
		borderRadius: "4px",
		maxWidth: "80%",
		alignSelf: alignMap[style.position.align],
	};
}
