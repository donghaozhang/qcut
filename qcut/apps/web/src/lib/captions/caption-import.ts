import type {
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/captions";
import type { CreateCaptionElement } from "@/types/timeline";

/** `00:00:01,000` (SRT) or `00:01.000` / `00:00:01.000` (VTT) to seconds. */
function parseTimestamp({ value }: { value: string }): number | null {
	const match = value
		.trim()
		.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/u);
	if (!match) return null;
	const [, hours = "0", minutes, seconds, millis] = match;
	return (
		Number(hours) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(millis.padEnd(3, "0")) / 1000
	);
}

function parseCueTimes({
	line,
}: {
	line: string;
}): { start: number; end: number } | null {
	const [rawStart, rawRest] = line.split("-->");
	if (!rawRest) return null;
	// VTT cue settings (position, align, ...) follow the end time.
	const rawEnd = rawRest.trim().split(/\s+/u)[0] ?? "";
	const start = parseTimestamp({ value: rawStart });
	const end = parseTimestamp({ value: rawEnd });
	if (start === null || end === null || end <= start) return null;
	return { start, end };
}

function stripCueMarkup({ text }: { text: string }): string {
	return text
		.replace(/<\/?[bius]>|<\/?ruby>|<\/?rt>|<\/?c(?:\.[\w-]+)*>/giu, "")
		.replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/gu, "")
		.trim();
}

/**
 * Parse SRT or WebVTT subtitle text into transcription segments. Handles both
 * formats with one pass: numeric index lines, WEBVTT headers, NOTE/STYLE
 * blocks, and cue settings are all tolerated.
 */
export function parseSubtitleFile({
	content,
}: {
	content: string;
}): TranscriptionSegment[] {
	const lines = content.replace(/^﻿/u, "").split(/\r?\n/u);
	const segments: TranscriptionSegment[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index].trim();
		if (
			!line ||
			line === "WEBVTT" ||
			line.startsWith("NOTE") ||
			line.startsWith("STYLE") ||
			line.startsWith("REGION")
		) {
			index += 1;
			continue;
		}
		const direct = parseCueTimes({ line });
		const times = direct ?? parseCueTimes({ line: lines[index + 1] ?? "" });
		if (!times) {
			index += 1;
			continue;
		}
		// Skip past the (optional) cue identifier and the time line itself.
		index += direct ? 1 : 2;
		const textLines: string[] = [];
		while (index < lines.length && lines[index].trim() !== "") {
			textLines.push(lines[index]);
			index += 1;
		}
		const text = stripCueMarkup({ text: textLines.join("\n") });
		if (!text) continue;
		segments.push({
			id: segments.length,
			seek: 0,
			start: times.start,
			end: times.end,
			text,
			tokens: [],
			temperature: 0,
			avg_logprob: 0,
			compression_ratio: 1,
			no_speech_prob: 0,
		});
	}
	return segments;
}

export function importedCaptionResult({
	segments,
	language = "unknown",
}: {
	segments: TranscriptionSegment[];
	language?: string;
}): TranscriptionResult {
	return {
		text: segments.map((segment) => segment.text).join(" "),
		segments,
		language,
	};
}

/** Convert imported subtitle segments into timeline caption elements. */
export function importedCaptionElements({
	segments,
	language = "unknown",
}: {
	segments: TranscriptionSegment[];
	language?: string;
}): CreateCaptionElement[] {
	return segments.map((segment, position) => ({
		type: "captions",
		name: `Caption ${position + 1}`,
		startTime: segment.start,
		duration: Math.max(0.1, segment.end - segment.start),
		trimStart: 0,
		trimEnd: 0,
		text: segment.text,
		language,
		source: "imported",
	}));
}
