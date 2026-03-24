/**
 * Replicate Runner — orchestrates the full video replication pipeline.
 *
 * Steps: analyze → plan → generate → assemble
 *
 * @module electron/native-pipeline/replicate/replicate-runner
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
	VideoRecipe,
	PlannedShot,
	GeneratedShot,
	ReplicateResult,
} from "./replicate-types.js";
import { analyzeVideo, type AnalyzerOptions } from "./replicate-analyzer.js";
import { planShots, type PlannerOptions } from "./replicate-planner.js";
import {
	generateShots,
	type GeneratorOptions,
} from "./replicate-generator.js";
import { assembleVideo, type AssemblerOptions } from "./replicate-assembler.js";

export interface ReplicateRunnerOptions {
	/** Path to the source video to replicate. */
	source: string;
	/** Output directory. */
	outputDir: string;
	/** Optional output filename. */
	outputFilename?: string;
	/** Directory of user-provided media to use instead of AI generation. */
	mediaDir?: string;
	/** Video generation model key. */
	videoModel?: string;
	/** Image generation model key. */
	imageModel?: string;
	/** Gemini model for analysis. */
	analysisModel?: string;
	/** Max concurrent generation jobs. */
	concurrency?: number;
	/** Abort signal. */
	signal?: AbortSignal;
	/** Progress callback. */
	onProgress?: (stage: string, percent: number, message: string) => void;
}

/**
 * Run the full replicate pipeline: analyze → plan → generate → assemble.
 */
export async function runReplicate(
	options: ReplicateRunnerOptions
): Promise<ReplicateResult> {
	const { source, outputDir, onProgress } = options;

	fs.mkdirSync(outputDir, { recursive: true });

	// ── Step 1: Analyze ──
	onProgress?.("analyze", 0, "Analyzing source video...");

	let recipe: VideoRecipe;
	try {
		const analyzerOpts: AnalyzerOptions = {
			model: options.analysisModel,
			signal: options.signal,
		};
		recipe = await analyzeVideo(source, analyzerOpts);
	} catch (err) {
		return {
			success: false,
			recipe: null!,
			plannedShots: [],
			generatedShots: [],
			totalCost: 0,
			error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	// Save recipe JSON
	const recipePath = path.join(outputDir, "recipe.json");
	fs.writeFileSync(recipePath, JSON.stringify(recipe, null, 2), "utf-8");
	onProgress?.("analyze", 20, `Extracted ${recipe.shots.length} shots`);

	// ── Step 2: Plan ──
	onProgress?.("plan", 25, "Planning generation strategies...");

	const plannerOpts: PlannerOptions = {
		mediaDir: options.mediaDir,
		videoModel: options.videoModel,
		imageModel: options.imageModel,
	};
	const plannedShots = planShots(recipe, plannerOpts);
	onProgress?.("plan", 30, `Planned ${plannedShots.length} shots`);

	// ── Step 3: Generate ──
	onProgress?.("generate", 35, "Generating media for shots...");

	const generatorOpts: GeneratorOptions = {
		outputDir: path.join(outputDir, "shots"),
		concurrency: options.concurrency,
		signal: options.signal,
		onProgress: (completed, total, msg) => {
			const percent = 35 + Math.round((completed / total) * 45);
			onProgress?.("generate", percent, msg);
		},
	};
	const { shots: generatedShots, totalCost } = await generateShots(
		plannedShots,
		generatorOpts
	);

	// ── Step 4: Assemble ──
	onProgress?.("assemble", 85, "Assembling final video...");

	const assemblerOpts: AssemblerOptions = {
		outputDir,
		outputFilename: options.outputFilename,
		fps: recipe.source.fps,
		resolution: recipe.source.resolution,
	};
	const assemblyResult = await assembleVideo(
		recipe,
		generatedShots,
		assemblerOpts
	);

	onProgress?.("done", 100, assemblyResult.success ? "Complete" : "Assembly failed");

	return {
		success: assemblyResult.success,
		recipe,
		plannedShots,
		generatedShots,
		outputPath: assemblyResult.outputPath,
		totalCost,
		error: assemblyResult.error,
	};
}

/**
 * Run analysis only — extract a recipe from a source video.
 */
export async function runAnalyzeOnly(
	source: string,
	options: {
		outputDir?: string;
		model?: string;
		signal?: AbortSignal;
	} = {}
): Promise<VideoRecipe> {
	const recipe = await analyzeVideo(source, {
		model: options.model,
		signal: options.signal,
	});

	if (options.outputDir) {
		fs.mkdirSync(options.outputDir, { recursive: true });
		const recipePath = path.join(options.outputDir, "recipe.json");
		fs.writeFileSync(recipePath, JSON.stringify(recipe, null, 2), "utf-8");
	}

	return recipe;
}

/**
 * Run generation from an existing recipe file.
 */
export async function runFromRecipe(
	recipePath: string,
	options: Omit<ReplicateRunnerOptions, "source">
): Promise<ReplicateResult> {
	const raw = fs.readFileSync(recipePath, "utf-8");
	const recipe = JSON.parse(raw) as VideoRecipe;

	const plannerOpts: PlannerOptions = {
		mediaDir: options.mediaDir,
		videoModel: options.videoModel,
		imageModel: options.imageModel,
	};
	const plannedShots = planShots(recipe, plannerOpts);

	options.onProgress?.("generate", 10, "Generating media from recipe...");

	const generatorOpts: GeneratorOptions = {
		outputDir: path.join(options.outputDir, "shots"),
		concurrency: options.concurrency,
		signal: options.signal,
		onProgress: (completed, total, msg) => {
			const percent = 10 + Math.round((completed / total) * 70);
			options.onProgress?.("generate", percent, msg);
		},
	};
	const { shots: generatedShots, totalCost } = await generateShots(
		plannedShots,
		generatorOpts
	);

	options.onProgress?.("assemble", 85, "Assembling final video...");

	const assemblerOpts: AssemblerOptions = {
		outputDir: options.outputDir,
		outputFilename: options.outputFilename,
		fps: recipe.source.fps,
		resolution: recipe.source.resolution,
	};
	const assemblyResult = await assembleVideo(
		recipe,
		generatedShots,
		assemblerOpts
	);

	options.onProgress?.("done", 100, assemblyResult.success ? "Complete" : "Assembly failed");

	return {
		success: assemblyResult.success,
		recipe,
		plannedShots,
		generatedShots,
		outputPath: assemblyResult.outputPath,
		totalCost,
		error: assemblyResult.error,
	};
}
