/**
 * SRT/VTT subtitle parser and time-based chunker.
 *
 * Reads subtitle files into structured entries and splits them
 * into time-based chunks suitable for LLM processing.
 *
 * @module electron/native-pipeline/autoclip/srt-parser
 */

import * as fs from "fs";

export interface SrtEntry {
	index: number;
	startTime: string; // "HH:MM:SS,mmm"
	endTime: string;
	text: string;
	startSeconds: number;
	endSeconds: number;
}

export interface SrtChunk {
	chunkIndex: number;
	entries: SrtEntry[];
	text: string; // concatenated subtitle text
	startTime: string;
	endTime: string;
}

/** Parse "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to seconds. */
export function timeToSeconds(timeStr: string): number {
	const normalized = timeStr.replace(",", ".");
	const parts = normalized.split(":");
	if (parts.length !== 3) throw new Error(`Invalid time format: ${timeStr}`);
	const h = parseInt(parts[0], 10);
	const m = parseInt(parts[1], 10);
	const sParts = parts[2].split(".");
	const s = parseInt(sParts[0], 10);
	const ms = sParts.length > 1 ? parseInt(sParts[1], 10) : 0;
	return h * 3600 + m * 60 + s + ms / 1000;
}

/** Convert seconds to SRT timecode "HH:MM:SS,mmm". */
export function secondsToSrtTime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Convert SRT time to FFmpeg-compatible format (comma → dot). */
export function srtTimeToFfmpeg(srtTime: string): string {
	return srtTime.replace(",", ".");
}

/**
 * Parse an SRT file into structured entries.
 *
 * SRT format:
 * ```
 * 1
 * 00:00:01,000 --> 00:00:04,000
 * Hello world
 *
 * 2
 * 00:00:05,000 --> 00:00:08,000
 * Second line
 * ```
 */
export function parseSrt(filePath: string): SrtEntry[] {
	const content = fs.readFileSync(filePath, "utf-8");
	return parseSrtContent(content);
}

/** Parse SRT content string (separated from file I/O for testability). */
export function parseSrtContent(content: string): SrtEntry[] {
	// Strip BOM
	const clean = content.replace(/^\uFEFF/, "").trim();
	if (!clean) return [];

	const entries: SrtEntry[] = [];
	// Split on blank lines (handles \r\n and \n)
	const blocks = clean.split(/\r?\n\r?\n/);

	for (const block of blocks) {
		const lines = block.trim().split(/\r?\n/);
		if (lines.length < 3) continue;

		const indexLine = lines[0].trim();
		const index = parseInt(indexLine, 10);
		if (isNaN(index)) continue;

		const timeLine = lines[1].trim();
		const timeMatch = timeLine.match(
			/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
		);
		if (!timeMatch) continue;

		// Normalize to comma format for SRT standard
		const startTime = timeMatch[1].replace(".", ",");
		const endTime = timeMatch[2].replace(".", ",");
		const text = lines
			.slice(2)
			.join(" ")
			.replace(/<[^>]+>/g, "") // Strip HTML tags
			.trim();

		if (!text) continue;

		entries.push({
			index,
			startTime,
			endTime,
			text,
			startSeconds: timeToSeconds(startTime),
			endSeconds: timeToSeconds(endTime),
		});
	}

	return entries;
}

/**
 * Parse a VTT (WebVTT) file into SRT entries.
 *
 * VTT format differs from SRT:
 * - Has "WEBVTT" header
 * - Uses "." for milliseconds instead of ","
 * - May have CSS styling and cue identifiers
 */
export function parseVtt(filePath: string): SrtEntry[] {
	const content = fs.readFileSync(filePath, "utf-8");
	return parseVttContent(content);
}

/** Parse VTT content string. */
export function parseVttContent(content: string): SrtEntry[] {
	const clean = content.replace(/^\uFEFF/, "").trim();
	if (!clean) return [];

	// Remove WEBVTT header and any metadata blocks
	const headerEnd = clean.indexOf("\n\n");
	if (headerEnd === -1) return [];
	const body = clean.substring(headerEnd + 2).trim();

	const entries: SrtEntry[] = [];
	const blocks = body.split(/\r?\n\r?\n/);
	let autoIndex = 1;

	for (const block of blocks) {
		const lines = block.trim().split(/\r?\n/);
		if (lines.length < 2) continue;

		// Find the timestamp line (may or may not have a cue identifier before it)
		let timeLineIdx = 0;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes("-->")) {
				timeLineIdx = i;
				break;
			}
		}

		const timeLine = lines[timeLineIdx];
		const timeMatch = timeLine.match(
			/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
		);
		if (!timeMatch) continue;

		const startTime = timeMatch[1].replace(".", ",");
		const endTime = timeMatch[2].replace(".", ",");
		const text = lines
			.slice(timeLineIdx + 1)
			.join(" ")
			.replace(/<[^>]+>/g, "")
			.trim();

		if (!text) continue;

		entries.push({
			index: autoIndex++,
			startTime,
			endTime,
			text,
			startSeconds: timeToSeconds(startTime),
			endSeconds: timeToSeconds(endTime),
		});
	}

	return entries;
}

/**
 * Chunk SRT entries by time interval with pause-aware splitting.
 *
 * Searches for natural pauses (>= 1s gap) near the target split
 * boundary (90%–110% of interval), falling back to the nearest
 * entry if no suitable pause is found.
 *
 * Ported from AutoClip's TextProcessor.chunk_srt_data().
 */
export function chunkByInterval(
	entries: SrtEntry[],
	intervalMinutes = 30,
	pauseThresholdMs = 1000
): SrtChunk[] {
	if (entries.length === 0) return [];

	const intervalSeconds = intervalMinutes * 60;
	const chunks: SrtChunk[] = [];
	let currentStart = 0;
	let chunkIndex = 0;
	let lastCutTime = 0;

	while (currentStart < entries.length) {
		const targetCutTime = lastCutTime + intervalSeconds;

		// Find search start: first entry at >= 90% of target
		let searchStart = currentStart;
		while (
			searchStart < entries.length &&
			entries[searchStart].startSeconds < targetCutTime * 0.9
		) {
			searchStart++;
		}

		// Search for a pause >= threshold within 90%-110% of target
		let bestCutIndex = -1;
		for (let i = searchStart; i < entries.length - 1; i++) {
			if (entries[i].startSeconds > targetCutTime * 1.1) break;
			const pause = entries[i + 1].startSeconds - entries[i].endSeconds;
			if (pause * 1000 >= pauseThresholdMs) {
				bestCutIndex = i + 1; // Cut after the pause
				break;
			}
		}

		// Fallback: nearest entry to target time
		if (bestCutIndex === -1) {
			let i = currentStart;
			while (i < entries.length && entries[i].startSeconds < targetCutTime) {
				i++;
			}
			bestCutIndex = i < entries.length ? i : entries.length;
		}

		if (bestCutIndex <= currentStart) {
			bestCutIndex = entries.length;
		}

		const chunkEntries = entries.slice(currentStart, bestCutIndex);
		if (chunkEntries.length === 0) break;

		chunks.push({
			chunkIndex,
			entries: chunkEntries,
			text: chunkEntries.map((e) => e.text).join(" "),
			startTime: chunkEntries[0].startTime,
			endTime: chunkEntries[chunkEntries.length - 1].endTime,
		});

		chunkIndex++;
		lastCutTime = chunkEntries[chunkEntries.length - 1].endSeconds;
		currentStart = bestCutIndex;
	}

	return chunks;
}

/** Auto-detect format and parse a subtitle file. */
export function parseSubtitleFile(filePath: string): SrtEntry[] {
	const ext = filePath.toLowerCase().split(".").pop();
	if (ext === "vtt") return parseVtt(filePath);
	return parseSrt(filePath);
}
