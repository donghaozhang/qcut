/**
 * Split from model-handler-implementations.ts by handler category.
 */

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import {
	generateVideo,
	generateVideoFromImage,
	generateViduQ2Video,
	generateLTXV2ImageVideo,
	generateLTX23ImageVideo,
	generateSeedanceVideo,
	generateKlingImageVideo,
	generateKling26ImageVideo,
	generateWAN25ImageVideo,
	generateWAN26ImageVideo,
	generateViduQ3ImageVideo,
	generatePixverseImageVideo,
} from "@/lib/ai-video";
import type {
	ImageToVideoSettings,
	ModelHandlerContext,
	ModelHandlerResult,
} from "../model-handler-types";

// These aliases map UI values to generator literal unions.
type ViduQ2Duration = 2 | 3 | 4 | 5 | 6 | 7 | 8;
type ViduQ2Resolution = "720p" | "1080p";
type ViduQ2MovementAmplitude = "auto" | "small" | "medium" | "large";
type LTXV2Duration = 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
type LTXV2Resolution = "1080p" | "1440p" | "2160p";
type LTXV2FPS = 25 | 50;
type LTX23Duration = 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
type LTX23Resolution = "1080p" | "1440p" | "2160p";
type LTX23FPS = 24 | 25 | 48 | 50;
type LTX23AspectRatio = "16:9" | "9:16" | "auto";
type SeedanceDuration = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type SeedanceResolution = "480p" | "720p" | "1080p";
type SeedanceAspectRatio =
	| "16:9"
	| "9:16"
	| "1:1"
	| "4:3"
	| "3:4"
	| "21:9"
	| "auto";
type KlingDuration = 5 | 10;
type KlingAspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type WAN25Duration = 5 | 10;
type WAN25Resolution = "480p" | "720p" | "1080p";
type WAN26Duration = 5 | 10 | 15;
type WAN26Resolution = "720p" | "1080p";
type WAN26AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type ViduQ3Duration = 5;
type ViduQ3Resolution = "360p" | "540p" | "720p" | "1080p";

export async function handleVeo31FastI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "image-to-video requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const imageAspectRatio =
			settings.veo31Settings.aspectRatio === "16:9" ||
			settings.veo31Settings.aspectRatio === "9:16"
				? settings.veo31Settings.aspectRatio
				: "16:9";

		const response = await falAIClient.generateVeo31FastImageToVideo({
			prompt: ctx.prompt,
			image_url: imageUrl,
			aspect_ratio: imageAspectRatio,
			duration: "8s",
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
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
 * Handle Veo 3.1 Standard image-to-video generation
 */
export async function handleVeo31I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "image-to-video requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const imageAspectRatio =
			settings.veo31Settings.aspectRatio === "16:9" ||
			settings.veo31Settings.aspectRatio === "9:16"
				? settings.veo31Settings.aspectRatio
				: "16:9";

		const response = await falAIClient.generateVeo31ImageToVideo({
			prompt: ctx.prompt,
			image_url: imageUrl,
			aspect_ratio: imageAspectRatio,
			duration: "8s",
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
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
 * Handle Veo 3.1 Fast frame-to-video generation
 */
export async function handleVeo31FastF2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.firstFrame || !settings.lastFrame) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "frame-to-video requires selected first and last frames",
		};
	}

	try {
		const firstFrameUrl = await settings.uploadImageToFal(settings.firstFrame);
		const lastFrameUrl = await settings.uploadImageToFal(settings.lastFrame);
		const frameAspectRatio =
			settings.veo31Settings.aspectRatio === "16:9" ||
			settings.veo31Settings.aspectRatio === "9:16"
				? settings.veo31Settings.aspectRatio
				: "16:9";

		const response = await falAIClient.generateVeo31FastFrameToVideo({
			prompt: ctx.prompt,
			first_frame_url: firstFrameUrl,
			last_frame_url: lastFrameUrl,
			aspect_ratio: frameAspectRatio,
			duration: "8s",
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
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
 * Handle Veo 3.1 Standard frame-to-video generation
 */
export async function handleVeo31F2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.firstFrame || !settings.lastFrame) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "frame-to-video requires selected first and last frames",
		};
	}

	try {
		const firstFrameUrl = await settings.uploadImageToFal(settings.firstFrame);
		const lastFrameUrl = await settings.uploadImageToFal(settings.lastFrame);
		const frameAspectRatio =
			settings.veo31Settings.aspectRatio === "16:9" ||
			settings.veo31Settings.aspectRatio === "9:16"
				? settings.veo31Settings.aspectRatio
				: "16:9";

		const response = await falAIClient.generateVeo31FrameToVideo({
			prompt: ctx.prompt,
			first_frame_url: firstFrameUrl,
			last_frame_url: lastFrameUrl,
			aspect_ratio: frameAspectRatio,
			duration: "8s",
			resolution: settings.veo31Settings.resolution,
			generate_audio: settings.veo31Settings.generateAudio,
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
 * Handle Vidu Q2 Turbo image-to-video generation
 */
export async function handleViduQ2I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Vidu Q2 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateViduQ2Video({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.viduQ2Duration as ViduQ2Duration,
			resolution: settings.viduQ2Resolution as ViduQ2Resolution,
			movement_amplitude:
				settings.viduQ2MovementAmplitude as ViduQ2MovementAmplitude,
			bgm: settings.viduQ2EnableBGM,
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
 * Handle LTX V2 Standard image-to-video generation
 */
export async function handleLTXV2I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "LTX V2 standard requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateLTXV2ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.ltxv2I2VDuration as LTXV2Duration,
			resolution: settings.ltxv2I2VResolution as LTXV2Resolution,
			fps: settings.ltxv2I2VFPS as LTXV2FPS,
			generate_audio: settings.ltxv2I2VGenerateAudio,
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
 * Handle LTX V2 Fast image-to-video generation
 */
export async function handleLTXV2FastI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "LTX V2 Fast requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateLTXV2ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.ltxv2ImageDuration as LTXV2Duration,
			resolution: settings.ltxv2ImageResolution as LTXV2Resolution,
			fps: settings.ltxv2ImageFPS as LTXV2FPS,
			generate_audio: settings.ltxv2ImageGenerateAudio,
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
 * Handle LTX Video 2.3 Fast image-to-video generation
 */
export async function handleLTX23FastI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "LTX 2.3 Fast I2V requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		let endImageUrl: string | undefined;
		if (settings.ltx23I2VEndImageFile) {
			endImageUrl = await settings.uploadImageToFal(
				settings.ltx23I2VEndImageFile
			);
		} else if (settings.ltx23I2VEndImageUrl) {
			endImageUrl = settings.ltx23I2VEndImageUrl;
		}

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateLTX23ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			end_image_url: endImageUrl,
			duration: settings.ltx23I2VDuration as LTX23Duration,
			resolution: settings.ltx23I2VResolution as LTX23Resolution,
			fps: settings.ltx23I2VFPS as LTX23FPS,
			generate_audio: settings.ltx23I2VGenerateAudio,
			aspect_ratio: settings.ltx23I2VAspectRatio as LTX23AspectRatio,
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
 * Handle Seedance Pro Fast image-to-video generation
 */
export async function handleSeedanceProFastI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Seedance Pro Fast requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateSeedanceVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.seedanceDuration as SeedanceDuration,
			resolution: settings.seedanceResolution as SeedanceResolution,
			aspect_ratio: settings.seedanceAspectRatio as SeedanceAspectRatio,
			camera_fixed: settings.seedanceCameraFixed,
			seed: settings.imageSeed ?? undefined,
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
 * Handle Seedance Pro image-to-video generation (with optional end frame)
 */
export async function handleSeedanceProI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Seedance Pro requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const endFrameUrl = settings.seedanceEndFrameFile
			? await settings.uploadImageToFal(settings.seedanceEndFrameFile)
			: settings.seedanceEndFrameUrl;

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateSeedanceVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.seedanceDuration as SeedanceDuration,
			resolution: settings.seedanceResolution as SeedanceResolution,
			aspect_ratio: settings.seedanceAspectRatio as SeedanceAspectRatio,
			camera_fixed: settings.seedanceCameraFixed,
			end_image_url: endFrameUrl ?? undefined,
			seed: settings.imageSeed ?? undefined,
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
 * Handle Kling v2.5 Turbo image-to-video generation
 */
export async function handleKlingV25I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Kling v2.5 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateKlingImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.klingDuration as KlingDuration,
			cfg_scale: settings.klingCfgScale,
			aspect_ratio: settings.klingAspectRatio as KlingAspectRatio,
			enhance_prompt: settings.klingEnhancePrompt,
			negative_prompt: settings.klingNegativePrompt,
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
 * Handle Kling v2.6 Pro image-to-video generation
 */
export async function handleKlingV26I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Kling v2.6 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateKling26ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.kling26Duration as KlingDuration,
			generate_audio: settings.kling26GenerateAudio,
			negative_prompt: settings.kling26NegativePrompt,
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
 * Handle WAN 2.5 Preview image-to-video generation
 */
export async function handleWAN25I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "WAN 2.5 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const audioUrl = settings.wan25AudioFile
			? await settings.uploadAudioToFal(settings.wan25AudioFile)
			: settings.wan25AudioUrl;

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateWAN25ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.wan25Duration as WAN25Duration,
			resolution: settings.wan25Resolution as WAN25Resolution,
			audio_url: audioUrl ?? undefined,
			negative_prompt: settings.wan25NegativePrompt,
			enable_prompt_expansion: settings.wan25EnablePromptExpansion,
			seed: settings.imageSeed ?? undefined,
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
 * Handle WAN v2.6 image-to-video generation
 */
export async function handleWAN26I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "WAN v2.6 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const audioUrl = settings.wan26AudioFile
			? await settings.uploadAudioToFal(settings.wan26AudioFile)
			: settings.wan26AudioUrl;

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateWAN26ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.wan26Duration as WAN26Duration,
			resolution: settings.wan26Resolution as WAN26Resolution,
			aspect_ratio: settings.wan26AspectRatio as WAN26AspectRatio,
			audio_url: audioUrl ?? undefined,
			negative_prompt: settings.wan26NegativePrompt,
			enable_prompt_expansion: settings.wan26EnablePromptExpansion,
			seed: settings.imageSeed ?? undefined,
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
 * Handle Vidu Q3 image-to-video generation
 */
export async function handleViduQ3I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Vidu Q3 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

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

		const response = await generateViduQ3ImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: 5 as ViduQ3Duration,
			resolution: normalizedResolution,
			audio: true,
			seed: settings.imageSeed ?? undefined,
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
 * Handle PixVerse v6 image-to-video generation
 */
export async function handlePixverseV6I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "PixVerse v6 requires a selected image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generatePixverseImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: (settings.duration as number) ?? 5,
			resolution:
				(settings.resolution as
					| "360p"
					| "540p"
					| "720p"
					| "1080p"
					| undefined) ?? "720p",
			seed: settings.imageSeed ?? undefined,
			generate_audio_switch: settings.generateAudio,
			thinking_type: "auto",
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
 * Handle generic image-to-video generation (fallback)
 */
export async function handleGenericI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "image-to-video requires a selected image",
		};
	}

	try {
		const response = await generateVideoFromImage({
			image: settings.selectedImage,
			prompt: ctx.prompt,
			model: ctx.modelId,
			...(ctx.modelId.startsWith("sora2_") && {
				duration: settings.duration,
				aspect_ratio: settings.aspectRatio,
				resolution: settings.resolution,
			}),
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
