/**
 * Extended image-to-video handlers split from image-to-video-handlers.ts
 * to stay under the 800-line file limit.
 *
 * Contains: WAN 2.5, WAN 2.6, Vidu Q3, PixVerse v6, and generic fallback handlers.
 */

import {
	generateVideoFromImage,
	generateWAN25ImageVideo,
	generateWAN26ImageVideo,
	generateViduQ3ImageVideo,
	generatePixverseImageVideo,
	generateRunwayImageToVideo,
} from "@/lib/ai-video";
import type {
	ImageToVideoSettings,
	ModelHandlerContext,
	ModelHandlerResult,
} from "../model-handler-types";

// These aliases map UI values to generator literal unions.
type WAN25Duration = 5 | 10;
type WAN25Resolution = "480p" | "720p" | "1080p";
type WAN26Duration = 5 | 10 | 15;
type WAN26Resolution = "720p" | "1080p";
type WAN26AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
type ViduQ3Duration = 5;
type ViduQ3Resolution = "360p" | "540p" | "720p" | "1080p";

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

		const normalizedResolution: "360p" | "540p" | "720p" | "1080p" = [
			"360p",
			"540p",
			"720p",
			"1080p",
		].includes(settings.resolution ?? "")
			? (settings.resolution as "360p" | "540p" | "720p" | "1080p")
			: "720p";

		const response = await generatePixverseImageVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: (settings.duration as number) ?? 5,
			resolution: normalizedResolution,
			seed: settings.imageSeed ?? undefined,
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
