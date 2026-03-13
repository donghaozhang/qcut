import type { CaptionElement, SubtitleStyle } from "@/types/timeline";
import {
	resolveSubtitleStyle,
	rgbToASSColor,
	alignToASSAlignment,
} from "./subtitle-style";

interface ASSGeneratorOptions {
	resolution: { width: number; height: number };
	title?: string;
}

/** Generate a complete ASS file from caption elements */
export function generateASS(
	clips: CaptionElement[],
	options: ASSGeneratorOptions
): string {
	const { resolution, title = "QCut Export" } = options;

	// Collect unique styles
	const styleMap = new Map<string, SubtitleStyle>();
	for (const clip of clips) {
		const resolved = resolveSubtitleStyle(clip.style);
		const key = JSON.stringify(resolved);
		if (!styleMap.has(key)) {
			styleMap.set(key, resolved);
		}
	}

	// Assign style names
	const styleNames = new Map<string, string>();
	let styleIndex = 0;
	for (const [key, _style] of styleMap) {
		styleNames.set(key, styleIndex === 0 ? "Default" : `Style${styleIndex}`);
		styleIndex++;
	}

	// Build script info
	let content = `[Script Info]
Title: ${title}
ScriptType: v4.00+
PlayResX: ${resolution.width}
PlayResY: ${resolution.height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`;

	// Write style lines
	for (const [key, style] of styleMap) {
		const name = styleNames.get(key) || "Default";
		content += `Style: ${subtitleStyleToASSLine(name, style)}\n`;
	}

	// Write events
	content += `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

	for (const clip of clips) {
		const resolved = resolveSubtitleStyle(clip.style);
		const key = JSON.stringify(resolved);
		const styleName = styleNames.get(key) || "Default";
		const startTime = secondsToASSTime(clip.startTime);
		const endTime = secondsToASSTime(clip.startTime + clip.duration);
		const text = clip.text.trim().replace(/\n/g, "\\N");
		content += `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${text}\n`;
	}

	return content;
}

function subtitleStyleToASSLine(name: string, style: SubtitleStyle): string {
	const primary = rgbToASSColor(style.fontColor, style.fontOpacity);
	const secondary = "&H00FFFFFF";
	const outline = rgbToASSColor(style.outlineColor, 1);
	const back = rgbToASSColor(style.shadowColor, 1);
	const bold = style.bold ? -1 : 0;
	const italic = style.italic ? -1 : 0;
	const underline = style.underline ? 1 : 0;
	const alignment = alignToASSAlignment(style.position.align);
	const marginV = Math.round(style.position.y);
	const shadow =
		style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0 ? 1 : 0;

	return [
		name,
		style.fontFamily,
		style.fontSize,
		primary,
		secondary,
		outline,
		back,
		bold,
		italic,
		underline,
		0, // StrikeOut
		100, // ScaleX
		100, // ScaleY
		0, // Spacing
		0, // Angle
		1, // BorderStyle
		style.outlineWidth,
		shadow,
		alignment,
		10, // MarginL
		10, // MarginR
		marginV,
		1, // Encoding
	].join(",");
}

/** Convert seconds to ASS time format (H:MM:SS.cc) */
function secondsToASSTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const cs = Math.floor((seconds % 1) * 100);
	return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}
