/**
 * Split from model-handler-implementations.ts by handler category.
 */

import { falAIClient } from "@/lib/ai-clients/fal-ai-client";
import { debugLogger } from "@/lib/debug/debug-logger";
import {
	generateAvatarVideo,
	generateKlingO1Video,
	generateWAN26RefVideo,
} from "@/lib/ai-video";
import type {
	AvatarSettings,
	ModelHandlerContext,
	ModelHandlerResult,
} from "../model-handler-types";

/** Handle Kling O1 reference-to-video avatar generation. */
export async function handleKlingO1Ref2Video(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	const firstRefImage = settings.referenceImages?.find((img) => img != null);
	if (!firstRefImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Reference-to-video requires at least one reference image",
		};
	}

	try {
		debugLogger.log("model-handlers", "AVATAR_GENERATE_START", {
			modelId: ctx.modelId,
			hasReferenceImage: true,
		});
		const response = await generateAvatarVideo({
			model: ctx.modelId,
			characterImage: firstRefImage,
			prompt: ctx.prompt || undefined,
		});
		debugLogger.log("model-handlers", "AVATAR_GENERATE_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Grok Imagine Reference-to-Video generation
 *
 * Supports up to 7 reference images uploaded to FAL storage.
 */
export async function handleGrokImagineR2V(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	const refImages = settings.referenceImages?.filter(
		(img): img is File => img != null
	);
	if (!refImages?.length) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason:
				"Grok Imagine Reference-to-Video requires at least one reference image",
		};
	}

	try {
		debugLogger.log("model-handlers", "GROK_R2V_START", {
			modelId: ctx.modelId,
			referenceImageCount: refImages.length,
		});

		// Upload all reference images to FAL storage in parallel
		const referenceImageUrls = await Promise.all(
			refImages.slice(0, 7).map((img) => settings.uploadImageToFal(img))
		);

		const response = await generateAvatarVideo({
			model: ctx.modelId,
			referenceImageUrls,
			prompt: ctx.prompt || undefined,
			duration: settings.grokR2vDuration ?? 8,
			resolution: settings.grokR2vResolution ?? "480p",
		});

		debugLogger.log("model-handlers", "GROK_R2V_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle WAN v2.6 Reference-to-Video generation
 *
 * Uses a reference video to guide motion/style for the generated video.
 */
export async function handleWAN26Ref2Video(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideo) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "WAN v2.6 Ref2Video requires a reference video",
		};
	}

	try {
		// Upload the reference video via falAIClient (handles API key + Electron IPC internally)
		const referenceVideoUrl = await falAIClient.uploadVideoToFal(
			settings.sourceVideo
		);

		debugLogger.log("model-handlers", "WAN26_REF_VIDEO_START", {
			modelId: ctx.modelId,
		});
		const response = await generateWAN26RefVideo({
			model: ctx.modelId,
			prompt: ctx.prompt,
			reference_video_url: referenceVideoUrl,
			duration: settings.wan26RefDuration ?? 5,
			resolution: settings.wan26RefResolution ?? "1080p",
			aspect_ratio: settings.wan26RefAspectRatio ?? "16:9",
			negative_prompt: settings.wan26RefNegativePrompt,
			enable_prompt_expansion: settings.wan26RefEnablePromptExpansion ?? true,
			seed: settings.wan26RefSeed,
			enable_safety_checker: settings.wan26RefEnableSafetyChecker,
		});
		debugLogger.log("model-handlers", "WAN26_REF_VIDEO_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Kling O1 V2V (Video-to-Video) generation
 */
export async function handleKlingO1V2V(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideo) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "V2V model requires source video",
		};
	}

	try {
		debugLogger.log("model-handlers", "KLING_O1_V2V_START", {
			modelId: ctx.modelId,
			hasSourceVideo: true,
		});
		const response = await generateKlingO1Video({
			model: ctx.modelId,
			prompt: ctx.prompt,
			sourceVideo: settings.sourceVideo,
			duration: 5,
		});
		debugLogger.log("model-handlers", "KLING_O1_V2V_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});

		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Kling Avatar v2 generation
 */
export async function handleKlingAvatarV2(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.avatarImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Avatar model requires avatar image",
		};
	}

	if (!settings.audioFile) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Audio file is required for Kling Avatar v2",
		};
	}

	try {
		debugLogger.log("model-handlers", "KLING_AVATAR_V2_START", {
			modelId: ctx.modelId,
			hasAudioFile: !!settings.audioFile,
		});

		const [characterImageUrl, audioUrl] = await Promise.all([
			settings.uploadImageToFal(settings.avatarImage),
			settings.uploadAudioToFal(settings.audioFile),
		]);

		debugLogger.log("model-handlers", "KLING_AVATAR_V2_FILES_UPLOADED", {
			modelId: ctx.modelId,
		});

		const response = await generateAvatarVideo({
			model: ctx.modelId,
			characterImage: settings.avatarImage,
			audioFile: settings.audioFile || undefined,
			prompt: settings.klingAvatarV2Prompt.trim() || undefined,
			audioDuration: settings.audioDuration ?? undefined,
			characterImageUrl,
			audioUrl,
		});

		debugLogger.log("model-handlers", "KLING_AVATAR_V2_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle generic avatar generation (fallback for other avatar models)
 */
export async function handleGenericAvatar(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.avatarImage) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Avatar model requires avatar image",
		};
	}

	try {
		debugLogger.log("model-handlers", "GENERIC_AVATAR_START", {
			modelId: ctx.modelId,
		});

		const response = await generateAvatarVideo({
			model: ctx.modelId,
			characterImage: settings.avatarImage,
			audioFile: settings.audioFile || undefined,
			sourceVideo: settings.sourceVideo || undefined,
			prompt: ctx.prompt || undefined,
			audioDuration: settings.audioDuration ?? undefined,
		});

		debugLogger.log("model-handlers", "GENERIC_AVATAR_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Sync Lipsync React-1 generation
 * Emotion-aware lip-sync with video and audio inputs
 */
export async function handleSyncLipsyncReact1(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideo) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Sync Lipsync React-1 requires a source video",
		};
	}

	if (!settings.audioFile) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Sync Lipsync React-1 requires an audio file",
		};
	}

	debugLogger.log("model-handlers", "SYNC_LIPSYNC_START", {
		modelId: ctx.modelId,
	});

	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: "Uploading video and audio files...",
	});

	try {
		// Upload video and audio to FAL storage using falAIClient
		const [videoUrl, audioUrl] = await Promise.all([
			falAIClient.uploadVideoToFal(settings.sourceVideo),
			falAIClient.uploadAudioToFal(settings.audioFile),
		]);

		debugLogger.log("model-handlers", "SYNC_LIPSYNC_FILES_UPLOADED", {
			modelId: ctx.modelId,
		});

		ctx.progressCallback({
			status: "processing",
			progress: 30,
			message: "Generating lip-synced video...",
		});

		const response = await generateAvatarVideo({
			model: ctx.modelId,
			videoUrl,
			audioUrl,
			videoDuration: settings.videoDuration ?? undefined,
			audioDuration: settings.audioDuration ?? undefined,
			emotion: settings.syncLipsyncEmotion,
			modelMode: settings.syncLipsyncModelMode,
			lipsyncMode: settings.syncLipsyncLipsyncMode,
			temperature: settings.syncLipsyncTemperature,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Lip-synced video generated with ${ctx.modelName}`,
		});

		debugLogger.log("model-handlers", "SYNC_LIPSYNC_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Veo 3.1 Fast Extend-Video generation
 * Extends an existing video by 7 seconds
 */
export async function handleVeo31FastExtendVideo(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideo) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Veo 3.1 Fast Extend requires a source video",
		};
	}

	debugLogger.log("model-handlers", "VEO31_FAST_EXTEND_START", {
		modelId: ctx.modelId,
	});

	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: "Uploading source video...",
	});

	try {
		const videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideo);

		debugLogger.log("model-handlers", "VEO31_FAST_EXTEND_VIDEO_UPLOADED", {
			modelId: ctx.modelId,
		});

		ctx.progressCallback({
			status: "processing",
			progress: 30,
			message: "Extending video with Veo 3.1 Fast...",
		});

		const response = await falAIClient.generateVeo31FastExtendVideo({
			prompt: ctx.prompt,
			video_url: videoUrl,
			aspect_ratio: settings.extendVideoAspectRatio ?? "auto",
			duration: "7s",
			resolution: "720p",
			generate_audio: settings.extendVideoGenerateAudio ?? true,
			auto_fix: false,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video extended with ${ctx.modelName}`,
		});

		debugLogger.log("model-handlers", "VEO31_FAST_EXTEND_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

/**
 * Handle Veo 3.1 Standard Extend-Video generation
 * Extends an existing video by 7 seconds with premium quality
 */
export async function handleVeo31ExtendVideo(
	ctx: ModelHandlerContext,
	settings: AvatarSettings
): Promise<ModelHandlerResult> {
	if (!settings.sourceVideo) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: "Veo 3.1 Extend requires a source video",
		};
	}

	debugLogger.log("model-handlers", "VEO31_EXTEND_START", {
		modelId: ctx.modelId,
	});

	ctx.progressCallback({
		status: "processing",
		progress: 10,
		message: "Uploading source video...",
	});

	try {
		const videoUrl = await falAIClient.uploadVideoToFal(settings.sourceVideo);

		debugLogger.log("model-handlers", "VEO31_EXTEND_VIDEO_UPLOADED", {
			modelId: ctx.modelId,
		});

		ctx.progressCallback({
			status: "processing",
			progress: 30,
			message: "Extending video with Veo 3.1...",
		});

		const response = await falAIClient.generateVeo31ExtendVideo({
			prompt: ctx.prompt,
			video_url: videoUrl,
			aspect_ratio: settings.extendVideoAspectRatio ?? "auto",
			duration: "7s",
			resolution: "720p",
			generate_audio: settings.extendVideoGenerateAudio ?? true,
			auto_fix: false,
		});

		ctx.progressCallback({
			status: "completed",
			progress: 100,
			message: `Video extended with ${ctx.modelName}`,
		});

		debugLogger.log("model-handlers", "VEO31_EXTEND_COMPLETE", {
			modelId: ctx.modelId,
			hasResponse: !!response,
		});
		return { response };
	} catch (error) {
		return {
			response: undefined,
			shouldSkip: true,
			skipReason: `${ctx.modelName} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
