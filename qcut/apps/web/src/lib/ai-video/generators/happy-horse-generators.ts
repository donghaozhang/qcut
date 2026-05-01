/**
 * Alibaba Happy Horse generators.
 *
 * Three sibling endpoints share the prompt/duration/resolution/seed
 * surface so they live in one module to keep imports cheap and the
 * shared validation paths obvious.
 *
 *   - happy_horse_t2v        → alibaba/happy-horse/text-to-video
 *   - happy_horse_ref2v      → alibaba/happy-horse/reference-to-video
 *   - happy_horse_video_edit → alibaba/happy-horse/video-edit
 *
 * Spec: docs/task/fal_model/happy-horse-integration.md
 */

import type {
	HappyHorseT2VRequest,
	HappyHorseRef2VRequest,
	HappyHorseVideoEditRequest,
	VideoGenerationResponse,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import {
	generateJobId,
	getFalApiKeyAsync,
	handleFalResponse,
	makeFalRequest,
} from "../core/fal-request";
import {
	validateHappyHorseAspectRatio,
	validateHappyHorseAudioSetting,
	validateHappyHorseDuration,
	validateHappyHorseImageUrls,
	validateHappyHorsePrompt,
	validateHappyHorseReferenceImages,
	validateHappyHorseResolution,
	validateHappyHorseSeed,
	validateHappyHorseVideoEditUrl,
} from "../validation/validators";
import { getModelConfig, withErrorHandling } from "./base-generator";

const T2V_ENDPOINT = "alibaba/happy-horse/text-to-video";
const REF2V_ENDPOINT = "alibaba/happy-horse/reference-to-video";
const VIDEO_EDIT_ENDPOINT = "alibaba/happy-horse/video-edit";

const NO_API_KEY_ERROR =
	"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings.";

function resolveEndpoint(
	modelKey: string,
	kind: "t2v" | "ref2v" | "edit"
): string {
	const config = getModelConfig(modelKey);
	if (kind === "t2v") {
		return config?.endpoints?.text_to_video || T2V_ENDPOINT;
	}
	if (kind === "ref2v") {
		return config?.endpoints?.reference_to_video || REF2V_ENDPOINT;
	}
	// Video-edit isn't a standard renderer-side endpoint slot today; fall back
	// to the constant. Once a video_to_video slot is added to AIModelEndpoints
	// the model config can override.
	return VIDEO_EDIT_ENDPOINT;
}

function buildSharedPayload(
	prompt: string,
	resolution: string,
	seed: number | undefined,
	enableSafetyChecker: boolean | undefined
): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		prompt,
		resolution,
	};
	if (seed !== undefined) payload.seed = seed;
	if (enableSafetyChecker !== undefined) {
		payload.enable_safety_checker = enableSafetyChecker;
	}
	return payload;
}

/**
 * Generate a video from text using Alibaba Happy Horse T2V.
 */
export async function generateHappyHorseT2V(
	request: HappyHorseT2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Happy Horse T2V",
		{ operation: "generateHappyHorseT2V", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) throw new Error(NO_API_KEY_ERROR);

			const prompt = request.prompt?.trim() ?? "";
			validateHappyHorsePrompt(prompt);

			const duration = request.duration ?? 5;
			const resolution = request.resolution ?? "1080p";
			const aspectRatio = request.aspect_ratio ?? "16:9";

			validateHappyHorseDuration(duration);
			validateHappyHorseResolution(resolution);
			validateHappyHorseAspectRatio(aspectRatio);
			if (request.seed !== undefined) validateHappyHorseSeed(request.seed);

			const payload = buildSharedPayload(
				prompt,
				resolution,
				request.seed,
				request.enable_safety_checker
			);
			payload.duration = duration;
			payload.aspect_ratio = aspectRatio;

			const jobId = generateJobId();
			const endpoint = resolveEndpoint(request.model, "t2v");
			const response = await makeFalRequest(endpoint, payload);
			if (!response.ok) {
				await handleFalResponse(response, "Generate Happy Horse T2V");
			}
			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: "Video generated successfully with Happy Horse T2V",
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate a video from 1–9 reference images using Happy Horse Ref2V.
 *
 * The prompt addresses each image as character1…character9.
 */
export async function generateHappyHorseRef2V(
	request: HappyHorseRef2VRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Happy Horse Ref2V",
		{ operation: "generateHappyHorseRef2V", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) throw new Error(NO_API_KEY_ERROR);

			const prompt = request.prompt?.trim() ?? "";
			validateHappyHorsePrompt(prompt);
			validateHappyHorseImageUrls(request.image_urls);

			const duration = request.duration ?? 5;
			const resolution = request.resolution ?? "1080p";
			const aspectRatio = request.aspect_ratio ?? "16:9";

			validateHappyHorseDuration(duration);
			validateHappyHorseResolution(resolution);
			validateHappyHorseAspectRatio(aspectRatio);
			if (request.seed !== undefined) validateHappyHorseSeed(request.seed);

			const payload = buildSharedPayload(
				prompt,
				resolution,
				request.seed,
				request.enable_safety_checker
			);
			payload.image_urls = request.image_urls;
			payload.duration = duration;
			payload.aspect_ratio = aspectRatio;

			const jobId = generateJobId();
			const endpoint = resolveEndpoint(request.model, "ref2v");
			const response = await makeFalRequest(endpoint, payload);
			if (!response.ok) {
				await handleFalResponse(response, "Generate Happy Horse Ref2V");
			}
			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: "Video generated successfully with Happy Horse Ref2V",
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}

/**
 * Generate an edited video from a source video + prompt using Happy Horse Video-Edit.
 *
 * Optional reference images (≤5) are addressed as @Image1…@Image5 in the prompt.
 * The output is capped at 15 s regardless of input length (3–60 s).
 */
export async function generateHappyHorseVideoEdit(
	request: HappyHorseVideoEditRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate Happy Horse Video Edit",
		{ operation: "generateHappyHorseVideoEdit", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) throw new Error(NO_API_KEY_ERROR);

			const prompt = request.prompt?.trim() ?? "";
			validateHappyHorsePrompt(prompt);
			validateHappyHorseVideoEditUrl(request.video_url);
			validateHappyHorseReferenceImages(request.reference_image_urls);

			const resolution = request.resolution ?? "1080p";
			validateHappyHorseResolution(resolution);

			const audioSetting = request.audio_setting ?? "auto";
			validateHappyHorseAudioSetting(audioSetting);

			if (request.seed !== undefined) validateHappyHorseSeed(request.seed);

			const payload = buildSharedPayload(
				prompt,
				resolution,
				request.seed,
				request.enable_safety_checker
			);
			payload.video_url = request.video_url;
			payload.audio_setting = audioSetting;
			if (
				request.reference_image_urls &&
				request.reference_image_urls.length > 0
			) {
				payload.reference_image_urls = request.reference_image_urls;
			}

			const jobId = generateJobId();
			const endpoint = resolveEndpoint(request.model, "edit");
			const response = await makeFalRequest(endpoint, payload);
			if (!response.ok) {
				await handleFalResponse(response, "Generate Happy Horse Video Edit");
			}
			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: "Video generated successfully with Happy Horse Video Edit",
				estimated_time: 0,
				video_url: result.video?.url || result.video || result.url,
				video_data: result,
			};
		}
	);
}
