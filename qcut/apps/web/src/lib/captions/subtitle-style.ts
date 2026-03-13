import type { SubtitleStyle } from "@/types/timeline";

/** Default subtitle style used as fallback when no style is set */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
	fontFamily: "Arial",
	fontSize: 48,
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
};

/** Resolve a caption's style, falling back to defaults for missing fields */
export function resolveSubtitleStyle(
	style?: Partial<SubtitleStyle>
): SubtitleStyle {
	if (!style) return { ...DEFAULT_SUBTITLE_STYLE };
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

/**
 * Convert ASS color (&HAABBGGRR) to hex + opacity
 */
export function assColorToRgb(assColor: string): {
	hex: string;
	opacity: number;
} {
	// Strip &H prefix
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
	align: SubtitleStyle["position"]["align"]
): number {
	switch (align) {
		case "bottom":
			return 2; // Bottom center
		case "center":
			return 5; // Middle center
		case "top":
			return 8; // Top center
	}
}

/** Map ASS alignment number back to SubtitleStyle alignment */
export function assAlignmentToAlign(
	alignment: number
): SubtitleStyle["position"]["align"] {
	if (alignment >= 7) return "top";
	if (alignment >= 4) return "center";
	return "bottom";
}
