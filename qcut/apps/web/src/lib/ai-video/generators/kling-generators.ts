/**
 * Kling Image-to-Video Generators
 */

import { platform } from "@qcut/platform-core";
import type {
	Kling26I2VRequest,
	KlingI2VRequest,
	KlingO1Ref2VideoRequest,
	KlingO1V2VRequest,
	VideoGenerationResponse,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import { ERROR_MESSAGES } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	generateJobId,
	getFalApiKeyAsync,
	handleFalResponse,
	makeFalRequest,
} from "../core/fal-request";
import { validateKlingPrompt } from "../validation/validators";
import {
	fileToDataURL,
	getModelConfig,
	withErrorHandling,
} from "./base-generator";

/**
 * Generate video from image using Kling v2.5 Turbo Pro.
 */
export async function generateKlingImageVideo(
	request: KlingI2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Kling video",
		{ operation: "generateKlingImageVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error("Please enter a prompt describing the desired motion");
			}
			validateKlingPrompt(trimmedPrompt);

			if (!request.image_url) {
				throw new Error("Image URL is required for Kling image-to-video");
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

			const duration = request.duration ?? 5;
			const aspectRatio =
				request.aspect_ratio ??
				(modelConfig.default_params?.aspect_ratio as string) ??
				"16:9";
			const cfgScale = Math.min(Math.max(request.cfg_scale ?? 0.5, 0), 1);
			const enhancePrompt =
				request.enhance_prompt ??
				modelConfig.default_params?.enhance_prompt ??
				true;

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				aspect_ratio: aspectRatio,
				cfg_scale: cfgScale,
				enhance_prompt: enhancePrompt,
			};

			if (request.negative_prompt) {
				payload.negative_prompt = request.negative_prompt;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Kling video");
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
 * Generate video from image using Kling v2.6 Pro.
 */
export async function generateKling26ImageVideo(
	request: Kling26I2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Kling 2.6 video",
		{ operation: "generateKling26ImageVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error("Please enter a prompt for Kling 2.6 video generation");
			}
			validateKlingPrompt(trimmedPrompt);

			if (!request.image_url) {
				throw new Error(
					"Image is required for Kling 2.6 image-to-video generation"
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

			const duration = request.duration ?? 5;
			const generateAudio = request.generate_audio ?? true;

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration: String(duration),
				generate_audio: generateAudio,
				negative_prompt:
					request.negative_prompt ?? "blur, distort, and low quality",
			};

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Kling 2.6 video");
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
 * Generate video from source video using Kling O1.
 */
export async function generateKlingO1Video(
	request: KlingO1V2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Kling O1 video",
		{ operation: "generateKlingO1Video", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error("Please enter a prompt describing the desired output");
			}
			validateKlingPrompt(trimmedPrompt);

			if (!request.sourceVideo) {
				throw new Error("Source video is required for Kling O1 video-to-video");
			}

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.image_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support video-to-video generation`
				);
			}

			// Upload video via Electron IPC if available
			let videoUrl: string;

			if (platform().fal?.uploadVideo) {
				const videoBuffer = await request.sourceVideo.arrayBuffer();
				const uploadResult = await platform().fal.uploadVideo(
					new Uint8Array(videoBuffer),
					request.sourceVideo.name,
					falApiKey
				);

				if (!uploadResult.success || !uploadResult.url) {
					throw new Error(
						uploadResult.error || "Failed to upload video to FAL"
					);
				}
				videoUrl = uploadResult.url;
			} else {
				// Fallback to data URL - validate size to avoid memory issues
				// 50MB limit accounts for ~33% base64 overhead (50MB -> ~67MB in memory)
				const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
				if (request.sourceVideo.size > MAX_VIDEO_SIZE_BYTES) {
					throw new Error(ERROR_MESSAGES.VIDEO_FILE_TOO_LARGE_FOR_FALLBACK);
				}
				videoUrl = await fileToDataURL(request.sourceVideo);
			}

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				video_url: videoUrl,
				duration: request.duration ?? 5,
				aspect_ratio: request.aspect_ratio ?? "auto",
				keep_audio: request.keep_audio ?? false,
			};

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Kling O1 video");
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
 * Generate video from reference images using Kling O1.
 */
export async function generateKlingO1RefVideo(
	request: KlingO1Ref2VideoRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Kling O1 Ref video",
		{ operation: "generateKlingO1RefVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			const trimmedPrompt = request.prompt?.trim() ?? "";
			if (!trimmedPrompt) {
				throw new Error("Please enter a prompt");
			}
			validateKlingPrompt(trimmedPrompt);

			if (!request.image_urls || request.image_urls.length === 0) {
				throw new Error("At least one reference image is required");
			}

			if (request.image_urls.length > 7) {
				throw new Error("Maximum 7 reference images allowed");
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

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_urls: request.image_urls,
				duration: request.duration ?? 5,
				aspect_ratio: request.aspect_ratio ?? "16:9",
				cfg_scale: Math.min(Math.max(request.cfg_scale ?? 0.5, 0), 1),
			};

			if (request.negative_prompt) {
				payload.negative_prompt = request.negative_prompt;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate Kling O1 Ref video");
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
