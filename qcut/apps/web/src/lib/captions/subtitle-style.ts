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
	assAlignmentToTextAlign,
	CAPTION_ANIMATION_TYPES,
	resolveCaptionAnimation,
	getCaptionAnimationState,
} from "@qcut/editor-core";

import { hexToRgba } from "@qcut/editor-core";

/** Convert SubtitleStyle to CSS properties for DOM-based rendering */
export function subtitleStyleToCSS({
	style,
	canvasScale = 1,
}: {
	style: SubtitleStyle;
	canvasScale?: number;
}): React.CSSProperties {
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
		fontSize: `${style.fontSize * canvasScale}px`,
		letterSpacing: `${style.letterSpacing * canvasScale}px`,
		color: style.fontColor,
		opacity: style.fontOpacity,
		fontWeight,
		fontStyle,
		textDecoration,
		textShadow: `${style.shadowOffset.x * canvasScale}px ${style.shadowOffset.y * canvasScale}px ${2 * canvasScale}px ${style.shadowColor}`,
		WebkitTextStroke:
			style.outlineWidth > 0
				? `${style.outlineWidth * canvasScale}px ${style.outlineColor}`
				: undefined,
		backgroundColor:
			style.bgOpacity > 0
				? hexToRgba(style.backgroundColor, style.bgOpacity)
				: "transparent",
		lineHeight: `${style.lineSpacing}`,
		textAlign: style.textAlign,
		padding: `${8 * canvasScale}px ${16 * canvasScale}px`,
		borderRadius: `${4 * canvasScale}px`,
		maxWidth: "80%",
		alignSelf: alignMap[style.position.align],
	};
}
