/**
 * Step 2: Timeline Extraction
 *
 * For each outline topic, locates precise start/end timestamps
 * within the corresponding SRT chunk using LLM analysis.
 *
 * Ported from AutoClip step2_timeline.py
 *
 * @module electron/native-pipeline/autoclip/steps/step-timeline
 */

import { callModelApi } from "../../infra/api-caller.js";
import { extractChatContent, parseJsonResponse } from "../llm-utils.js";
import { TIMELINE_PROMPT } from "../prompts.js";
import { timeToSeconds } from "../srt-parser.js";
import type { SrtChunk } from "../srt-parser.js";
import type { OutlineTopic } from "./step-outline.js";
import type { ProgressFn } from "../../cli/cli-runner/types.js";

export interface TimelineSegment {
	id: string;
	outline: string;
	content: string[];
	startTime: string; // "HH:MM:SS,mmm"
	endTime: string;
	chunkIndex: number;
}

interface TimelineOptions {
	model?: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
}

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const TIME_FORMAT_RE = /^\d{2}:\d{2}:\d{2},\d{3}$/;

/** Validate SRT time format. */
function isValidTimeFormat(time: string): boolean {
	return TIME_FORMAT_RE.test(time);
}

/** Clamp a timestamp to be within [min, max] bounds. */
function clampTime(
	time: string,
	minTime: string,
	maxTime: string
): string {
	const sec = timeToSeconds(time);
	const minSec = timeToSeconds(minTime);
	const maxSec = timeToSeconds(maxTime);
	if (sec < minSec) return minTime;
	if (sec > maxSec) return maxTime;
	return time;
}

/** Build SRT-formatted text from chunk entries for LLM input. */
function buildSrtText(chunk: SrtChunk): string {
	return chunk.entries
		.map((e) => `${e.index}\n${e.startTime} --> ${e.endTime}\n${e.text}\n`)
		.join("\n");
}

/**
 * Extract timeline segments from outlines + SRT chunks via LLM.
 *
 * Groups outlines by chunkIndex, sends each group with its SRT text
 * to the LLM, validates timestamps, and returns sorted segments.
 */
export async function extractTimeline(
	outlines: OutlineTopic[],
	chunks: SrtChunk[],
	options: TimelineOptions = {}
): Promise<TimelineSegment[]> {
	const { model = DEFAULT_MODEL, onProgress, signal } = options;

	// Index chunks by chunkIndex for lookup
	const chunkMap = new Map<number, SrtChunk>();
	for (const chunk of chunks) chunkMap.set(chunk.chunkIndex, chunk);

	// Group outlines by chunkIndex
	const outlinesByChunk = new Map<number, OutlineTopic[]>();
	for (const outline of outlines) {
		const list = outlinesByChunk.get(outline.chunkIndex) ?? [];
		list.push(outline);
		outlinesByChunk.set(outline.chunkIndex, list);
	}

	const allSegments: TimelineSegment[] = [];
	const chunkKeys = [...outlinesByChunk.keys()].sort((a, b) => a - b);

	for (let ci = 0; ci < chunkKeys.length; ci++) {
		const chunkIndex = chunkKeys[ci];
		const chunkOutlines = outlinesByChunk.get(chunkIndex)!;
		const chunk = chunkMap.get(chunkIndex);

		if (!chunk || chunk.entries.length === 0) {
			console.warn(`[autoclip] No SRT data for chunk ${chunkIndex}, skipping`);
			continue;
		}

		onProgress?.({
			stage: "timeline",
			percent: Math.round(((ci + 1) / chunkKeys.length) * 100),
			message: `Extracting timeline for chunk ${chunkIndex} (${chunkOutlines.length} topics)`,
			model,
		});

		const llmInput = {
			outline: chunkOutlines.map((o) => ({
				title: o.title,
				subtopics: o.subtopics,
			})),
			srt_text: buildSrtText(chunk),
		};

		const result = await callModelApi({
			endpoint: "chat/completions",
			provider: "openrouter",
			payload: {
				model,
				messages: [
					{ role: "system", content: TIMELINE_PROMPT },
					{ role: "user", content: JSON.stringify(llmInput) },
				],
				temperature: 0.3,
			},
			retries: 2,
			signal,
		});

		if (!result.success || !result.data) {
			console.warn(
				`[autoclip] Timeline extraction failed for chunk ${chunkIndex}: ${result.error}`
			);
			continue;
		}

		try {
			const content = extractChatContent(result.data);
			const parsed = parseJsonResponse(content);

			if (!Array.isArray(parsed)) {
				console.warn(
					`[autoclip] Timeline response for chunk ${chunkIndex} is not an array`
				);
				continue;
			}

			for (const item of parsed as Record<string, unknown>[]) {
				const startTime = String(item.start_time ?? "");
				const endTime = String(item.end_time ?? "");

				if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
					console.warn(
						`[autoclip] Invalid time format in timeline: ${startTime} -> ${endTime}`
					);
					continue;
				}

				const clampedStart = clampTime(
					startTime,
					chunk.startTime,
					chunk.endTime
				);
				const clampedEnd = clampTime(endTime, chunk.startTime, chunk.endTime);

				const outline = typeof item.outline === "string"
					? item.outline
					: JSON.stringify(item.outline);
				const content = Array.isArray(item.content)
					? (item.content as string[])
					: [String(item.content ?? "")];

				allSegments.push({
					id: "", // Assigned after sorting
					outline,
					content,
					startTime: clampedStart,
					endTime: clampedEnd,
					chunkIndex,
				});
			}
		} catch (err) {
			console.warn(
				`[autoclip] Failed to parse timeline for chunk ${chunkIndex}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	// Sort by start time and assign sequential IDs
	allSegments.sort(
		(a, b) => timeToSeconds(a.startTime) - timeToSeconds(b.startTime)
	);
	for (let i = 0; i < allSegments.length; i++) {
		allSegments[i].id = String(i + 1);
	}

	return allSegments;
}
