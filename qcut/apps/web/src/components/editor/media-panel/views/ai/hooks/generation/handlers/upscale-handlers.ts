/**
 * Split from model-handler-implementations.ts by handler category.
 */

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import {
	upscaleByteDanceVideo,
	upscaleFlashVSRVideo,
	upscaleTopazVideo,
} from "@/lib/ai-video";
import type {
	ModelHandlerContext,
	ModelHandlerResult,
	UpscaleSettings,
} from "../model-handler-types";

/**
 * Target FPS used when the user enables Topaz frame interpolation.
 * Fal's API takes an integer; our UI exposes a simpler on/off toggle.
 * 60 gives a clear upgrade over typical 24/30 source footage without
 * being gratuitous.
 */
const TOPAZ_INTERPOLATED_FPS = 60;

// These aliases map UI values to generator literal unions.
type ByteDanceResolution = "1080p" | "2k" | "4k";
type ByteDanceFPS = "30fps" | "60fps";
type FlashVSRAcceleration = "regular" | "high" | "full";
type FlashVSROutputFormat = "X264" | "VP9" | "PRORES4444" | "GIF";
type FlashVSROutputQuality = "low" | "medium" | "high" | "maximum";
type FlashVSRWriteMode = "fast" | "balanced" | "small";

export async function handleByteDanceUpscale(
	ctx: ModelHandlerContext,
	settings: UpscaleSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideoFile && !settings.sourceVideoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video source required",
		};
	}

	let videoUrl: string | undefined = settings.sourceVideoUrl ?? undefined;

	if (settings.sourceVideoFile) {
		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Uploading video for ${ctx.modelName}...`,
		});

		try {
			videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideoFile);
		} catch (error) {
			return {
				response: undefined,
				shouldSkip: true,
				skipReason: `Failed to upload video: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	if (!videoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video URL could not be determined",
		};
	}

	ctx.progressCallback({
		status: "processing",
		progress: 30,
		message: `Upscaling video to ${settings.bytedanceTargetResolution}...`,
	});

	try {
		const response = await upscaleByteDanceVideo({
			video_url: videoUrl,
			target_resolution:
				settings.bytedanceTargetResolution as ByteDanceResolution,
			target_fps: settings.bytedanceTargetFPS as ByteDanceFPS,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video upscaled with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `ByteDance upscale failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Handle FlashVSR video upscaler
 */
export async function handleFlashVSRUpscale(
	ctx: ModelHandlerContext,
	settings: UpscaleSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideoFile && !settings.sourceVideoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video source required",
		};
	}

	let videoUrl: string | undefined = settings.sourceVideoUrl ?? undefined;

	if (settings.sourceVideoFile) {
		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Uploading video for ${ctx.modelName}...`,
		});

		try {
			videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideoFile);
		} catch (error) {
			return {
				response: undefined,
				shouldSkip: true,
				skipReason: `Failed to upload video: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	if (!videoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video URL could not be determined",
		};
	}

	const upscaleFactor = settings.flashvsrUpscaleFactor ?? 4;

	ctx.progressCallback({
		status: "processing",
		progress: 30,
		message: `Upscaling video with FlashVSR (${upscaleFactor}x)...`,
	});

	try {
		const response = await upscaleFlashVSRVideo({
			video_url: videoUrl,
			upscale_factor: upscaleFactor,
			acceleration: settings.flashvsrAcceleration as FlashVSRAcceleration,
			quality: settings.flashvsrQuality,
			color_fix: settings.flashvsrColorFix,
			preserve_audio: settings.flashvsrPreserveAudio,
			output_format: settings.flashvsrOutputFormat as FlashVSROutputFormat,
			output_quality: settings.flashvsrOutputQuality as FlashVSROutputQuality,
			output_write_mode: settings.flashvsrOutputWriteMode as FlashVSRWriteMode,
			seed: settings.flashvsrSeed ?? undefined,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video upscaled with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `FlashVSR upscale failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Handle Topaz Video Upscale (fal-ai/topaz/upscale/video).
 */
export async function handleTopazUpscale(
	ctx: ModelHandlerContext,
	settings: UpscaleSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideoFile && !settings.sourceVideoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video source required",
		};
	}

	let videoUrl: string | undefined = settings.sourceVideoUrl ?? undefined;

	if (settings.sourceVideoFile) {
		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Uploading video for ${ctx.modelName}...`,
		});

		try {
			videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideoFile);
		} catch (error) {
			return {
				response: undefined,
				shouldSkip: true,
				skipReason: `Failed to upload video: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	if (!videoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Video URL could not be determined",
		};
	}

	ctx.progressCallback({
		status: "processing",
		progress: 30,
		message: `Upscaling with Topaz (${settings.topazUpscaleFactor}x)...`,
	});

	try {
		const response = await upscaleTopazVideo({
			video_url: videoUrl,
			upscale_factor: settings.topazUpscaleFactor,
			target_fps:
				settings.topazTargetFPS === "interpolated"
					? TOPAZ_INTERPOLATED_FPS
					: undefined,
			h264_output: settings.topazH264Output,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video upscaled with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `Topaz upscale failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}
