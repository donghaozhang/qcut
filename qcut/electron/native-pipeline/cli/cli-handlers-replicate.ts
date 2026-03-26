/**
 * CLI Handlers for Video Replicate commands.
 *
 * Handles: replicate, replicate:analyze, replicate:generate
 *
 * @module electron/native-pipeline/cli/cli-handlers-replicate
 */

import * as path from "node:path";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { resolveOutputDir } from "../output/output-utils.js";
import {
	runReplicate,
	runAnalyzeOnly,
	runFromRecipe,
} from "../replicate/replicate-runner.js";

/**
 * Full replicate pipeline: analyze → plan → storyboard → generate → assemble.
 */
export async function handleReplicate(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const source = options.source || options.input;
	if (!source) {
		return {
			success: false,
			error: "Missing --source or --input (path to source video)",
		};
	}

	const outputDir = resolveOutputDir(options.outputDir, `cli-${Date.now()}`);
	const startTime = Date.now();

	const result = await runReplicate({
		source,
		outputDir,
		outputFilename: options.output ? path.basename(options.output) : undefined,
		videoModel: options.videoModel || options.model,
		imageModel: options.imageModel,
		analysisModel: options.llmModel,
		signal,
		onProgress: (stage, percent, message) => {
			onProgress({ stage, percent, message });
		},
	});

	const duration = (Date.now() - startTime) / 1000;

	if (!result.success) {
		return { success: false, error: result.error, duration };
	}

	if (options.json) {
		return {
			success: true,
			outputPath: result.outputPath,
			duration,
			cost: result.totalCost,
			data: {
				recipe: result.recipe,
				shotCount: result.shotCount,
			},
		};
	}

	return {
		success: true,
		outputPath: result.outputPath,
		duration,
		cost: result.totalCost,
	};
}

/**
 * Analysis only: extract a VideoRecipe from a source video.
 */
export async function handleReplicateAnalyze(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const source = options.source || options.input;
	if (!source) {
		return {
			success: false,
			error: "Missing --source or --input (path to source video)",
		};
	}

	const outputDir = resolveOutputDir(options.outputDir, `cli-${Date.now()}`);
	const startTime = Date.now();

	onProgress({ stage: "analyze", percent: 0, message: "Analyzing video..." });

	try {
		const recipe = await runAnalyzeOnly(source, {
			outputDir: options.json ? undefined : outputDir,
			model: options.llmModel,
			signal,
		});

		const duration = (Date.now() - startTime) / 1000;
		onProgress({
			stage: "done",
			percent: 100,
			message: `Extracted ${recipe.shots.length} shots`,
		});

		if (options.json) {
			return {
				success: true,
				duration,
				data: recipe,
			};
		}

		const recipePath = path.join(outputDir, "recipe.json");
		return {
			success: true,
			outputPath: recipePath,
			duration,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			duration: (Date.now() - startTime) / 1000,
		};
	}
}

/**
 * Generate from an existing recipe file.
 */
export async function handleReplicateGenerate(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const recipePath = options.input || options.config;
	if (!recipePath) {
		return {
			success: false,
			error: "Missing --input or --config (path to recipe JSON file)",
		};
	}

	const outputDir = resolveOutputDir(options.outputDir, `cli-${Date.now()}`);
	const startTime = Date.now();

	try {
		const result = await runFromRecipe(recipePath, {
			outputDir,
			outputFilename: options.output
				? path.basename(options.output)
				: undefined,
			videoModel: options.videoModel || options.model,
			imageModel: options.imageModel,
			signal,
			onProgress: (stage, percent, message) => {
				onProgress({ stage, percent, message });
			},
		});

		const duration = (Date.now() - startTime) / 1000;

		if (!result.success) {
			return { success: false, error: result.error, duration };
		}

		return {
			success: true,
			outputPath: result.outputPath,
			duration,
			cost: result.totalCost,
			data: options.json ? { shotCount: result.shotCount } : undefined,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			duration: (Date.now() - startTime) / 1000,
		};
	}
}
