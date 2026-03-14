/**
 * ASS (Advanced SubStation Alpha) subtitle file parser.
 *
 * Parses ASS/SSA files into structured data.
 * No browser/React dependencies.
 *
 * @module @qcut/editor-core/captions/ass-parser
 */

import type { SubtitleStyle } from "../types/timeline.js";
import { assColorToRgb, assAlignmentToAlign } from "./subtitle-style.js";

/** Parsed ASS style definition */
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

/** Parsed ASS dialogue event */
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

/** Full parsed ASS document */
export interface ASSDocument {
	scriptInfo: Record<string, string>;
	styles: ASSStyle[];
	events: ASSEvent[];
}

/** Parse an ASS/SSA subtitle file */
export function parseASS(content: string): ASSDocument {
	const lines = content.split(/\r?\n/);
	const doc: ASSDocument = {
		scriptInfo: {},
		styles: [],
		events: [],
	};

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
				const key = trimmed.slice(0, colonIdx).trim();
				const value = trimmed.slice(colonIdx + 1).trim();
				doc.scriptInfo[key] = value;
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
				const style = parseStyleLine(styleFormat, values);
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
				const event = parseEventLine(eventFormat, trimmed.slice(9));
				if (event) doc.events.push(event);
			}
		}
	}

	return doc;
}

function parseStyleLine(format: string[], values: string[]): ASSStyle | null {
	if (format.length === 0 || values.length < format.length) return null;

	const raw: Record<string, string> = {};
	for (let i = 0; i < format.length; i++) {
		raw[format[i]] = values[i];
	}

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

function parseEventLine(format: string[], rawValue: string): ASSEvent | null {
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
	for (let i = 0; i < format.length; i++) {
		raw[format[i]] = parts[i] || "";
	}

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
		Text: stripASSFormatting(raw.Text || ""),
	};
}

/** Strip ASS override tags like {\b1}, {\an8}, etc. */
function stripASSFormatting(text: string): string {
	return text
		.replace(/\{[^}]*\}/g, "")
		.replace(/\\N/g, "\n")
		.trim();
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
