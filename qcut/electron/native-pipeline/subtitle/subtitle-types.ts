/**
 * Subtitle types and utilities for CLI use.
 *
 * Mirrors @qcut/editor-core types to avoid cross-rootDir imports.
 * These are the same types used in packages/editor-core/src/types/timeline.ts.
 *
 * @module electron/native-pipeline/subtitle/subtitle-types
 */

/** Visual style properties for subtitle/caption elements */
export interface SubtitleStyle {
	fontFamily: string;
	fontSize: number;
	fontColor: string;
	fontOpacity: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	outlineColor: string;
	outlineWidth: number;
	shadowColor: string;
	shadowOffset: { x: number; y: number };
	backgroundColor: string;
	bgOpacity: number;
	position: {
		align: "top" | "center" | "bottom";
		x: number;
		y: number;
	};
	lineSpacing: number;
}

/** Caption element for the timeline */
export interface CaptionElement {
	id: string;
	name: string;
	type: "captions";
	text: string;
	language: string;
	confidence?: number;
	source: "transcription" | "manual" | "imported";
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
	style?: SubtitleStyle;
}

/** Default subtitle style */
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
	position: { align: "bottom", x: 50, y: 90 },
	lineSpacing: 1.4,
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

/** Convert RGB hex to ASS color format (&HAABBGGRR) */
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

/** Map alignment to ASS alignment number (numpad layout) */
export function alignToASSAlignment(
	align: SubtitleStyle["position"]["align"]
): number {
	switch (align) {
		case "bottom":
			return 2;
		case "center":
			return 5;
		case "top":
			return 8;
		default:
			return 2;
	}
}

/** Map ASS alignment number to alignment */
export function assAlignmentToAlign(
	alignment: number
): SubtitleStyle["position"]["align"] {
	if (alignment >= 7) return "top";
	if (alignment >= 4) return "center";
	return "bottom";
}

// ─── ASS Generation ──────────────────────────────────────────────────

export interface ASSGeneratorOptions {
	resolution: { width: number; height: number };
	title?: string;
}

/** Generate a complete ASS file from caption elements */
export function generateASS(
	clips: CaptionElement[],
	options: ASSGeneratorOptions
): string {
	const { resolution, title = "QCut Export" } = options;

	const styleMap = new Map<string, SubtitleStyle>();
	for (const clip of clips) {
		const resolved = resolveSubtitleStyle(clip.style);
		const key = JSON.stringify(resolved);
		if (!styleMap.has(key)) styleMap.set(key, resolved);
	}

	const styleNames = new Map<string, string>();
	let styleIndex = 0;
	for (const [key] of styleMap) {
		styleNames.set(key, styleIndex === 0 ? "Default" : `Style${styleIndex}`);
		styleIndex++;
	}

	let content = `[Script Info]
Title: ${title}
ScriptType: v4.00+
PlayResX: ${resolution.width}
PlayResY: ${resolution.height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`;

	for (const [key, style] of styleMap) {
		const name = styleNames.get(key) || "Default";
		content += `Style: ${styleToASSLine(name, style)}\n`;
	}

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

function styleToASSLine(name: string, style: SubtitleStyle): string {
	const primary = rgbToASSColor(style.fontColor, style.fontOpacity);
	const secondary = "&H00FFFFFF";
	const outline = rgbToASSColor(style.outlineColor, 1);
	const useOpaqueBox = style.bgOpacity > 0;
	const back = useOpaqueBox
		? rgbToASSColor(style.backgroundColor, style.bgOpacity)
		: rgbToASSColor(style.shadowColor, 1);
	const borderStyle = useOpaqueBox ? 3 : 1;
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
		0,
		100,
		100,
		0,
		0,
		borderStyle,
		style.outlineWidth,
		shadow,
		alignment,
		10,
		10,
		marginV,
		1,
	].join(",");
}

/** Convert seconds to ASS time format (H:MM:SS.cc) */
export function secondsToASSTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const cs = Math.floor((seconds % 1) * 100);
	return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

// ─── ASS Parsing ─────────────────────────────────────────────────────

export interface ASSStyle {
	Name: string;
	Fontname: string;
	Fontsize: number;
	PrimaryColour: string;
	SecondaryColour: string;
	OutlineColour: string;
	BackColour: string;
	Bold: number;
	Italic: number;
	Underline: number;
	StrikeOut: number;
	ScaleX: number;
	ScaleY: number;
	Spacing: number;
	Angle: number;
	BorderStyle: number;
	Outline: number;
	Shadow: number;
	Alignment: number;
	MarginL: number;
	MarginR: number;
	MarginV: number;
	Encoding: number;
}

export interface ASSEvent {
	Layer: number;
	Start: string;
	End: string;
	Style: string;
	Name: string;
	MarginL: number;
	MarginR: number;
	MarginV: number;
	Effect: string;
	Text: string;
}

export interface ASSDocument {
	scriptInfo: Record<string, string>;
	styles: ASSStyle[];
	events: ASSEvent[];
}

/** Parse an ASS/SSA subtitle file */
export function parseASS(content: string): ASSDocument {
	const lines = content.split(/\r?\n/);
	const doc: ASSDocument = { scriptInfo: {}, styles: [], events: [] };

	let currentSection = "";
	let styleFormat: string[] = [];
	let eventFormat: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith(";")) continue;

		if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
			currentSection = trimmed.slice(1, -1).toLowerCase();
			continue;
		}

		if (currentSection === "script info") {
			const colonIdx = trimmed.indexOf(":");
			if (colonIdx > 0) {
				doc.scriptInfo[trimmed.slice(0, colonIdx).trim()] = trimmed
					.slice(colonIdx + 1)
					.trim();
			}
			continue;
		}

		if (currentSection === "v4+ styles" || currentSection === "v4 styles") {
			if (trimmed.startsWith("Format:")) {
				styleFormat = trimmed
					.slice(7)
					.split(",")
					.map((s) => s.trim());
			} else if (trimmed.startsWith("Style:")) {
				const values = trimmed
					.slice(6)
					.split(",")
					.map((s) => s.trim());
				const style = parseASSStyleLine(styleFormat, values);
				if (style) doc.styles.push(style);
			}
			continue;
		}

		if (currentSection === "events") {
			if (trimmed.startsWith("Format:")) {
				eventFormat = trimmed
					.slice(7)
					.split(",")
					.map((s) => s.trim());
			} else if (trimmed.startsWith("Dialogue:")) {
				const event = parseASSEventLine(eventFormat, trimmed.slice(9));
				if (event) doc.events.push(event);
			}
		}
	}

	return doc;
}

function parseASSStyleLine(
	format: string[],
	values: string[]
): ASSStyle | null {
	if (format.length === 0 || values.length < format.length) return null;
	const raw: Record<string, string> = {};
	for (let i = 0; i < format.length; i++) raw[format[i]] = values[i];

	return {
		Name: raw.Name || "Default",
		Fontname: raw.Fontname || "Arial",
		Fontsize: parseInt(raw.Fontsize || "48", 10),
		PrimaryColour: raw.PrimaryColour || "&H00FFFFFF",
		SecondaryColour: raw.SecondaryColour || "&H00FFFFFF",
		OutlineColour: raw.OutlineColour || "&H00000000",
		BackColour: raw.BackColour || "&H00000000",
		Bold: parseInt(raw.Bold || "0", 10),
		Italic: parseInt(raw.Italic || "0", 10),
		Underline: parseInt(raw.Underline || "0", 10),
		StrikeOut: parseInt(raw.StrikeOut || "0", 10),
		ScaleX: parseInt(raw.ScaleX || "100", 10),
		ScaleY: parseInt(raw.ScaleY || "100", 10),
		Spacing: parseFloat(raw.Spacing || "0"),
		Angle: parseFloat(raw.Angle || "0"),
		BorderStyle: parseInt(raw.BorderStyle || "1", 10),
		Outline: parseFloat(raw.Outline || "2"),
		Shadow: parseFloat(raw.Shadow || "0"),
		Alignment: parseInt(raw.Alignment || "2", 10),
		MarginL: parseInt(raw.MarginL || "10", 10),
		MarginR: parseInt(raw.MarginR || "10", 10),
		MarginV: parseInt(raw.MarginV || "10", 10),
		Encoding: parseInt(raw.Encoding || "1", 10),
	};
}

function parseASSEventLine(
	format: string[],
	rawValue: string
): ASSEvent | null {
	if (format.length === 0) return null;
	const parts: string[] = [];
	let remaining = rawValue.trim();
	for (let i = 0; i < format.length - 1; i++) {
		const commaIdx = remaining.indexOf(",");
		if (commaIdx < 0) return null;
		parts.push(remaining.slice(0, commaIdx).trim());
		remaining = remaining.slice(commaIdx + 1);
	}
	parts.push(remaining.trim());

	const raw: Record<string, string> = {};
	for (let i = 0; i < format.length; i++) raw[format[i]] = parts[i] || "";

	return {
		Layer: parseInt(raw.Layer || "0", 10),
		Start: raw.Start || "0:00:00.00",
		End: raw.End || "0:00:00.00",
		Style: raw.Style || "Default",
		Name: raw.Name || "",
		MarginL: parseInt(raw.MarginL || "0", 10),
		MarginR: parseInt(raw.MarginR || "0", 10),
		MarginV: parseInt(raw.MarginV || "0", 10),
		Effect: raw.Effect || "",
		Text: (raw.Text || "")
			.replace(/\{[^}]*\}/g, "")
			.replace(/\\N/g, "\n")
			.trim(),
	};
}

/** Parse ASS time format (H:MM:SS.cc) to seconds */
export function assTimeToSeconds(time: string): number {
	const match = time.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
	if (!match) return 0;
	const [, h, m, s, cs] = match;
	return (
		parseInt(h, 10) * 3600 +
		parseInt(m, 10) * 60 +
		parseInt(s, 10) +
		parseInt(cs, 10) / 100
	);
}

/** Convert an ASS style to SubtitleStyle */
export function assStyleToSubtitleStyle(assStyle: ASSStyle): SubtitleStyle {
	const primary = assColorToRgb(assStyle.PrimaryColour);
	const outline = assColorToRgb(assStyle.OutlineColour);
	const back = assColorToRgb(assStyle.BackColour);
	const useOpaqueBox = assStyle.BorderStyle === 3;

	return {
		fontFamily: assStyle.Fontname,
		fontSize: assStyle.Fontsize,
		fontColor: primary.hex,
		fontOpacity: primary.opacity,
		bold: assStyle.Bold !== 0,
		italic: assStyle.Italic !== 0,
		underline: assStyle.Underline !== 0,
		outlineColor: outline.hex,
		outlineWidth: assStyle.Outline,
		shadowColor: useOpaqueBox ? "#000000" : back.hex,
		shadowOffset: {
			x: assStyle.Shadow > 0 ? 1 : 0,
			y: assStyle.Shadow > 0 ? 1 : 0,
		},
		backgroundColor: useOpaqueBox ? back.hex : "#000000",
		bgOpacity: useOpaqueBox ? back.opacity : 0,
		position: {
			align: assAlignmentToAlign(assStyle.Alignment),
			x: 50,
			y: assStyle.MarginV,
		},
		lineSpacing: 1.4,
	};
}
