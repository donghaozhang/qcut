/**
 * GMI Cloud image-to-video handlers.
 *
 * Split from image-to-video-handlers.ts to stay under the 800-line limit.
 */

import {
	generateGmiVeoLiteImageVideo,
	generateSkyreelsV4ImageVideo,
	generateKlingV3GmiImageVideo,
	generateKlingOmniImageVideo,
	generateKlingMotionControlVideo,
} from "@/lib/ai-video";
import type {
	ImageToVideoSettings,
	ModelHandlerContext,
	ModelHandlerResult,
} from "../model-handler-types";

/** Handle GMI Veo 3.1 Lite image-to-video generation. */
export async function handleGmiVeoLiteI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Veo 3.1 Lite I2V requires a source image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);
		const durationSeconds = [4, 6, 8].includes(settings.duration ?? 8)
			? ((settings.duration ?? 8) as 4 | 6 | 8)
			: 8;
		const aspectRatio =
			settings.aspectRatio === "16:9" || settings.aspectRatio === "9:16"
				? settings.aspectRatio
				: "16:9";

		const response = await generateGmiVeoLiteImageVideo({
			prompt: ctx.prompt,
			imageUrl,
			durationSeconds,
			aspectRatio,
			generateAudio: true,
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

/** Handle GMI SkyReels V4 image-to-video generation. */
export async function handleSkyreelsV4I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "SkyReels V4 I2V requires a source image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		const response = await generateSkyreelsV4ImageVideo({
			prompt: ctx.prompt,
			imageUrl,
			duration: settings.duration ?? 5,
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

/** Handle GMI Kling V3 image-to-video generation. */
export async function handleGmiKlingV3I2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Kling V3 I2V requires a source image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		const response = await generateKlingV3GmiImageVideo({
			prompt: ctx.prompt,
			imageUrl,
			negative_prompt: settings.klingNegativePrompt,
			duration: String(settings.duration ?? 5),
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

/** Handle GMI Kling V3 Omni image-to-video generation. */
export async function handleGmiKlingOmniI2V(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Kling V3 Omni I2V requires a source image",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		const response = await generateKlingOmniImageVideo({
			prompt: ctx.prompt,
			imageUrl,
			mode: (settings.resolution === "720p" ? "std" : "pro") as "std" | "pro",
			duration: String(settings.duration ?? 5),
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

/** Handle GMI Kling 3 Motion Control generation. */
export async function handleGmiKlingMotionControl(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	if (!settings.selectedImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Motion Control requires a character image",
		};
	}

	if (!(settings as unknown as Record<string, unknown>).referenceVideoUrl) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Motion Control requires a reference video",
		};
	}

	try {
		const imageUrl = await settings.uploadImageToFal(settings.selectedImage);

		const response = await generateKlingMotionControlVideo({
			imageUrl,
			videoUrl: (settings as unknown as Record<string, unknown>)
				.referenceVideoUrl as string,
			prompt: ctx.prompt || undefined,
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
