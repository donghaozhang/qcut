/**
 * Generate handler (image/video/avatar).
 *
 * Supports single generation and parallel batch generation via --count or --prompts.
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-generate
 */

import * as path from "path";
import { ModelRegistry } from "../../infra/registry.js";
import { PipelineExecutor } from "../../execution/executor.js";
import type { PipelineStep } from "../../execution/executor.js";
import { estimateCost } from "../../infra/cost-calculator.js";
import { downloadOutput } from "../../infra/api-caller.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";
import { guessExtFromCommand } from "./progress.js";

/**
 * Run a single generation step and download the result.
 * Shared by both single and batch paths.
 */
async function runSingleGeneration(
	options: CLIRunOptions,
	promptText: string,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal,
	jobIndex: number,
	outputDir: string,
	params: Record<string, unknown>
): Promise<CLIResult> {
	const startTime = Date.now();
	const model = ModelRegistry.get(options.model!);
	const prefix = jobIndex >= 0 ? `[${jobIndex + 1}] ` : "";

	onProgress({
		stage: "starting",
		percent: 0,
		message: `${prefix}Starting ${model.name}...`,
		model: options.model,
	});

	const step: PipelineStep = {
		type: model.categories[0],
		model: options.model!,
		params,
		enabled: true,
		retryCount: 0,
	};

	const input = {
		text: promptText,
		imageUrl: options.imageUrl,
		videoUrl: options.videoUrl,
		audioUrl: options.audioUrl,
	};

	const result = await executor.executeStep(step, input, {
		outputDir,
		onProgress: (percent, message) => {
			onProgress({
				stage: "processing",
				percent,
				message: `${prefix}${message}`,
				model: options.model,
			});
		},
		signal,
	});

	if (!result.success) {
		return {
			success: false,
			error: `${prefix}${result.error}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	if (!result.outputPath && result.outputUrl && outputDir) {
		const ext = guessExtFromCommand(options.command);
		const suffix = jobIndex >= 0 ? `_${jobIndex}` : "";
		const filename = `output_${Date.now()}${suffix}${ext}`;
		const destPath = path.join(outputDir, filename);
		try {
			result.outputPath = await downloadOutput(result.outputUrl, destPath);
		} catch {
			// URL still available in result
		}
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: `${prefix}Done`,
		model: options.model,
	});

	const cost = result.cost ?? estimateCost(options.model!, params).totalCost;

	return {
		success: true,
		outputPath: result.outputPath,
		outputPaths: result.outputPath ? [result.outputPath] : undefined,
		cost,
		duration: (Date.now() - startTime) / 1000,
	};
}

/** Validate inputs, build prompt list, and dispatch single or parallel generation. */
export async function handleGenerate(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	if (!options.model) {
		if (options.command === "generate-image") {
			options.model = "nano_banana_pro";
		} else {
			return {
				success: false,
				error: "Missing --model. Run --help for usage.",
			};
		}
	}
	if (!ModelRegistry.has(options.model)) {
		return {
			success: false,
			error: `Unknown model '${options.model}'. Run list-models to see available models.`,
		};
	}

	const hasTextInput = !!options.text;
	const hasImageInput = !!options.imageUrl;
	const hasAudioInput = !!options.audioUrl;
	const hasPrompts = options.prompts && options.prompts.length > 0;

	if (options.command === "generate-image" && !hasTextInput && !hasPrompts) {
		return {
			success: false,
			error: "Missing --text/-t (prompt for image generation).",
		};
	}
	if (options.command === "create-video" && !hasTextInput && !hasImageInput) {
		return {
			success: false,
			error: "Missing --text/-t or --image-url (need a prompt or image input).",
		};
	}
	if (
		options.command === "generate-avatar" &&
		!hasTextInput &&
		!hasAudioInput
	) {
		return {
			success: false,
			error: "Missing --text/-t or --audio-url (need a script or audio input).",
		};
	}

	const sessionId = `cli-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);

	const params: Record<string, unknown> = {};
	if (options.duration) {
		// Coerce pure-numeric durations ("6", "10") to numbers for APIs that
		// require integers. Keep string durations like "8s" (Veo) as-is.
		const stripped = options.duration.replace(/s$/, "");
		const asNum = Number(stripped);
		params.duration = Number.isFinite(asNum) ? asNum : options.duration;
	}
	if (options.aspectRatio) params.aspect_ratio = options.aspectRatio;
	if (options.resolution) params.resolution = options.resolution;
	if (options.negativePrompt) params.negative_prompt = options.negativePrompt;
	if (options.voiceId) params.voice_id = options.voiceId;
	if (options.elementIds && options.elementIds.length > 0) {
		params.element_list = options.elementIds.map((id) => ({
			element_id: id,
		}));
	}

	if (options.command === "generate-avatar") {
		if (options.referenceImages && options.referenceImages.length > 0) {
			params.reference_images = options.referenceImages.slice(0, 4);
		}
	}

	// Wan 2.7 edit models: pass image URL as image_urls array
	if (
		options.command === "generate-image" &&
		options.imageUrl &&
		(options.model === "wan_v2_7_edit" || options.model === "wan_v2_7_pro_edit")
	) {
		params.image_urls = [options.imageUrl];
	}

	// Validate --count
	if (options.count !== undefined && options.count < 1) {
		return {
			success: false,
			error: `Invalid --count: ${options.count}. Must be a positive integer.`,
		};
	}

	// Build list of prompts for batch generation
	const prompts = buildPromptList(options);

	// Single generation (no --count, no --prompts): original fast path
	if (prompts.length <= 1) {
		return runSingleGeneration(
			options,
			prompts[0] ?? options.text ?? "",
			onProgress,
			executor,
			signal,
			-1,
			outputDir,
			params
		);
	}

	// Parallel batch generation
	return runParallelGeneration(
		options,
		prompts,
		onProgress,
		executor,
		signal,
		outputDir,
		params
	);
}

/**
 * Build the list of prompts to generate.
 * --prompts takes priority, otherwise --count duplicates --text.
 */
function buildPromptList(options: CLIRunOptions): string[] {
	if (options.prompts && options.prompts.length > 0) {
		return options.prompts;
	}
	if (options.count && options.count > 1 && options.text) {
		return Array.from({ length: options.count }, () => options.text!);
	}
	return options.text ? [options.text] : [];
}

/**
 * Run multiple generation jobs in parallel using Promise.allSettled.
 * Reports per-job progress and aggregates results.
 */
async function runParallelGeneration(
	options: CLIRunOptions,
	prompts: string[],
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal,
	outputDir: string,
	params: Record<string, unknown>
): Promise<CLIResult> {
	const startTime = Date.now();

	onProgress({
		stage: "starting",
		percent: 0,
		message: `Starting parallel generation of ${prompts.length} jobs...`,
		model: options.model,
	});

	const jobs = prompts.map((prompt, index) =>
		runSingleGeneration(
			options,
			prompt,
			onProgress,
			executor,
			signal,
			index,
			outputDir,
			params
		)
	);

	const results = await Promise.allSettled(jobs);

	const outputPaths: string[] = [];
	let totalCost = 0;
	let successCount = 0;
	const errors: string[] = [];

	for (const [i, result] of results.entries()) {
		if (result.status === "fulfilled") {
			if (result.value.success) {
				successCount++;
				if (result.value.outputPath) {
					outputPaths.push(result.value.outputPath);
				}
				totalCost += result.value.cost ?? 0;
			} else {
				errors.push(`[${i + 1}] ${result.value.error}`);
			}
		} else {
			errors.push(`[${i + 1}] ${result.reason}`);
		}
	}

	const duration = (Date.now() - startTime) / 1000;

	if (successCount === 0) {
		return {
			success: false,
			error: `All ${prompts.length} jobs failed: ${errors.join("; ")}`,
			duration,
		};
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: `Completed ${outputPaths.length}/${prompts.length} jobs${errors.length > 0 ? ` (${errors.length} failed)` : ""}`,
		model: options.model,
	});

	return {
		success: true,
		outputPath: outputPaths[0],
		outputPaths,
		cost: totalCost,
		duration,
		data: errors.length > 0 ? { errors } : undefined,
	};
}
