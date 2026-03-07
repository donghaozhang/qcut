/**
 * Text-to-Video Shared Utilities
 *
 * Common imports, types, and helper functions used across all text-to-video generators.
 */

import type { VideoGenerationRequest } from "@/components/editor/media-panel/views/ai/types/ai-types";
import {
	isSora2Model,
	getSora2ModelType,
	convertSora2Parameters,
} from "../../models/sora2";
import { getModelConfig } from "../base-generator";

// Re-export commonly used utilities for generator modules
export { getModelConfig, withErrorHandling } from "../base-generator";
export {
	getFalApiKey,
	getFalApiKeyAsync,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
} from "../../core/fal-request";
export { pollQueueStatus, handleQueueError } from "../../core/polling";
export {
	streamVideoDownload,
	type StreamOptions,
} from "../../core/streaming";
export { handleAIServiceError } from "@/lib/debug/error-handler";
export { ERROR_MESSAGES } from "@/components/editor/media-panel/views/ai/constants/ai-constants";

// Re-export types used by generators
export type {
	VideoGenerationRequest,
	VideoGenerationResponse,
	TextToVideoRequest,
	LTXV2T2VRequest,
	LTX23T2VRequest,
	WAN26T2VRequest,
	ViduQ3T2VRequest,
	ProgressCallback,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
export type { Sora2Duration } from "@/types/sora2";

/**
 * Builds the payload for text-to-video generation based on model type.
 */
export function buildTextToVideoPayload(
	request: VideoGenerationRequest,
	modelConfig: ReturnType<typeof getModelConfig>
): Record<string, unknown> {
	if (!modelConfig) {
		throw new Error(`Unknown model: ${request.model}`);
	}

	// Handle Sora 2 models with special parameter conversion
	if (isSora2Model(request.model)) {
		const modelType = getSora2ModelType(request.model);
		if (modelType) {
			const sora2Payload = convertSora2Parameters(
				{
					prompt: request.prompt,
					duration: request.duration,
					resolution: request.resolution,
					aspect_ratio: request.aspect_ratio,
				} as Parameters<typeof convertSora2Parameters>[0],
				modelType
			);

			// Strip the 'type' discriminator before sending to API
			const { type, ...apiPayload } = sora2Payload;
			return apiPayload;
		}
	}

	// Existing models use default payload structure
	const payload: Record<string, unknown> = {
		prompt: request.prompt,
		...(modelConfig.default_params || {}),
		...(request.duration && { duration: request.duration }),
		...(request.resolution && { resolution: request.resolution }),
	};

	// Special handling for specific models
	if (request.model === "hailuo" || request.model === "hailuo_pro") {
		const requestedDuration = (payload.duration as number) || 6;
		payload.duration = requestedDuration >= 10 ? "10" : "6";
		payload.resolution = undefined;
	} else if (request.model === "wan_turbo") {
		const validResolutions = ["480p", "580p", "720p"];
		if (
			payload.resolution &&
			!validResolutions.includes(payload.resolution as string)
		) {
			payload.resolution = "720p";
		}
	} else if (request.model === "wan_25_preview") {
		const validResolutions = ["720p", "1080p", "1440p"];
		if (
			payload.resolution &&
			!validResolutions.includes(payload.resolution as string)
		) {
			payload.resolution = "1080p";
		}
	}

	// Validate duration doesn't exceed model's max
	if (
		payload.duration &&
		(payload.duration as number) > modelConfig.max_duration
	) {
		console.warn(
			`${modelConfig.name}: Duration capped at ${modelConfig.max_duration} seconds`
		);
		payload.duration = modelConfig.max_duration;
	}

	// Kling v2.6+ expects duration as string
	const klingStringDurationModels = [
		"kling_v26_pro_t2v",
		"kling_v3_pro_t2v",
		"kling_v3_standard_t2v",
	];
	if (klingStringDurationModels.includes(request.model) && payload.duration) {
		payload.duration = String(payload.duration);
	}

	return payload;
}
