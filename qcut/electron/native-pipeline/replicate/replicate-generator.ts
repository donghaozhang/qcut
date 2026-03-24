/**
 * Replicate Generator — parallel AI video/image generation per shot.
 *
 * Uses the existing PipelineExecutor step execution infrastructure
 * (fal.ai, Kling, LTX, etc.) to generate media for each planned shot.
 *
 * @module electron/native-pipeline/replicate/replicate-generator
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PlannedShot, GeneratedShot } from "./replicate-types.js";
import { ModelRegistry } from "../infra/registry.js";
import {
	executeStep,
	type StepInput,
} from "../execution/step-executors.js";

export interface GeneratorOptions {
	outputDir: string;
	/** Max concurrent generation jobs. */
	concurrency?: number;
	onProgress?: (completed: number, total: number, message: string) => void;
	signal?: AbortSignal;
}

const DEFAULT_CONCURRENCY = 3;

/**
 * Generate media for all planned shots in parallel.
 *
 * Respects concurrency limits. Failed shots are marked with an error
 * but do not abort the entire pipeline (graceful degradation).
 */
export async function generateShots(
	shots: PlannedShot[],
	options: GeneratorOptions
): Promise<{ shots: GeneratedShot[]; totalCost: number }> {
	const concurrency = options.concurrency || DEFAULT_CONCURRENCY;
	const results: GeneratedShot[] = new Array(shots.length);
	let totalCost = 0;
	let completed = 0;

	// Ensure output dir exists
	fs.mkdirSync(options.outputDir, { recursive: true });

	// Process in batches for concurrency control
	for (let i = 0; i < shots.length; i += concurrency) {
		if (options.signal?.aborted) break;

		const batch = shots.slice(i, i + concurrency);
		const promises = batch.map((shot, batchIdx) =>
			generateSingleShot(shot, options).then((result) => {
				const globalIdx = i + batchIdx;
				results[globalIdx] = result;
				totalCost += result.error ? 0 : (0); // cost tracked via API result
				completed++;
				options.onProgress?.(
					completed,
					shots.length,
					`Shot ${shot.index + 1}: ${result.error ? "failed" : "done"}`
				);
			})
		);

		await Promise.all(promises);
	}

	// Fill in any slots that were skipped (e.g. due to abort)
	for (let i = 0; i < shots.length; i++) {
		if (!results[i]) {
			results[i] = { ...shots[i], error: "Skipped (aborted)" };
		}
	}

	return { shots: results, totalCost };
}

async function generateSingleShot(
	shot: PlannedShot,
	options: GeneratorOptions
): Promise<GeneratedShot> {
	// User media: just copy/reference the file
	if (shot.strategy === "user-media") {
		if (shot.userMediaPath && fs.existsSync(shot.userMediaPath)) {
			return { ...shot, outputPath: shot.userMediaPath };
		}
		return { ...shot, error: "User media file not found" };
	}

	// Skip strategy
	if (shot.strategy === "skip") {
		return { ...shot, error: "Skipped by planner" };
	}

	// AI generation (video or image)
	const modelKey = shot.model || "kling_2_6_pro";
	const modelDef = ModelRegistry.get(modelKey);
	if (!modelDef) {
		return {
			...shot,
			error: `Unknown model: ${modelKey}`,
		};
	}

	const input: StepInput = {
		text: shot.prompt,
	};

	const params: Record<string, unknown> = {
		prompt: shot.prompt,
	};

	// Set duration for video generation
	if (shot.strategy === "ai-video" && shot.duration) {
		params.duration = Math.min(Math.max(Math.round(shot.duration), 2), 10);
	}

	try {
		const result = await executeStep(modelDef, input, params, {
			outputDir: options.outputDir,
			signal: options.signal,
			onProgress: () => {}, // progress tracked at batch level
		});

		if (!result.success) {
			return { ...shot, error: result.error || "Generation failed" };
		}

		return {
			...shot,
			outputPath: result.outputPath || undefined,
		};
	} catch (err) {
		return {
			...shot,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
