/**
 * Split from model-handler-implementations.ts by handler category.
 */

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import {
	generateVideo,
	generateViduQ2Video,
	generateLTXV2ImageVideo,
	generateLTX23ImageVideo,
	generateSeedanceVideo,
	generateSeedance2Video,
	generateSeedance2RefVideo,
	generateKlingImageVideo,
	generateKling26ImageVideo,
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

/** Handle Veo 3.1 Fast image-to-video generation. */
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
 * Handle Veo 3.1 Lite image-to-video generation
 */
export async function handleVeo31LiteI2V(
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
				: undefined;

		const response = await falAIClient.generateVeo31LiteImageToVideo({
			prompt: ctx.prompt,
			image_url: imageUrl,
			aspect_ratio: imageAspectRatio,
			duration: settings.veo31Settings.duration,
			resolution: settings.veo31Settings.resolution,
			generate_audio: true,
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
 * Handle Veo 3.1 Lite frame-to-video generation
 */
export async function handleVeo31LiteF2V(
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
				: undefined;

		const response = await falAIClient.generateVeo31LiteFrameToVideo({
			prompt: ctx.prompt,
			first_frame_url: firstFrameUrl,
			last_frame_url: lastFrameUrl,
			aspect_ratio: frameAspectRatio,
			duration: "8s",
			resolution: settings.veo31Settings.resolution,
			generate_audio: true,
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
 * Handle Seedance 2.0 image-to-video generation
 */
export async function handleSeedance2I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Seedance 2.0 I2V requires a selected image",
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

		const response = await generateSeedance2Video({
			model: ctx.modelId,
			prompt: ctx.prompt,
			image_url: imageUrl,
			duration: settings.seedanceDuration as SeedanceDuration,
			resolution: settings.seedanceResolution as "720p" | "1080p",
			aspect_ratio: settings.seedanceAspectRatio as
				| "21:9"
				| "16:9"
				| "4:3"
				| "1:1"
				| "3:4"
				| "9:16",
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
 * Handle Seedance 2.0 reference-to-video generation
 */
export async function handleSeedance2Ref2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Seedance 2.0 Ref2V requires a reference image",
		};
	}

	try {
		const referenceImageUrl = await settings.uploadImageToFal(
			settings.selectedImage
		);

		ctx.progressCallback({
			status: "processing",
			progress: 10,
			message: `Submitting ${ctx.modelName} request...`,
		});

		const response = await generateSeedance2RefVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			reference_image_url: referenceImageUrl,
			duration: settings.seedanceDuration as SeedanceDuration,
			resolution: settings.seedanceResolution as "720p" | "1080p",
			aspect_ratio: settings.seedanceAspectRatio as
				| "21:9"
				| "16:9"
				| "4:3"
				| "1:1"
				| "3:4"
				| "9:16",
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
