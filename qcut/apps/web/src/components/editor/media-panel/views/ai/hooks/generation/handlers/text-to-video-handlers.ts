/**
 * Split from model-handler-implementations.ts by handler category.
 */

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import {
	generateVideo,
	generateVideoFromText,
	generateLTXV2Video,
	generateLTX23TextVideo,
	generateViduQ3TextVideo,
	generateWAN26TextVideo,
} from "@/lib/ai-video";
import type {
	ModelHandlerContext,
	ModelHandlerResult,
	TextToVideoSettings,
} from "../model-handler-types";

// These aliases map UI values to generator literal unions.
type LTXV2Duration = 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
type LTXV2Resolution = "1080p" | "1440p" | "2160p";
type LTXV2FPS = 25 | 50;
type HailuoDuration = 6 | 10;
type ViduQ3Duration = 5;
type ViduQ3Resolution = "360p" | "540p" | "720p" | "1080p";
type ViduQ3AspectRatio = "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
type WAN26Duration = 5 | 10 | 15;
type WAN26T2VResolution = "720p" | "1080p";
type WAN26AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type LTX23Duration = 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
type LTX23Resolution = "1080p" | "1440p" | "2160p";
type LTX23FPS = 24 | 25 | 48 | 50;
type LTX23AspectRatio = "16:9" | "9:16";

/** Handle Veo 3.1 Fast text-to-video generation. */
export async function handleVeo31FastT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	try {
		const response = await falAIClient.generateVeo31FastTextToVideo({
			prompt: ctx.prompt,
			aspect_ratio: (() => {
				const ar = settings.veo31Settings.aspectRatio;
				return ar === "auto" ? undefined : ar;
			})(),
			duration: settings.veo31Settings.duration,
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
			enhance_prompt: settings.veo31Settings.enhancePrompt,
			auto_fix: settings.veo31Settings.autoFix,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Veo 3.1 Standard text-to-video generation
 */
export async function handleVeo31T2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	try {
		const response = await falAIClient.generateVeo31TextToVideo({
			prompt: ctx.prompt,
			aspect_ratio: (() => {
				const ar = settings.veo31Settings.aspectRatio;
				return ar === "auto" ? undefined : ar;
			})(),
			duration: settings.veo31Settings.duration,
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
			enhance_prompt: settings.veo31Settings.enhancePrompt,
			auto_fix: settings.veo31Settings.autoFix,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Veo 3.1 Lite text-to-video generation
 */
export async function handleVeo31LiteT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	try {
		const response = await falAIClient.generateVeo31LiteTextToVideo({
			prompt: ctx.prompt,
			aspect_ratio: (() => {
				const ar = settings.veo31Settings.aspectRatio;
				return ar === "auto" || ar === "1:1" ? undefined : ar;
			})(),
			duration: settings.veo31Settings.duration,
			resolution: settings.veo31Settings.resolution,
			generate_audio: true,
			auto_fix: settings.veo31Settings.autoFix,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Hailuo 2.3 text-to-video generation
 */
export async function handleHailuo23T2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateVideoFromText({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.hailuoT2VDuration as HailuoDuration,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video generated with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle LTX Video 2.0 Pro text-to-video generation
 */
export async function handleLTXV2ProT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateLTXV2Video({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.ltxv2Duration as LTXV2Duration,
			resolution: settings.ltxv2Resolution as LTXV2Resolution,
			fps: settings.ltxv2FPS as LTXV2FPS,
			generate_audio: settings.ltxv2GenerateAudio,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video with audio generated using ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle LTX Video 2.0 Fast text-to-video generation
 */
export async function handleLTXV2FastT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateLTXV2Video({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.ltxv2FastDuration as LTXV2Duration,
			resolution: settings.ltxv2FastResolution as LTXV2Resolution,
			fps: settings.ltxv2FastFPS as LTXV2FPS,
			generate_audio: settings.ltxv2FastGenerateAudio,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video with audio generated using ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle LTX Video 2.3 Pro text-to-video generation
 */
export async function handleLTX23ProT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateLTX23TextVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.ltx23Duration as LTX23Duration,
			resolution: settings.ltx23Resolution as LTX23Resolution,
			fps: settings.ltx23FPS as LTX23FPS,
			generate_audio: settings.ltx23GenerateAudio,
			aspect_ratio: settings.ltx23AspectRatio as LTX23AspectRatio,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video with audio generated using ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle LTX Video 2.3 Fast text-to-video generation
 */
export async function handleLTX23FastT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateLTX23TextVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.ltx23FastDuration as LTX23Duration,
			resolution: settings.ltx23FastResolution as LTX23Resolution,
			fps: settings.ltx23FastFPS as LTX23FPS,
			generate_audio: settings.ltx23FastGenerateAudio,
			aspect_ratio: settings.ltx23FastAspectRatio as LTX23AspectRatio,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video with audio generated using ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Vidu Q3 text-to-video generation
 */
export async function handleViduQ3T2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	// Normalize resolution to Vidu Q3 supported values (360p, 540p, 720p, 1080p)
	// "auto" is not supported by Vidu Q3
	const normalizedResolution: ViduQ3Resolution = [
		"360p",
		"540p",
		"720p",
		"1080p",
	].includes(settings.resolution ?? "")
		? (settings.resolution as ViduQ3Resolution)
		: "720p";

	// Normalize aspect ratio to Vidu Q3 supported values (16:9, 9:16, 4:3, 3:4, 1:1)
	// "21:9" is not supported by Vidu Q3
	const normalizedAspectRatio: ViduQ3AspectRatio = [
		"16:9",
		"9:16",
		"4:3",
		"3:4",
		"1:1",
	].includes(settings.aspectRatio ?? "")
		? (settings.aspectRatio as ViduQ3AspectRatio)
		: "16:9";

	try {
		const response = await generateViduQ3TextVideo(
			{
				model: ctx.modelId,
				prompt: ctx.prompt,
				duration: 5 as ViduQ3Duration,
				resolution: normalizedResolution,
				aspect_ratio: normalizedAspectRatio,
				audio: true,
			},
			ctx.progressCallback
		);

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video generated with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle WAN v2.6 text-to-video generation
 */
export async function handleWAN26T2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: `Submitting ${ctx.modelName} request...`,
	});

	try {
		const response = await generateWAN26TextVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			duration: settings.wan26T2VDuration as WAN26Duration,
			resolution: settings.wan26T2VResolution as WAN26T2VResolution,
			aspect_ratio: settings.wan26T2VAspectRatio as WAN26AspectRatio,
			negative_prompt: settings.wan26T2VNegativePrompt || undefined,
			enable_prompt_expansion: settings.wan26T2VEnablePromptExpansion,
			multi_shots: settings.wan26T2VMultiShots,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video generated with ${ctx.modelName}`,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle generic text-to-video generation (fallback)
 */
export async function handleGenericT2V(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	try {
		const response = await generateVideo(
			{
				prompt: ctx.prompt,
				model: ctx.modelId,
				...settings.unifiedParams,
				...(ctx.modelId.startsWith("sora2_") && {
					duration:
						(settings.unifiedParams.duration as number | undefined) ??
						settings.duration,
					aspect_ratio:
						(settings.unifiedParams.aspect_ratio as
							| "16:9"
							| "9:16"
							| "1:1"
							| "4:3"
							| "3:4"
							| "21:9"
							| undefined) ?? settings.aspectRatio,
					resolution:
						(settings.unifiedParams.resolution as
							| "720p"
							| "1080p"
							| "auto"
							| undefined) ?? settings.resolution,
				}),
			},
			ctx.progressCallback
		);
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
