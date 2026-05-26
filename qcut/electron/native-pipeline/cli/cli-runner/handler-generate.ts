/**
 * Generate handler (image/video/avatar).
 *
 * Supports single generation and parallel batch generation via --count or --prompts.
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-generate
 */

import * as path from "path";
import * as fs from "fs/promises";
import { ModelRegistry } from "../../infra/registry.js";
import { PipelineExecutor } from "../../execution/executor.js";
import type { PipelineStep } from "../../execution/executor.js";
import { estimateCost } from "../../infra/cost-calculator.js";
import { downloadOutput } from "../../infra/api-caller.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import { cropImageToAspectRatio } from "../../output/image-aspect-ratio.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";
import { guessExtFromCommand } from "./progress.js";

/**
 * Slugify a prompt for use in a filename. Lowercases, strips non-word
 * chars, collapses whitespace into single dashes, trims to 60 chars on
 * a word boundary so the result is always a usable identifier.
 */
export function slugifyPrompt(prompt: string, maxLen = 60): string {
	const cleaned = prompt
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, " ")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (cleaned.length <= maxLen) return cleaned || "untitled";
	const truncated = cleaned.slice(0, maxLen);
	const lastDash = truncated.lastIndexOf("-");
	return lastDash > 20 ? truncated.slice(0, lastDash) : truncated;
}

/**
 * Build a descriptive output basename: `<model>_<prompt-slug>_<timestamp>`.
 * Falls back to `output_<timestamp>` when there's no model or prompt.
 */
export function buildOutputBasename(
	model: string | undefined,
	promptText: string,
	timestamp: number,
	jobIndex: number
): string {
	const stamp = String(timestamp);
	const slug = slugifyPrompt(promptText);
	const indexSuffix = jobIndex >= 0 ? `_${jobIndex}` : "";
	if (model && slug && slug !== "untitled") {
		return `${model}_${slug}_${stamp}${indexSuffix}`;
	}
	if (model) {
		return `${model}_${stamp}${indexSuffix}`;
	}
	return `output_${stamp}${indexSuffix}`;
}

export function getDefaultModelForCommand({
	command,
}: {
	command: string;
}): string | undefined {
	if (command === "generate-image") return "gpt_image_2_ima";
	if (command === "create-video") return "imarouter_seedance_2_0_fast_t2v";
	return undefined;
}

function isImaRouterGptImage2Model({
	modelKey,
}: {
	modelKey?: string;
}): boolean {
	return modelKey === "gpt_image_2_ima" || modelKey === "gpt_image_2_gmi";
}

function validateCustomImageSize({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): string | undefined {
	if (width === undefined && height === undefined) return undefined;
	const hasInvalidWidth =
		typeof width !== "number" || !Number.isInteger(width) || width <= 0;
	const hasInvalidHeight =
		typeof height !== "number" || !Number.isInteger(height) || height <= 0;
	if (hasInvalidWidth || hasInvalidHeight) {
		return "--width and --height must be positive integers when used for image generation.";
	}
	return undefined;
}

function formatCustomImageSize({
	width,
	height,
}: {
	width?: number;
	height?: number;
}): string | undefined {
	if (width === undefined || height === undefined) return undefined;
	return `${width}x${height}`;
}

function shouldCropGeneratedImage({
	options,
}: {
	options: CLIRunOptions;
}): boolean {
	if (options.command !== "generate-image" || !options.aspectRatio)
		return false;
	if (isImaRouterGptImage2Model({ modelKey: options.model })) return false;
	return options.width === undefined && options.height === undefined;
}

function normalizeDurationForComparison({
	duration,
}: {
	duration: string | number;
}): string {
	const raw = String(duration).trim().toLowerCase();
	if (/^\d+(\.\d+)?s$/.test(raw)) {
		return raw.slice(0, -1);
	}
	return raw;
}

function formatDurationOption({
	duration,
}: {
	duration: string | number;
}): string {
	const text = String(duration).trim();
	return /^\d+(\.\d+)?$/.test(text) ? `${text}s` : text;
}

function formatDurationOptions({
	durationOptions,
}: {
	durationOptions: (string | number)[];
}): string {
	return durationOptions
		.map((duration) => formatDurationOption({ duration }))
		.join(", ");
}

export function validateDurationOption({
	modelKey,
	duration,
}: {
	modelKey: string;
	duration: string | undefined;
}): string | undefined {
	if (!duration) return undefined;
	const model = ModelRegistry.get(modelKey);
	if (model.durationOptions.length === 0) return undefined;

	const allowedDurations = new Set(
		model.durationOptions.map((option) =>
			normalizeDurationForComparison({ duration: option })
		)
	);
	const requestedDuration = normalizeDurationForComparison({ duration });
	if (allowedDurations.has(requestedDuration)) return undefined;

	return `Invalid --duration '${duration}' for ${modelKey}. Supported durations: ${formatDurationOptions({ durationOptions: model.durationOptions })}.`;
}

function coerceDurationParam({
	duration,
}: {
	duration: string;
}): string | number {
	const stripped = duration.trim().replace(/s$/i, "");
	const asNum = Number(stripped);
	return Number.isFinite(asNum) ? asNum : duration;
}

/** Write a sidecar JSON file with prompt + parameters next to the output. */
async function writeSidecarJson(
	basenamePath: string,
	command: string,
	model: string | undefined,
	endpoint: string | undefined,
	prompt: string,
	params: Record<string, unknown>,
	options: CLIRunOptions,
	result: {
		endpoint?: string;
		outputUrl?: string;
		outputPath?: string;
		cost?: number;
	},
	timestamp: number,
	durationSeconds: number
): Promise<void> {
	const sidecar = {
		schema_version: "1",
		command,
		model,
		endpoint,
		prompt,
		params,
		inputs: {
			image_url: options.imageUrl,
			video_url: options.videoUrl,
			audio_url: options.audioUrl,
			reference_images: options.referenceImages,
		},
		output: {
			path: result.outputPath,
			video_url: result.outputUrl,
		},
		cost: result.cost ?? null,
		duration_seconds: durationSeconds,
		generated_at: new Date(timestamp).toISOString(),
	};
	try {
		await fs.writeFile(
			`${basenamePath}.json`,
			JSON.stringify(sidecar, null, 2),
			"utf8"
		);
	} catch {
		// Sidecar is best-effort — losing it must not fail the run.
	}
}

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
	const modelKey = options.model;
	if (!modelKey) {
		return {
			success: false,
			error: "Missing model",
			duration: (Date.now() - startTime) / 1000,
		};
	}
	const model = ModelRegistry.get(modelKey);
	const prefix = jobIndex >= 0 ? `[${jobIndex + 1}] ` : "";

	onProgress({
		stage: "starting",
		percent: 0,
		message: `${prefix}Starting ${model.name}...`,
		model: modelKey,
	});

	const step: PipelineStep = {
		type: model.categories[0],
		model: modelKey,
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
				model: modelKey,
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

	const outputTimestamp = Date.now();
	const basename = buildOutputBasename(
		options.model,
		promptText,
		outputTimestamp,
		jobIndex
	);

	// The executor's `mapApiResult` already downloaded under a generic
	// `output_<ms>.mp4` name. Rename to our descriptive basename in-place
	// so the user sees `<model>_<slug>_<ms>.mp4` in their exports folder.
	// Best-effort: a rename failure (race, permissions) leaves the file
	// at the original path — the download itself isn't lost.
	if (result.outputPath && outputDir) {
		const currentDir = path.dirname(result.outputPath);
		const ext = path.extname(result.outputPath);
		const desired = path.join(currentDir, `${basename}${ext}`);
		if (currentDir === outputDir && desired !== result.outputPath) {
			try {
				await fs.rename(result.outputPath, desired);
				result.outputPath = desired;
			} catch {
				// Keep original path if rename fails.
			}
		}
	}

	// Fallback: executor didn't download (e.g. no outputDir was wired
	// through). Download here using the new basename.
	if (!result.outputPath && result.outputUrl && outputDir) {
		const ext = guessExtFromCommand(options.command);
		const destPath = path.join(outputDir, `${basename}${ext}`);
		try {
			result.outputPath = await downloadOutput(result.outputUrl, destPath);
		} catch {
			// URL still available in result
		}
	}

	if (shouldCropGeneratedImage({ options })) {
		await cropImageToAspectRatio({
			filePath: result.outputPath,
			aspectRatio: options.aspectRatio,
		});
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: `${prefix}Done`,
		model: modelKey,
	});

	const cost = result.cost ?? estimateCost(modelKey, params).totalCost;

	// Sidecar JSON next to the output captures the prompt + every param
	// the run was given. Lets users reproduce a generation without
	// digging through shell history. Best-effort: write failures don't
	// fail the run (the video is the primary deliverable).
	if (result.outputPath || (outputDir && result.outputUrl)) {
		const sidecarBase = result.outputPath
			? result.outputPath.replace(/\.[^.]+$/, "")
			: path.join(outputDir, basename);
		await writeSidecarJson(
			sidecarBase,
			options.command,
			modelKey,
			result.endpoint ?? model.endpoint,
			promptText,
			params,
			options,
			{
				endpoint: result.endpoint,
				outputUrl: result.outputUrl,
				outputPath: result.outputPath,
				cost,
			},
			outputTimestamp,
			(Date.now() - startTime) / 1000
		);
	}

	return {
		success: true,
		endpoint: result.endpoint,
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
		const defaultModel = getDefaultModelForCommand({
			command: options.command,
		});
		if (!defaultModel) {
			return {
				success: false,
				error: "Missing --model. Run --help for usage.",
			};
		}
		options.model = defaultModel;
	}
	if (!ModelRegistry.has(options.model)) {
		return {
			success: false,
			error: `Unknown model '${options.model}'. Run list-models to see available models.`,
		};
	}
	if (options.command === "create-video") {
		const durationError = validateDurationOption({
			modelKey: options.model,
			duration: options.duration,
		});
		if (durationError) {
			return {
				success: false,
				error: durationError,
			};
		}
	}

	const hasTextInput = !!options.text;
	const hasImageInput = !!options.imageUrl;
	const hasVideoInput = !!options.videoUrl;
	const hasAudioInput = !!options.audioUrl;
	const hasPrompts = options.prompts && options.prompts.length > 0;
	const hasReferenceImages =
		!!options.referenceImages && options.referenceImages.length > 0;

	if (options.command === "generate-image" && !hasTextInput && !hasPrompts) {
		return {
			success: false,
			error: "Missing --text/-t (prompt for image generation).",
		};
	}
	if (options.command === "generate-image") {
		const customImageSizeError = validateCustomImageSize({
			width: options.width,
			height: options.height,
		});
		if (customImageSizeError) {
			return {
				success: false,
				error: customImageSizeError,
			};
		}
		const customImageSize = formatCustomImageSize({
			width: options.width,
			height: options.height,
		});
		if (
			customImageSize &&
			!isImaRouterGptImage2Model({ modelKey: options.model })
		) {
			return {
				success: false,
				error:
					"--width/--height custom image size is currently supported for gpt_image_2_ima and gpt_image_2_gmi.",
			};
		}
	}
	if (
		options.command === "create-video" &&
		!hasTextInput &&
		!hasImageInput &&
		!hasVideoInput &&
		!hasReferenceImages
	) {
		return {
			success: false,
			error:
				"Missing input. Provide --text/-t, --image-url, --video-url (video-edit), or --reference-images.",
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
		// Provider adapters re-stringify the few APIs that require literal enums.
		params.duration = coerceDurationParam({ duration: options.duration });
	}
	if (options.aspectRatio) params.aspect_ratio = options.aspectRatio;
	const customImageSize = formatCustomImageSize({
		width: options.width,
		height: options.height,
	});
	if (options.command === "generate-image" && customImageSize) {
		params.size = customImageSize;
	}
	if (options.resolution) params.resolution = options.resolution;
	if (options.negativePrompt) params.negative_prompt = options.negativePrompt;
	if (options.voiceId) params.voice_id = options.voiceId;
	if (options.elementIds && options.elementIds.length > 0) {
		params.element_list = options.elementIds.map((id) => ({
			element_id: id,
		}));
	}
	// Kling V3 Omni: sound toggle ("on" | "off") and watermark_info
	if (options.sound && (options.sound === "on" || options.sound === "off")) {
		params.sound = options.sound;
	}
	if (options.watermark) {
		params.watermark_info = { enabled: true };
	}

	if (options.command === "generate-avatar") {
		if (options.referenceImages && options.referenceImages.length > 0) {
			params.reference_images = options.referenceImages.slice(0, 4);
		}
	}

	// Ref2V models reuse --reference-images / --audio-setting:
	// - happy_horse_ref2v: 1–9 images become payload `image_urls`
	// - imarouter_*_ref2v: 1–14 images become IMA Router `images`
	// - happy_horse_video_edit: ≤5 images become payload `reference_image_urls`
	// Field-name mapping happens inside step-executors per-model branches;
	// the CLI just stages the array under a stable key the executor reads.
	if (options.command === "create-video") {
		if (options.referenceImages && options.referenceImages.length > 0) {
			if (options.model === "happy_horse_ref2v") {
				params.image_urls = options.referenceImages.slice(0, 9);
			} else if (
				options.model === "imarouter_seedance_2_0_ref2v" ||
				options.model === "imarouter_seedance_2_0_cn_ref2v"
			) {
				params.image_urls = options.referenceImages.slice(0, 14);
			} else if (options.model === "happy_horse_video_edit") {
				params.reference_image_urls = options.referenceImages.slice(0, 5);
			}
		}
		if (options.audioSetting && options.model === "happy_horse_video_edit") {
			if (
				options.audioSetting !== "auto" &&
				options.audioSetting !== "origin"
			) {
				return {
					success: false,
					error: `Invalid --audio-setting '${options.audioSetting}'. Expected 'auto' or 'origin'.`,
				};
			}
			params.audio_setting = options.audioSetting;
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
	if (
		options.command === "generate-image" &&
		options.referenceImages &&
		options.referenceImages.length > 0
	) {
		params.image_urls = options.referenceImages;
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
