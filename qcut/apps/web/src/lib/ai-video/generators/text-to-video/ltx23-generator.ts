/**
 * LTX Video 2.3 Text-to-Video Generator
 *
 * Generates video with audio from text using the LTX Video 2.3 model (Pro and Fast).
 */

import {
	validateLTX23Resolution,
	validateLTX23Duration,
	validateLTX23FastExtendedConstraints,
	isLTX23FastModel,
} from "../../validation/validators";
import {
	withErrorHandling,
	getFalApiKeyAsync,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
	getModelConfig,
	ERROR_MESSAGES,
	type LTX23T2VRequest,
	type VideoGenerationResponse,
} from "./shared";

/**
 * Generate video with audio from text using LTX Video 2.3.
 *
 * @param request - Prompt, model ID, and generation parameters
 */
export async function generateLTX23TextVideo(
	request: LTX23T2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate LTX Video 2.3 video",
		{ operation: "generateLTX23TextVideo", model: request.model },
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

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown model: ${request.model}`);
			}

			const endpoint = modelConfig.endpoints.text_to_video;
			if (!endpoint) {
				throw new Error(
					`Model ${request.model} does not support text-to-video generation`
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

			if (isLTX23FastModel(request.model)) {
				validateLTX23FastExtendedConstraints(duration, resolution, fps);
			}

			const payload: Record<string, unknown> = {
				prompt: trimmedPrompt,
				duration,
				resolution,
				fps,
				generate_audio: generateAudio,
				...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio }),
			};

			const jobId = generateJobId();
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate LTX Video 2.3 video");
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
