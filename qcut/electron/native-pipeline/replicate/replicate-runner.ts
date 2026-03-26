/**
 * Replicate Runner — orchestrates the video replication pipeline using ViMax agents.
 *
 * Steps: analyze → plan (convert to Script) → storyboard → camera generate → final video
 *
 * @module electron/native-pipeline/replicate/replicate-runner
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { VideoRecipe, GeneratedShot } from "./replicate-types.js";
import {
	analyzeVideo,
	validateRecipe,
	type AnalyzerOptions,
} from "./replicate-analyzer.js";
import { planReplicate, type PlannerOptions } from "./replicate-planner.js";
import { StoryboardArtist } from "../vimax/agents/storyboard-artist.js";
import { CameraImageGenerator } from "../vimax/agents/camera-generator.js";
import type { PipelineOutput, VideoOutput } from "../vimax/types/output.js";
import { PipelineExecutor } from "../execution/executor.js";

export interface ReplicateRunnerOptions {
	/** Path to the source video to replicate. */
	source: string;
	/** Output directory. */
	outputDir: string;
	/** Optional output filename. */
	outputFilename?: string;
	/** Video generation model key. */
	videoModel?: string;
	/** Image generation model key. */
	imageModel?: string;
	/** Gemini model for analysis. */
	analysisModel?: string;
	/** Abort signal. */
	signal?: AbortSignal;
	/** Progress callback. */
	onProgress?: (stage: string, percent: number, message: string) => void;
}

export type ReplicateResult =
	| {
			success: true;
			recipe: VideoRecipe;
			output?: PipelineOutput;
			generatedShots: GeneratedShot[];
			outputPath?: string;
			totalCost: number;
			shotCount: number;
	  }
	| {
			success: false;
			recipe?: VideoRecipe;
			generatedShots: GeneratedShot[];
			totalCost: number;
			shotCount: number;
			error: string;
	  };

/**
 * Run the full replicate pipeline: analyze → plan → storyboard → generate → assemble.
 */
export async function runReplicate(
	options: ReplicateRunnerOptions
): Promise<ReplicateResult> {
	const { source, outputDir, onProgress } = options;

	fs.mkdirSync(outputDir, { recursive: true });

	// ── Step 1: Analyze ──
	onProgress?.("analyze", 0, "Analyzing source video...");

	let recipe: VideoRecipe;
	const executor = new PipelineExecutor();
	try {
		const analyzerOpts: AnalyzerOptions = {
			model: options.analysisModel,
			signal: options.signal,
			executor,
		};
		recipe = await analyzeVideo(source, analyzerOpts);
	} catch (err) {
		return {
			success: false,
			generatedShots: [],
			totalCost: 0,
			shotCount: 0,
			error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	// Save recipe JSON
	const recipePath = path.join(outputDir, "recipe.json");
	fs.writeFileSync(recipePath, JSON.stringify(recipe, null, 2), "utf-8");
	onProgress?.("analyze", 20, `Extracted ${recipe.shots.length} shots`);

	// ── Step 2: Plan (convert to ViMax Script) ──
	onProgress?.("plan", 25, "Converting to ViMax script...");

	const plannerOpts: PlannerOptions = {
		videoModel: options.videoModel,
		imageModel: options.imageModel,
	};
	const plan = planReplicate(recipe, plannerOpts);
	onProgress?.(
		"plan",
		30,
		`Script: ${plan.script.scenes[0]?.shots.length ?? 0} shots`
	);

	return runViMaxPipeline(recipe, plan, options);
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
	const recipe = validateRecipe(JSON.parse(raw), path.basename(recipePath));

	const plannerOpts: PlannerOptions = {
		videoModel: options.videoModel,
		imageModel: options.imageModel,
	};
	const plan = planReplicate(recipe, plannerOpts);

	options.onProgress?.("plan", 10, "Planning from recipe...");

	return runViMaxPipeline(recipe, plan, options);
}

// ---------------------------------------------------------------------------
// Internal: run ViMax pipeline from a planned script
// ---------------------------------------------------------------------------

async function runViMaxPipeline(
	recipe: VideoRecipe,
	plan: ReturnType<typeof planReplicate>,
	options: Omit<ReplicateRunnerOptions, "source">
): Promise<ReplicateResult> {
	const { outputDir, onProgress } = options;
	const storyboardDir = path.join(outputDir, "storyboard");
	const videosDir = path.join(outputDir, "videos");

	// ── Step 3: StoryboardArtist — generate images ──
	onProgress?.("storyboard", 35, "Generating storyboard images...");

	const storyboardArtist = new StoryboardArtist({
		image_model: plan.imageModel,
		output_dir: storyboardDir,
		use_character_references: false,
	});

	const storyboardResult = await storyboardArtist.process(plan.script);

	if (!storyboardResult.success || !storyboardResult.result) {
		return {
			success: false,
			recipe,
			generatedShots: [],
			totalCost: 0,
			shotCount: 0,
			error: `Storyboard generation failed: ${storyboardResult.error}`,
		};
	}

	onProgress?.(
		"storyboard",
		60,
		`Generated ${storyboardResult.result.images.length} storyboard images`
	);

	// ── Step 4: CameraImageGenerator — generate videos ──
	onProgress?.("generate", 65, "Generating videos from storyboard...");

	const cameraGenerator = new CameraImageGenerator({
		video_model: plan.videoModel,
		output_dir: videosDir,
	});

	const cameraResult = await cameraGenerator.process(storyboardResult.result);

	if (!cameraResult.success || !cameraResult.result) {
		return {
			success: false,
			recipe,
			generatedShots: [],
			totalCost: storyboardResult.result.total_cost,
			shotCount: 0,
			error: `Video generation failed: ${cameraResult.error}`,
		};
	}

	onProgress?.(
		"generate",
		90,
		`Generated ${cameraResult.result.videos.length} videos`
	);

	// ── Step 5: Final video (already concatenated by CameraImageGenerator) ──
	onProgress?.("assemble", 95, "Finalizing...");

	const pipelineOutput = cameraResult.result;

	// Copy final video to desired output location if needed
	let finalPath = pipelineOutput.final_video?.video_path;
	if (finalPath && options.outputFilename) {
		const destPath = path.join(outputDir, options.outputFilename);
		try {
			fs.copyFileSync(finalPath, destPath);
			finalPath = destPath;
		} catch (err) {
			throw new Error(
				`Failed to copy output to ${destPath}: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	const totalCost =
		storyboardResult.result.total_cost + pipelineOutput.total_cost;

	onProgress?.("done", 100, "Complete");

	// Build generatedShots from pipeline output for CLI compatibility
	const generatedShots: GeneratedShot[] = pipelineOutput.videos.map(
		(v: VideoOutput, i: number) => ({
			index: i,
			startTime: 0,
			endTime: v.duration,
			duration: v.duration,
			type: "medium" as const,
			camera: "static" as const,
			description: v.prompt,
			prompt: v.prompt,
			transition: "cut" as const,
			hasText: false,
			hasSubtitle: false,
			strategy: "ai-video" as const,
			outputPath: v.video_path,
		})
	);

	return {
		success: true,
		recipe,
		output: pipelineOutput,
		generatedShots,
		outputPath: finalPath,
		totalCost,
		shotCount: pipelineOutput.videos.length,
	};
}
