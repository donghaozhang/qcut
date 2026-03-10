/**
 * HeyGen Translate (Speed Mode) Generator
 *
 * Translates video audio with lip-sync to 40+ languages.
 * Uses FAL queue mode for async processing.
 * API: fal-ai/heygen/v2/translate/speed
 * Cost: $0.05/sec of output video
 */

import { withErrorHandling } from "./base-generator";
import { getFalApiKeyAsync, makeFalRequest } from "../core/fal-request";
import { pollQueueStatus } from "../core/polling";
import type { ProgressCallback } from "@/components/editor/media-panel/views/ai/types/ai-types";
import { generateJobId } from "../core/fal-request";
import type { HeyGenTranslateRequest } from "@/components/editor/media-panel/views/ai/types/ai-types/request-types";
import type { VideoGenerationResponse } from "@/components/editor/media-panel/views/ai/types/ai-types/request-types";
import { validateTranslateInputs } from "../validation/validators/translate-validators";

const HEYGEN_TRANSLATE_ENDPOINT = "fal-ai/heygen/v2/translate/speed";

export async function generateHeyGenTranslate(
	request: HeyGenTranslateRequest,
	onProgress?: ProgressCallback
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate HeyGen Translate",
		{ operation: "generateHeyGenTranslate", language: request.output_language },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set your FAL API key in Settings."
				);
			}

			// Validate inputs
			validateTranslateInputs({
				video_url: request.video_url,
				output_language: request.output_language,
				speaker_num: request.speaker_num,
			});

			const jobId = generateJobId();

			// Build payload
			const payload: Record<string, unknown> = {
				video_url: request.video_url,
				output_language: request.output_language,
			};

			if (request.translate_audio_only !== undefined) {
				payload.translate_audio_only = request.translate_audio_only;
			}
			if (request.speaker_num !== undefined) {
				payload.speaker_num = request.speaker_num;
			}
			if (request.enable_dynamic_duration !== undefined) {
				payload.enable_dynamic_duration = request.enable_dynamic_duration;
			} else {
				payload.enable_dynamic_duration = true;
			}

			// Submit to queue
			const queueResponse = await makeFalRequest(
				HEYGEN_TRANSLATE_ENDPOINT,
				payload,
				{ queueMode: true }
			);
			const queueResult = (await queueResponse.json()) as {
				request_id: string;
				status_url?: string;
				response_url?: string;
			};
			const requestId = queueResult.request_id;

			if (!requestId) {
				throw new Error("Failed to submit translation job to queue");
			}

			// Poll for completion
			return await pollQueueStatus(requestId, {
				endpoint: HEYGEN_TRANSLATE_ENDPOINT,
				startTime: Date.now(),
				onProgress,
				jobId,
				modelName: "heygen_translate_speed",
				statusUrl: queueResult.status_url,
				responseUrl: queueResult.response_url,
			});
		}
	);
}
