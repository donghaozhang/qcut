/**
 * LTX and Seedance Image-to-Video Generators
 */

import type {
	LTXV2I2VRequest,
	LTX23I2VRequest,
	LTX23A2VRequest,
	SeedanceI2VRequest,
	Seedance2I2VRequest,
	Seedance2Ref2VRequest,
	VideoGenerationResponse,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import {
	ERROR_MESSAGES,
	LTX23_CONFIG,
} from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	generateJobId,
	getFalApiKeyAsync,
	handleFalResponse,
	makeFalRequest,
} from "../core/fal-request";
import {
	isStandardLTXV2ImageModel,
	validateLTXV2FastExtendedConstraints,
	validateLTXV2I2VDuration,
	validateLTXV2I2VResolution,
	validateLTX23Resolution,
	validateLTX23Duration,
	validateLTX23FastExtendedConstraints,
	validateLTX23A2VDuration,
} from "../validation/validators";
import { getModelConfig, withErrorHandling } from "./base-generator";

/**
 * Generate video from image using LTX Video 2.0.
 */
export async function generateLTXV2ImageVideo(
	request: LTXV2I2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate LTX Video 2.0 I2V",
		{ operation: "generateLTXV2ImageVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const isStandardModel = isStandardLTXV2ImageModel(request.model);
			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error(
					isStandardModel
						? "Please enter a prompt describing the desired video motion"
						: "Please enter a text prompt for LTX Video 2.0 Fast image-to-video"
				);
			}

			if (!request.image_url) {
				throw new Error(
					isStandardModel
						? "Image URL is required for LTX Video 2.0 image-to-video generation"
						: "Image is required for LTX Video 2.0 Fast image-to-video generation"
				);
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support image-to-video generation`
				);
			}

			const duration =
				request.duration ??
				(modelConfig.default_params?.duration as number) ??
				6;
			const resolution =
				request.resolution ??
				(modelConfig.default_params?.resolution as string) ??
				"1080p";
			const fps =
				request.fps ?? (modelConfig.default_params?.fps as number) ?? 25;
			const generateAudio = request.generate_audio ?? true;

			validateLTXV2I2VDuration(duration, request.model);
			validateLTXV2I2VResolution(resolution, request.model);

			// Validate extended constraints for Fast variant
			if (!isStandardLTXV2ImageModel(request.model)) {
				validateLTXV2FastExtendedConstraints(
					duration,
					resolution,
					fps,
					ERROR_MESSAGES.LTXV2_I2V_EXTENDED_DURATION_CONSTRAINT
				);
			}

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				resolution,
				fps,
				generate_audio: generateAudio,
				...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio }),
			};

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate LTX Video 2.0 I2V");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: `Video generated successfully with ${request.model}`,
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate video from image using LTX Video 2.3 Fast.
 * Supports end_image_url for transition generation.
 */
export async function generateLTX23ImageVideo(
	request: LTX23I2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate LTX Video 2.3 I2V",
		{ operation: "generateLTX23ImageVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error(ERROR_MESSAGES.LTX23_EMPTY_PROMPT);
			}

			if (!request.image_url) {
				throw new Error(ERROR_MESSAGES.LTX23_I2V_MISSING_IMAGE);
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support image-to-video generation`
				);
			}

			const duration =
				request.duration ??
				(modelConfig.default_params?.duration as number) ??
				6;
			const resolution =
				request.resolution ??
				(modelConfig.default_params?.resolution as string) ??
				"1080p";
			const fps =
				request.fps ?? (modelConfig.default_params?.fps as number) ?? 25;
			const generateAudio = request.generate_audio ?? true;

			validateLTX23Resolution(resolution);
			validateLTX23Duration(duration, request.model);
			validateLTX23FastExtendedConstraints(duration, resolution, fps);

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				resolution,
				fps,
				generate_audio: generateAudio,
				...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio }),
				...(request.end_image_url && {
					end_image_url: request.end_image_url,
				}),
			};

			const jobId = generateJobId();
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate LTX Video 2.3 I2V");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: `Video generated successfully with ${request.model}`,
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate video from audio using LTX Video 2.3.
 * First audio-to-video model in QCut.
 */
export async function generateLTX23AudioVideo(
	request: LTX23A2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate LTX Video 2.3 A2V",
		{ operation: "generateLTX23AudioVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			if (!request.audio_url) {
				throw new Error(ERROR_MESSAGES.LTX23_A2V_MISSING_AUDIO);
			}

			const duration =
				request.duration ?? LTX23_CONFIG.AUDIO_TO_VIDEO.DURATIONS[0];
			validateLTX23A2VDuration(duration);

			if (request.resolution) {
				validateLTX23Resolution(request.resolution);
			}

			const guidanceScale =
				request.guidance_scale ??
				LTX23_CONFIG.AUDIO_TO_VIDEO.DEFAULT_GUIDANCE_SCALE;

			const payload: Record<string, unknown> = {
				audio_url: request.audio_url,
				duration,
				guidance_scale: guidanceScale,
				...(request.prompt && { prompt: request.prompt.trim() }),
				...(request.image_url && { image_url: request.image_url }),
				...(request.resolution && { resolution: request.resolution }),
				...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio }),
				...(request.fps && { fps: request.fps }),
			};

			const jobId = generateJobId();
			const endpoint = LTX23_CONFIG.AUDIO_TO_VIDEO.ENDPOINT;
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate LTX Video 2.3 A2V");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: `Video generated successfully with ${request.model}`,
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate video from image using Seedance models.
 */
export async function generateSeedanceVideo(
	request: SeedanceI2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Seedance video",
		{ operation: "generateSeedanceVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error(
					"Please enter a prompt describing the desired animation"
				);
			}

			if (!request.image_url) {
				throw new Error(
					"Image URL is required for Seedance image-to-video generation"
				);
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support image-to-video generation`
				);
			}

			const duration =
				request.duration ??
				(modelConfig.default_params?.duration as number) ??
				5;
			const resolution =
				request.resolution ??
				(modelConfig.default_params?.resolution as string) ??
				"1080p";
			const aspectRatio =
				request.aspect_ratio ??
				(modelConfig.default_params?.aspect_ratio as string) ??
				"16:9";
			const cameraFixed =
				request.camera_fixed ??
				(modelConfig.default_params?.camera_fixed as boolean) ??
				false;

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				resolution,
				aspect_ratio: aspectRatio,
				camera_fixed: cameraFixed,
				enable_safety_checker:
					request.enable_safety_checker ??
					modelConfig.default_params?.enable_safety_checker ??
					false,
			};

			if (request.seed !== undefined) {
				payload.seed = request.seed;
			}

			if (request.end_image_url && request.model === "seedance_pro_i2v") {
				payload.end_image_url = request.end_image_url;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Seedance video");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: `Video generated successfully with ${request.model}`,
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate video from image using Seedance 2.0 models.
 */
export async function generateSeedance2Video(
	request: Seedance2I2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Seedance 2.0 video",
		{ operation: "generateSeedance2Video", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error(
					"Please enter a prompt describing the desired animation"
				);
			}

			if (!request.image_url) {
				throw new Error(
					"Image URL is required for Seedance 2.0 image-to-video generation"
				);
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support image-to-video generation`
				);
			}

			const duration =
				request.duration ??
				(modelConfig.default_params?.duration as number) ??
				5;
			const resolution =
				request.resolution ??
				(modelConfig.default_params?.resolution as string) ??
				"1080p";
			const aspectRatio =
				request.aspect_ratio ??
				(modelConfig.default_params?.aspect_ratio as string) ??
				"16:9";
			const cameraFixed =
				request.camera_fixed ??
				(modelConfig.default_params?.camera_fixed as boolean) ??
				false;

			const validAspectRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
			const safeAspectRatio = validAspectRatios.includes(aspectRatio)
				? aspectRatio
				: "16:9";

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				resolution,
				aspect_ratio: safeAspectRatio,
				camera_fixed: cameraFixed,
				enable_safety_checker:
					request.enable_safety_checker ??
					modelConfig.default_params?.enable_safety_checker ??
					false,
			};

			if (request.end_user_id) {
				payload.end_user_id = request.end_user_id;
			}

			if (request.seed !== undefined) {
				payload.seed = request.seed;
			}

			if (request.end_image_url) {
				payload.end_image_url = request.end_image_url;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Seedance 2.0 video");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: "Video generated successfully with Seedance 2.0",
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate video from reference image using Seedance 2.0 reference-to-video.
 */
export async function generateSeedance2RefVideo(
	request: Seedance2Ref2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Seedance 2.0 Ref2V",
		{ operation: "generateSeedance2RefVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error("Please enter a prompt describing the desired video");
			}

			if (!request.reference_image_url) {
				throw new Error(
					"Reference image URL is required for Seedance 2.0 reference-to-video"
				);
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support reference-to-video generation`
				);
			}

			const duration =
				request.duration ??
				(modelConfig.default_params?.duration as number) ??
				5;
			const resolution =
				request.resolution ??
				(modelConfig.default_params?.resolution as string) ??
				"1080p";
			const aspectRatio =
				request.aspect_ratio ??
				(modelConfig.default_params?.aspect_ratio as string) ??
				"16:9";

			const validAspectRatios = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
			const safeAspectRatio = validAspectRatios.includes(aspectRatio)
				? aspectRatio
				: "16:9";

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				reference_image_url: request.reference_image_url,
				duration,
				resolution,
				aspect_ratio: safeAspectRatio,
				enable_safety_checker:
					request.enable_safety_checker ??
					modelConfig.default_params?.enable_safety_checker ??
					false,
			};

			if (request.end_user_id) {
				payload.end_user_id = request.end_user_id;
			}

			if (request.seed !== undefined) {
				payload.seed = request.seed;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Seedance 2.0 Ref2V");
			}

			const result = await response.json();

			return {
				job_id: jobId,
				status: "completed",
				message: "Video generated successfully with Seedance 2.0 Ref2V",
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}
