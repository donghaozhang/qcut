import * as fs from "node:fs/promises";
import * as path from "node:path";

export type EditorCaptionFormat = "srt" | "vtt" | "ass" | "ttml";

interface CaptionCue {
	start: number;
	end: number;
	text: string;
}

interface TimelineLike {
	tracks?: Array<{
		type?: string;
		elements?: Array<{
			type?: string;
			startTime?: number;
			endTime?: number;
			duration?: number;
			content?: string;
			text?: string;
		}>;
	}>;
}

function collectCues(timeline: TimelineLike): CaptionCue[] {
	const cues: CaptionCue[] = [];
	for (const track of timeline.tracks ?? []) {
		if (track.type !== "captions") continue;
		for (const element of track.elements ?? []) {
			if (element.type !== "captions") continue;
			const start = element.startTime ?? 0;
			const end = element.endTime ?? start + (element.duration ?? 0);
			const text = (element.content ?? element.text ?? "").trim();
			if (text && end > start) cues.push({ start, end, text });
		}
	}
	return cues.sort((a, b) => a.start - b.start);
}

function clock(seconds: number, separator: "," | ".", fraction = 3): string {
	const safe = Math.max(0, seconds);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const wholeSeconds = Math.floor(safe % 60);
	const scale = 10 ** fraction;
	const part = Math.floor((safe % 1) * scale);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${separator}${String(part).padStart(fraction, "0")}`;
}

function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatCaptions(
	cues: CaptionCue[],
	format: EditorCaptionFormat
): string {
	if (format === "srt") {
		return cues
			.map(
				(cue, index) =>
					`${index + 1}\n${clock(cue.start, ",")} --> ${clock(cue.end, ",")}\n${cue.text}`
			)
			.join("\n\n");
	}
	if (format === "vtt") {
		return `WEBVTT\n\n${cues
			.map(
				(cue, index) =>
					`${index + 1}\n${clock(cue.start, ".")} --> ${clock(cue.end, ".")}\n${cue.text}`
			)
			.join("\n\n")}`;
	}
	if (format === "ttml") {
		return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml"><body><div>\n${cues
			.map(
				(cue) =>
					`  <p begin="${clock(cue.start, ".")}" end="${clock(cue.end, ".")}">${escapeXml(cue.text)}</p>`
			)
			.join("\n")}\n</div></body></tt>`;
	}

	const events = cues
		.map(
			(cue) =>
				`Dialogue: 0,${clock(cue.start, ".", 2).replace(/^0/, "")},${clock(cue.end, ".", 2).replace(/^0/, "")},Default,,0,0,0,,${cue.text.replace(/\n/g, "\\N")}`
		)
		.join("\n");
	return `[Script Info]\nTitle: QCut Captions\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}`;
}

export async function writeTimelineCaptions({
	timeline,
	format,
	outputPath,
}: {
	timeline: TimelineLike;
	format: EditorCaptionFormat;
	outputPath: string;
}): Promise<{ outputPath: string; captionCount: number }> {
	const cues = collectCues(timeline);
	if (cues.length === 0) {
		throw new Error("No caption elements are available on the timeline");
	}
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, formatCaptions(cues, format), "utf8");
	return { outputPath, captionCount: cues.length };
}
