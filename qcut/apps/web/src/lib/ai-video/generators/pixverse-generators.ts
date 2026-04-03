/**
 * PixVerse v6 Image-to-Video Generator
 */

import type { VideoGenerationResponse } from "@/components/editor/media-panel/views/ai/types/ai-types";
import type { PixverseV6I2VRequest } from "@/components/editor/media-panel/views/ai/types/ai-types/request-types";
import {
	generateJobId,
	getFalApiKeyAsync,
	handleFalResponse,
	makeFalRequest,
} from "../core/fal-request";
import {
	validatePixverseDuration,
	validatePixverseResolution,
	validatePixverseStyle,
} from "../validation/validators";
import { getModelConfig, withErrorHandling } from "./base-generator";

/**
 * Generate video from image using PixVerse v6.
 *
 * Features: Style presets, audio generation, multi-clip, 360p-1080p, 1-15s.
 */
export async function generatePixverseImageVideo(
	request: PixverseV6I2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate PixVerse v6 image-to-video",
		{ operation: "generatePixverseImageVideo", model: request.model },
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
					"Text prompt is required for PixVerse v6 video generation"
				);
			}

			if (!request.image_url) {
				throw new Error(
					"Image is required for PixVerse v6 image-to-video generation"
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

			// Apply defaults and validate
			const duration = request.duration ?? 5;
			const resolution = request.resolution ?? "720p";

			validatePixverseDuration(duration);
			validatePixverseResolution(resolution);
			if (request.style) validatePixverseStyle(request.style);

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				image_url: request.image_url,
				duration,
				resolution,
			};

			if (request.negative_prompt) {
				payload.negative_prompt = request.negative_prompt;
			}
			if (request.style) {
				payload.style = request.style;
			}
			if (request.seed !== undefined) {
				payload.seed = request.seed;
			}
			if (request.generate_audio_switch !== undefined) {
				payload.generate_audio_switch = request.generate_audio_switch;
			}
			if (request.generate_multi_clip_switch !== undefined) {
				payload.generate_multi_clip_switch = request.generate_multi_clip_switch;
			}
			if (request.thinking_type) {
				payload.thinking_type = request.thinking_type;
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate PixVerse v6 video");
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
