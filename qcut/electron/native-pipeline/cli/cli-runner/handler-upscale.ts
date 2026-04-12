/**
 * Upscale handlers for images and videos.
 *
 * Image path → FAL clarity/topaz-image endpoints via `image_to_image` step.
 * Video path → FAL Topaz Video Upscale (`fal-ai/topaz/upscale/video`).
 *
 * @module electron/native-pipeline/cli/cli-runner/handler-upscale
 */

import { join } from "node:path";
import { ModelRegistry } from "../../infra/registry.js";
import { PipelineExecutor } from "../../execution/executor.js";
import type { PipelineStep } from "../../execution/executor.js";
import { downloadOutput } from "../../infra/api-caller.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";

/**
 * Upscale an image using an `image_to_image` pipeline step.
 *
 * Accepts either `--image` / `--image-url` or `-i` (alias). Supports an
 * explicit `--upscale` factor or a `--target` resolution preset
 * (`720p` → 1x, `1080p` → 2x, `1440p` → 3x, `2160p` → 4x).
 *
 * The model key defaults to `topaz`; callers wanting a working image-capable
 * model can pass `--model clarity` (`fal-ai/clarity-upscaler`). Output is
 * downloaded to the resolved session directory as `upscaled_<ts>.<ext>`.
 */
export async function handleUpscaleImage(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	const imageInput = options.image || options.imageUrl || options.input;
	if (!imageInput) {
		return { success: false, error: "Missing --image or --image-url" };
	}

	const model = options.model || "topaz";
	if (!ModelRegistry.has(model)) {
		return { success: false, error: `Unknown model '${model}'` };
	}

	const startTime = Date.now();
	const sessionId = `cli-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);

	onProgress({
		stage: "upscaling",
		percent: 0,
		message: "Upscaling image...",
		model,
	});

	const params: Record<string, unknown> = {};
	if (options.upscale) {
		const upscaleFactor = parseInt(options.upscale, 10);
		if (isNaN(upscaleFactor) || upscaleFactor <= 0) {
			return {
				success: false,
				error: `Invalid upscale factor: ${options.upscale}`,
			};
		}
		params.upscale_factor = upscaleFactor;
	}

	if (options.target) {
		const targetMap: Record<string, number> = {
			"720p": 1,
			"1080p": 2,
			"1440p": 3,
			"2160p": 4,
		};
		const factor = targetMap[options.target];
		if (!factor) {
			return {
				success: false,
				error: `Unknown target '${options.target}'. Valid targets: ${Object.keys(targetMap).join(", ")}`,
			};
		}
		params.upscale_factor = factor;
		params.target_resolution = options.target;
	}

	const step: PipelineStep = {
		type: "image_to_image",
		model,
		params,
		enabled: true,
		retryCount: 0,
	};

	const result = await executor.executeStep(
		step,
		{ imageUrl: imageInput },
		{
			outputDir,
			signal,
		}
	);

	const format = options.outputFormat?.toLowerCase();
	if (format && !/^[a-z0-9]+$/.test(format)) {
		return { success: false, error: "Invalid --format value" };
	}
	const outputExt = format ? `.${format}` : ".png";

	if (!result.outputPath && result.outputUrl && outputDir) {
		try {
			result.outputPath = await downloadOutput(
				result.outputUrl,
				join(outputDir, `upscaled_${Date.now()}${outputExt}`)
			);
		} catch {
			/* URL still available */
		}
	}

	onProgress({ stage: "complete", percent: 100, message: "Done", model });

	return {
		success: result.success,
		outputPath: result.outputPath,
		error: result.error,
		cost: result.cost,
		duration: (Date.now() - startTime) / 1000,
	};
}

/**
 * Upscale a video using the FAL Topaz Video Upscale endpoint.
 *
 * See https://fal.ai/models/fal-ai/topaz/upscale/video/api for payload details.
 * Local paths are auto-uploaded to FAL storage by `executeVideoToVideo`.
 */
export async function handleUpscaleVideo(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	const videoInput = options.videoUrl || options.video || options.input;
	if (!videoInput) {
		return { success: false, error: "Missing --video or --video-url" };
	}

	const model = options.model || "topaz";
	if (!ModelRegistry.has(model)) {
		return { success: false, error: `Unknown model '${model}'` };
	}

	const factor = options.upscale ? parseInt(String(options.upscale), 10) : 2;
	if (Number.isNaN(factor) || factor < 1 || factor > 4) {
		return {
			success: false,
			error: `Invalid --upscale (must be 1-4): ${options.upscale}`,
		};
	}

	const params: Record<string, unknown> = { upscale_factor: factor };
	if (options.targetFps !== undefined) {
		if (!Number.isFinite(options.targetFps) || options.targetFps <= 0) {
			return {
				success: false,
				error: `Invalid --target-fps: ${options.targetFps}`,
			};
		}
		params.target_fps = options.targetFps;
	}

	const startTime = Date.now();
	const sessionId = `cli-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);

	onProgress({
		stage: "upscaling",
		percent: 0,
		message: "Upscaling video...",
		model,
	});

	const step: PipelineStep = {
		type: "upscale_video",
		model,
		params,
		enabled: true,
		retryCount: 0,
	};

	const result = await executor.executeStep(
		step,
		{ videoUrl: videoInput },
		{ outputDir, signal }
	);

	const format = options.outputFormat?.toLowerCase();
	if (format && !/^[a-z0-9]+$/.test(format)) {
		return { success: false, error: "Invalid --output-format value" };
	}
	const outputExt = format ? `.${format}` : ".mp4";

	if (!result.outputPath && result.outputUrl && outputDir) {
		try {
			result.outputPath = await downloadOutput(
				result.outputUrl,
				join(outputDir, `upscaled_${Date.now()}${outputExt}`)
			);
		} catch {
			/* URL still available on result.outputUrl */
		}
	}

	onProgress({ stage: "complete", percent: 100, message: "Done", model });

	return {
		success: result.success,
		outputPath: result.outputPath,
		error: result.error,
		cost: result.cost,
		duration: (Date.now() - startTime) / 1000,
	};
}
