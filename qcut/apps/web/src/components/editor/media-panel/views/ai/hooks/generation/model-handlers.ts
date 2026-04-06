/**
 * Model-specific Generation Handlers
 *
 * Public surface: types, constants, and router functions.
 * Handler implementations live in handlers/*-handlers.ts.
 * Shared types live in model-handler-types.ts.
 */

import {
	handleVeo31FastT2V,
	handleVeo31T2V,
	handleVeo31LiteT2V,
	handleHailuo23T2V,
	handleLTXV2ProT2V,
	handleLTXV2FastT2V,
	handleLTX23ProT2V,
	handleLTX23FastT2V,
	handleViduQ3T2V,
	handleWAN26T2V,
	handleGenericT2V,
} from "./handlers/text-to-video-handlers";
import {
	handleVeo31FastI2V,
	handleVeo31I2V,
	handleVeo31FastF2V,
	handleVeo31F2V,
	handleVeo31LiteI2V,
	handleVeo31LiteF2V,
	handleViduQ2I2V,
	handleLTXV2I2V,
	handleLTXV2FastI2V,
	handleLTX23FastI2V,
	handleSeedanceProFastI2V,
	handleSeedanceProI2V,
	handleKlingV25I2V,
	handleKlingV26I2V,
} from "./handlers/image-to-video-handlers";
import {
	handleWAN25I2V,
	handleWAN26I2V,
	handleViduQ3I2V,
	handlePixverseV6I2V,
	handleGenericI2V,
} from "./handlers/image-to-video-handlers-ext";
import {
	handleByteDanceUpscale,
	handleFlashVSRUpscale,
} from "./handlers/upscale-handlers";
import {
	handleKlingO1Ref2Video,
	handleGrokImagineR2V,
	handleWAN26Ref2Video,
	handleKlingO1V2V,
	handleKlingAvatarV2,
	handleGenericAvatar,
	handleSyncLipsyncReact1,
	handleVeo31FastExtendVideo,
	handleVeo31ExtendVideo,
} from "./handlers/avatar-handlers";
export type {
	AvatarSettings,
	ImageToVideoSettings,
	ModelHandlerContext,
	ModelHandlerResult,
	TextToVideoSettings,
	UpscaleSettings,
} from "./model-handler-types";
import type {
	AvatarSettings,
	ImageToVideoSettings,
	ModelHandlerContext,
	ModelHandlerResult,
	TextToVideoSettings,
	UpscaleSettings,
} from "./model-handler-types";
import { enforceCreditRequirement } from "@/lib/license/credit-guard";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Frame-to-video model IDs */
export const VEO31_FRAME_MODELS = new Set([
	"veo31_fast_frame_to_video",
	"veo31_frame_to_video",
	"veo31_lite_frame_to_video",
]);

/** Parse Veo duration string to seconds. */
function parseVeoDuration({
	duration,
}: {
	duration: "4s" | "6s" | "8s";
}): number {
	return Number.parseInt(duration.replace("s", ""), 10);
}

/** Get duration in seconds for a text-to-video model. */
function getTextToVideoDurationSeconds({
	modelId,
	settings,
}: {
	modelId: string;
	settings: TextToVideoSettings;
}): number | undefined {
	if (
		modelId === "veo31_fast_text_to_video" ||
		modelId === "veo31_text_to_video" ||
		modelId === "veo31_lite_text_to_video"
	) {
		return parseVeoDuration({ duration: settings.veo31Settings.duration });
	}
	if (modelId === "hailuo23_standard_t2v" || modelId === "hailuo23_pro_t2v") {
		return settings.hailuoT2VDuration;
	}
	if (modelId === "ltxv2_pro_t2v") {
		return settings.ltxv2Duration;
	}
	if (modelId === "ltxv2_fast_t2v") {
		return settings.ltxv2FastDuration;
	}
	if (modelId === "ltx23_pro_t2v") {
		return settings.ltx23Duration;
	}
	if (modelId === "ltx23_fast_t2v") {
		return settings.ltx23FastDuration;
	}
	if (modelId === "wan_26_t2v") {
		return settings.wan26T2VDuration;
	}
	return settings.duration;
}

/** Get duration in seconds for an image-to-video model. */
function getImageToVideoDurationSeconds({
	modelId,
	settings,
}: {
	modelId: string;
	settings: ImageToVideoSettings;
}): number | undefined {
	if (
		modelId === "veo31_fast_image_to_video" ||
		modelId === "veo31_image_to_video" ||
		modelId === "veo31_lite_image_to_video" ||
		modelId === "veo31_fast_frame_to_video" ||
		modelId === "veo31_frame_to_video" ||
		modelId === "veo31_lite_frame_to_video"
	) {
		return parseVeoDuration({ duration: settings.veo31Settings.duration });
	}
	if (modelId === "vidu_q2_turbo_i2v") {
		return settings.viduQ2Duration;
	}
	if (modelId === "ltxv2_i2v") {
		return settings.ltxv2I2VDuration;
	}
	if (modelId === "ltxv2_fast_i2v") {
		return settings.ltxv2ImageDuration;
	}
	if (modelId === "ltx23_fast_i2v") {
		return settings.ltx23I2VDuration;
	}
	if (modelId === "seedance_pro_fast_i2v" || modelId === "seedance_pro_i2v") {
		return settings.seedanceDuration;
	}
	if (modelId === "kling_v2_5_turbo_i2v") {
		return settings.klingDuration;
	}
	if (
		modelId === "kling_v26_pro_i2v" ||
		modelId === "kling_v3_pro_i2v" ||
		modelId === "kling_v3_standard_i2v"
	) {
		return settings.kling26Duration;
	}
	if (modelId === "wan_25_preview_i2v") {
		return settings.wan25Duration;
	}
	if (modelId === "wan_26_i2v") {
		return settings.wan26Duration;
	}
	if (modelId === "pixverse_v6_i2v") {
		return (settings.duration as number) ?? 5;
	}
	return settings.duration;
}

/** Get duration in seconds for an avatar model. */
function getAvatarDurationSeconds({
	modelId,
	settings,
}: {
	modelId: string;
	settings: AvatarSettings;
}): number | undefined {
	if (modelId === "wan_26_ref2v") {
		return settings.wan26RefDuration;
	}
	if (modelId === "grok_imagine_r2v") {
		return settings.grokR2vDuration ?? 8;
	}
	return settings.videoDuration ?? settings.audioDuration ?? undefined;
}

/** Verify the user has sufficient credits for generation. */
async function ensureGenerationCredits({
	modelId,
	modelName,
	durationSeconds,
}: {
	modelId: string;
	modelName: string;
	durationSeconds?: number;
}): Promise<ModelHandlerResult | null> {
	const creditResult = await enforceCreditRequirement({
		modelId,
		durationSeconds,
		description: `${modelName} generation`,
	});
	if (creditResult.allowed) {
		return null;
	}

	return {
		response: undefined,
		shouldSkip: true,
		skipReason:
			creditResult.reason ??
			`Insufficient credits for ${modelName}. Required: ${creditResult.requiredCredits}.`,
	};
}

// ============================================================================
// MODEL ROUTING
// ============================================================================

/**
 * Routes text-to-video generation to the appropriate handler
 */
export async function routeTextToVideoHandler(
	ctx: ModelHandlerContext,
	settings: TextToVideoSettings
): Promise<ModelHandlerResult> {
	const creditFailure = await ensureGenerationCredits({
		modelId: ctx.modelId,
		modelName: ctx.modelName,
		durationSeconds: getTextToVideoDurationSeconds({
			modelId: ctx.modelId,
			settings,
		}),
	});
	if (creditFailure) {
		return creditFailure;
	}

	switch (ctx.modelId) {
		case "veo31_fast_text_to_video":
			return handleVeo31FastT2V(ctx, settings);
		case "veo31_text_to_video":
			return handleVeo31T2V(ctx, settings);
		case "veo31_lite_text_to_video":
			return handleVeo31LiteT2V(ctx, settings);
		case "hailuo23_standard_t2v":
		case "hailuo23_pro_t2v":
			return handleHailuo23T2V(ctx, settings);
		case "ltxv2_pro_t2v":
			return handleLTXV2ProT2V(ctx, settings);
		case "ltxv2_fast_t2v":
			return handleLTXV2FastT2V(ctx, settings);
		case "ltx23_pro_t2v":
			return handleLTX23ProT2V(ctx, settings);
		case "ltx23_fast_t2v":
			return handleLTX23FastT2V(ctx, settings);
		case "wan_26_t2v":
			return handleWAN26T2V(ctx, settings);
		case "vidu_q3_t2v":
			return handleViduQ3T2V(ctx, settings);
		default:
			return handleGenericT2V(ctx, settings);
	}
}

/**
 * Routes image-to-video generation to the appropriate handler
 */
export async function routeImageToVideoHandler(
	ctx: ModelHandlerContext,
	settings: ImageToVideoSettings
): Promise<ModelHandlerResult> {
	const creditFailure = await ensureGenerationCredits({
		modelId: ctx.modelId,
		modelName: ctx.modelName,
		durationSeconds: getImageToVideoDurationSeconds({
			modelId: ctx.modelId,
			settings,
		}),
	});
	if (creditFailure) {
		return creditFailure;
	}

	switch (ctx.modelId) {
		case "veo31_fast_image_to_video":
			return handleVeo31FastI2V(ctx, settings);
		case "veo31_image_to_video":
			return handleVeo31I2V(ctx, settings);
		case "veo31_fast_frame_to_video":
			return handleVeo31FastF2V(ctx, settings);
		case "veo31_frame_to_video":
			return handleVeo31F2V(ctx, settings);
		case "veo31_lite_image_to_video":
			return handleVeo31LiteI2V(ctx, settings);
		case "veo31_lite_frame_to_video":
			return handleVeo31LiteF2V(ctx, settings);
		case "vidu_q2_turbo_i2v":
			return handleViduQ2I2V(ctx, settings);
		case "vidu_q3_i2v":
			return handleViduQ3I2V(ctx, settings);
		case "ltxv2_i2v":
			return handleLTXV2I2V(ctx, settings);
		case "ltxv2_fast_i2v":
			return handleLTXV2FastI2V(ctx, settings);
		case "ltx23_fast_i2v":
			return handleLTX23FastI2V(ctx, settings);
		case "seedance_pro_fast_i2v":
			return handleSeedanceProFastI2V(ctx, settings);
		case "seedance_pro_i2v":
			return handleSeedanceProI2V(ctx, settings);
		case "kling_v2_5_turbo_i2v":
			return handleKlingV25I2V(ctx, settings);
		case "kling_v26_pro_i2v":
		case "kling_v3_pro_i2v":
		case "kling_v3_standard_i2v":
			return handleKlingV26I2V(ctx, settings);
		case "wan_25_preview_i2v":
			return handleWAN25I2V(ctx, settings);
		case "wan_26_i2v":
			return handleWAN26I2V(ctx, settings);
		case "pixverse_v6_i2v":
			return handlePixverseV6I2V(ctx, settings);
		default:
			if (
				VEO31_FRAME_MODELS.has(ctx.modelId) &&
				(!settings.firstFrame || !settings.lastFrame)
			) {
				return {
					response: undefined,
					shouldSkip: true,
					skipReason: "frame-to-video requires selected first and last frames",
				};
			}
			return handleGenericI2V(ctx, settings);
	}
}

/**
 * Routes upscale generation to the appropriate handler
 */
export async function routeUpscaleHandler(
	ctx: ModelHandlerContext,
	settings: UpscaleSettings
): Promise<ModelHandlerResult> {
	const creditFailure = await ensureGenerationCredits({
		modelId: ctx.modelId,
		modelName: ctx.modelName,
	});
	if (creditFailure) {
		return creditFailure;
	}

	switch (ctx.modelId) {
		case "bytedance_video_upscaler":
			return handleByteDanceUpscale(ctx, settings);
		case "flashvsr_video_upscaler":
			return handleFlashVSRUpscale(ctx, settings);
		case "topaz_video_upscale":
			throw new Error("Topaz Video Upscale not yet implemented");
		default:
			return {
				response: undefined,
				shouldSkip: true,
				skipReason: `Unknown upscale model: ${ctx.modelId}`,
			};
	}
}

/**
 * Routes avatar generation to the appropriate handler
 */
export async function routeAvatarHandler(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	const creditFailure = await ensureGenerationCredits({
		modelId: ctx.modelId,
		modelName: ctx.modelName,
		durationSeconds: getAvatarDurationSeconds({
			modelId: ctx.modelId,
			settings,
		}),
	});
	if (creditFailure) {
		return creditFailure;
	}

	switch (ctx.modelId) {
		case "kling_o1_ref2video":
			return handleKlingO1Ref2Video(ctx, settings);
		case "grok_imagine_r2v":
			return handleGrokImagineR2V(ctx, settings);
		case "wan_26_ref2v":
			return handleWAN26Ref2Video(ctx, settings);
		case "kling_o1_v2v_reference":
		case "kling_o1_v2v_edit":
			return handleKlingO1V2V(ctx, settings);
		case "kling_avatar_v2_standard":
		case "kling_avatar_v2_pro":
			return handleKlingAvatarV2(ctx, settings);
		case "sync_lipsync_react1":
			return handleSyncLipsyncReact1(ctx, settings);
		case "veo31_fast_extend_video":
			return handleVeo31FastExtendVideo(ctx, settings);
		case "veo31_extend_video":
			return handleVeo31ExtendVideo(ctx, settings);
		default:
			return handleGenericAvatar(ctx, settings);
	}
}
