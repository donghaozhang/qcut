/**
 * Step 3: Clip Scoring
 *
 * Sends timeline segments to LLM for quality evaluation.
 * Returns scored and filtered segments.
 *
 * Ported from AutoClip step3_scoring.py
 *
 * @module electron/native-pipeline/autoclip/steps/step-scoring
 */

import { callModelApi } from "../../infra/api-caller.js";
import { extractChatContent, parseJsonResponse } from "../llm-utils.js";
import { SCORING_PROMPT } from "../prompts.js";
import type { TimelineSegment } from "./step-timeline.js";
import type { ProgressFn } from "../../cli/cli-runner/types.js";

export interface ScoredSegment extends TimelineSegment {
	finalScore: number; // 0.0–1.0
	recommendReason: string;
}

interface ScoringOptions {
	model?: string;
	minScore?: number;
	onProgress?: ProgressFn;
	signal?: AbortSignal;
}

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const DEFAULT_MIN_SCORE = 0.7;

/**
 * Score timeline segments via LLM evaluation.
 *
 * Groups segments by chunkIndex for batch processing,
 * then filters by minimum score threshold.
 */
export async function scoreSegments(
	segments: TimelineSegment[],
	options: ScoringOptions = {}
): Promise<{ all: ScoredSegment[]; highScore: ScoredSegment[] }> {
	const {
		model = DEFAULT_MODEL,
		minScore = DEFAULT_MIN_SCORE,
		onProgress,
		signal,
	} = options;

	if (segments.length === 0) return { all: [], highScore: [] };

	// Group by chunkIndex for batch processing
	const byChunk = new Map<number, TimelineSegment[]>();
	for (const seg of segments) {
		const list = byChunk.get(seg.chunkIndex) ?? [];
		list.push(seg);
		byChunk.set(seg.chunkIndex, list);
	}

	const allScored: ScoredSegment[] = [];
	const chunkKeys = [...byChunk.keys()].sort((a, b) => a - b);

	for (let ci = 0; ci < chunkKeys.length; ci++) {
		const chunkIndex = chunkKeys[ci];
		const chunkSegments = byChunk.get(chunkIndex)!;

		onProgress?.({
			stage: "scoring",
			percent: Math.round(((ci + 1) / chunkKeys.length) * 100),
			message: `Scoring chunk ${chunkIndex} (${chunkSegments.length} segments)`,
			model,
		});

		// Prepare clean input for LLM (only what it needs)
		const llmInput = chunkSegments.map((seg) => ({
			outline: seg.outline,
			content: seg.content,
			start_time: seg.startTime,
			end_time: seg.endTime,
		}));

		const result = await callModelApi({
			endpoint: "chat/completions",
			provider: "openrouter",
			payload: {
				model,
				messages: [
					{ role: "system", content: SCORING_PROMPT },
					{ role: "user", content: JSON.stringify(llmInput) },
				],
				temperature: 0.3,
			},
			retries: 2,
			signal,
		});

		if (!result.success || !result.data) {
			console.warn(
				`[autoclip] Scoring failed for chunk ${chunkIndex}: ${result.error}`
			);
			// Mark all as failed with score 0
			for (const seg of chunkSegments) {
				allScored.push({
					...seg,
					finalScore: 0,
					recommendReason: "Scoring failed",
				});
			}
			continue;
		}

		try {
			const content = extractChatContent(result.data);
			const parsed = parseJsonResponse(content);

			if (!Array.isArray(parsed) || parsed.length !== chunkSegments.length) {
				console.warn(
					`[autoclip] Score count mismatch for chunk ${chunkIndex}: expected ${chunkSegments.length}, got ${Array.isArray(parsed) ? parsed.length : "non-array"}`
				);
				// Fallback: mark all with score 0
				for (const seg of chunkSegments) {
					allScored.push({
						...seg,
						finalScore: 0,
						recommendReason: "Score count mismatch",
					});
				}
				continue;
			}

			const results = parsed as Record<string, unknown>[];
			for (let i = 0; i < chunkSegments.length; i++) {
				const seg = chunkSegments[i];
				const llmResult = results[i];
				const score = Number(llmResult.final_score ?? 0);
				const reason = String(
					llmResult.recommend_reason ?? "No reason provided"
				);
				allScored.push({
					...seg,
					finalScore: Math.round(score * 100) / 100,
					recommendReason: reason,
				});
			}
		} catch (err) {
			console.warn(
				`[autoclip] Failed to parse scores for chunk ${chunkIndex}: ${err instanceof Error ? err.message : String(err)}`
			);
			for (const seg of chunkSegments) {
				allScored.push({
					...seg,
					finalScore: 0,
					recommendReason: "Parse error",
				});
			}
		}
	}

	// Sort by ID (time order)
	allScored.sort((a, b) => parseInt(a.id) - parseInt(b.id));

	const highScore = allScored.filter((s) => s.finalScore >= minScore);

	return { all: allScored, highScore };
}
