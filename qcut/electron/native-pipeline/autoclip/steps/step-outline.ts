/**
 * Step 1: Outline Extraction
 *
 * Sends subtitle text chunks to LLM and extracts topic outlines
 * with subtopics. Deduplicates across chunks.
 *
 * Ported from AutoClip step1_outline.py
 *
 * @module electron/native-pipeline/autoclip/steps/step-outline
 */

import { callModelApi } from "../../infra/api-caller.js";
import { extractChatContent } from "../llm-utils.js";
import { OUTLINE_PROMPT } from "../prompts.js";
import type { SrtChunk } from "../srt-parser.js";
import type { ProgressFn } from "../../cli/cli-runner/types.js";

export interface OutlineTopic {
	title: string;
	subtopics: string[];
	chunkIndex: number;
}

interface OutlineOptions {
	model?: string;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
}

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

/**
 * Parse the LLM outline response into structured topics.
 *
 * Expects numbered markdown format:
 * ```
 * 1. **Topic Name** (estimated X minutes)
 *    - Sub-topic 1
 *    - Sub-topic 2
 * ```
 */
function parseOutlineResponse(
	response: string,
	chunkIndex: number
): OutlineTopic[] {
	const outlines: OutlineTopic[] = [];
	const lines = response.split("\n");
	let current: OutlineTopic | null = null;

	for (const line of lines) {
		const trimmed = line.trim();

		// Match numbered topic headers: "1. **Topic**" or "1.  **Topic**"
		if (/^\d+\.\s*\*\*/.test(trimmed)) {
			if (current) outlines.push(current);
			const boldMatch = trimmed.match(/\*\*(.+?)\*\*/);
			const title = boldMatch
				? boldMatch[1]
				: trimmed.replace(/^\d+\.\s*/, "").trim();
			current = { title, subtopics: [], chunkIndex };
		}
		// Match subtopic lines starting with "-"
		else if (trimmed.startsWith("-") && current) {
			const subtopic = trimmed.substring(1).trim();
			if (subtopic && subtopic.length <= 200) {
				current.subtopics.push(subtopic);
			}
		}
	}

	if (current) outlines.push(current);
	return outlines;
}

/** Deduplicate outlines by title, keeping first occurrence. */
function mergeOutlines(outlines: OutlineTopic[]): OutlineTopic[] {
	const seen = new Map<string, OutlineTopic>();
	for (const outline of outlines) {
		if (!seen.has(outline.title)) {
			seen.set(outline.title, outline);
		}
	}
	return [...seen.values()];
}

/**
 * Extract topic outlines from subtitle chunks via LLM.
 *
 * Processes each chunk independently, then merges/deduplicates results.
 */
export async function extractOutline(
	chunks: SrtChunk[],
	options: OutlineOptions = {}
): Promise<OutlineTopic[]> {
	const { model = DEFAULT_MODEL, onProgress, signal } = options;
	const allOutlines: OutlineTopic[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		onProgress?.({
			stage: "outline",
			percent: Math.round(((i + 1) / chunks.length) * 100),
			message: `Extracting outline from chunk ${i + 1}/${chunks.length}`,
			model,
		});

		const inputData = { text: chunk.text };
		const result = await callModelApi({
			endpoint: "chat/completions",
			provider: "openrouter",
			payload: {
				model,
				messages: [
					{ role: "system", content: OUTLINE_PROMPT },
					{ role: "user", content: JSON.stringify(inputData) },
				],
				temperature: 0.3,
			},
			retries: 2,
			signal,
		});

		if (!result.success || !result.data) {
			console.warn(
				`[autoclip] Outline extraction failed for chunk ${i}: ${result.error}`
			);
			continue;
		}

		const content = extractChatContent(result.data);
		const parsed = parseOutlineResponse(content, chunk.chunkIndex);
		allOutlines.push(...parsed);
	}

	return mergeOutlines(allOutlines);
}
