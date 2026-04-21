/**
 * Video Upscale Generators
 *
 * Functions for upscaling videos using various AI models.
 * Includes ByteDance, FlashVSR, and Topaz upscalers.
 */

import type {
	VideoGenerationResponse,
	ByteDanceUpscaleRequest,
	FlashVSRUpscaleRequest,
	TopazUpscaleRequest,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import {
	getFalApiKey,
	getFalApiKeyAsync,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
} from "../core/fal-request";
import { getModelConfig, withErrorHandling } from "./base-generator";

/**
 * Upscales a remote video using the ByteDance video upscaler model.
 *
 * @param request - Request options. `video_url` is required; `target_resolution` and `target_fps` default to `"1080p"` and `"30fps"` when omitted.
 * @returns A VideoGenerationResponse containing the job id, completion status, a human-readable message, the resulting `video_url` (when available), and raw response data in `video_data`.
 * @throws If the FAL API key is not configured.
 * @throws If `request.video_url` is not provided.
 * @throws If the ByteDance upscaler model or its endpoint is not found/configured.
 * @throws On FAL API errors (includes specific messages for HTTP 401 — invalid API key — and 429 — rate limiting).
 */
export async function upscaleByteDanceVideo(
	request: ByteDanceUpscaleRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Upscale video with ByteDance",
		{ operation: "upscaleByteDanceVideo" },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			if (!request.video_url) {
				throw new Error("Video URL is required for upscaling");
			}

			const modelConfig = getModelConfig("bytedance_video_upscaler");
			if (!modelConfig) {
				throw new Error("ByteDance upscaler model not found");
			}

			const endpoint = modelConfig.endpoints.upscale_video;
			if (!endpoint) {
				throw new Error("ByteDance upscaler endpoint not configured");
			}

			const targetResolution = request.target_resolution ?? "1080p";
			const targetFPS = request.target_fps ?? "30fps";

			const payload: Record<string, unknown> = {
				video_url: request.video_url,
				target_resolution: targetResolution,
				target_fps: targetFPS,
			};

			const jobId = generateJobId();
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Upscale video with ByteDance");
			}

			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: `Video upscaled to ${targetResolution} @ ${targetFPS}`,
				estimated_time: 0,
				video_url:
					result.video?.url ||
					(typeof result.video === "string" ? result.video : result.url),
				video_data: result,
			};
		}
	);
}

/**
 * Upscales a video using the FlashVSR video upscaler model.
 *
 * @param request - Upscale request. `video_url` is required. Optional fields include `upscale_factor` (1–4), `quality` (0–100), `acceleration`, `color_fix`, `preserve_audio`, `output_format`, `output_quality`, `output_write_mode`, and `seed`.
 * @returns A VideoGenerationResponse containing `job_id`, `status`, `message`, the resulting `video_url`, and the raw service response in `video_data`.
 * @throws Error if the FAL API key is not configured, `video_url` is missing, the FlashVSR model or endpoint is not found, `upscale_factor` or `quality` are out of allowed ranges, or when the FAL API returns an error (including 401 or 429 responses).
 */
export async function upscaleFlashVSRVideo(
	request: FlashVSRUpscaleRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Upscale video with FlashVSR",
		{ operation: "upscaleFlashVSRVideo" },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			if (!request.video_url) {
				throw new Error("Video URL is required for upscaling");
			}

			const modelConfig = getModelConfig("flashvsr_video_upscaler");
			if (!modelConfig) {
				throw new Error("FlashVSR upscaler model not found");
			}

			const endpoint = modelConfig.endpoints.upscale_video;
			if (!endpoint) {
				throw new Error("FlashVSR upscaler endpoint not configured");
			}

			// Validate upscale factor
			const upscaleFactor = request.upscale_factor ?? 4;
			if (upscaleFactor < 1 || upscaleFactor > 4) {
				throw new Error("Upscale factor must be between 1 and 4");
			}

			// Validate quality
			const quality = request.quality ?? 70;
			if (quality < 0 || quality > 100) {
				throw new Error("Quality must be between 0 and 100");
			}

			const payload: Record<string, unknown> = {
				video_url: request.video_url,
				upscale_factor: upscaleFactor,
				acceleration: request.acceleration ?? "regular",
				quality,
				color_fix: request.color_fix ?? true,
				preserve_audio: request.preserve_audio ?? false,
				output_format: request.output_format ?? "X264",
				output_quality: request.output_quality ?? "high",
				output_write_mode: request.output_write_mode ?? "balanced",
			};

			// Add optional seed
			if (request.seed !== undefined) {
				payload.seed = request.seed;
			}

			const jobId = generateJobId();
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Upscale video with FlashVSR");
			}

			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: `Video upscaled with FlashVSR (${upscaleFactor}x)`,
				estimated_time: 0,
				video_url:
					result.video?.url ||
					(typeof result.video === "string" ? result.video : result.url),
				video_data: result,
			};
		}
	);
}

/**
 * Upscales a video using the Topaz Video Upscaler (`fal-ai/topaz/upscale/video`).
 *
 * @param request - Parameters. `video_url` is required. Optional: `upscale_factor`
 *   (2–8, default 2), `target_fps` (integer — if set, enables frame interpolation),
 *   `h264_output` (default false = H265).
 * @returns A VideoGenerationResponse with `job_id`, `status`, a human-readable `message`,
 *   the resulting `video_url`, and the raw provider response in `video_data`.
 * @throws If the FAL API key is not configured, `video_url` is missing, the model
 *   registry entry is not found, `upscale_factor` is out of range, or the FAL API
 *   returns an error (401/429 messages are propagated via `handleFalResponse`).
 */
export async function upscaleTopazVideo(
	request: TopazUpscaleRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Upscale video with Topaz",
		{ operation: "upscaleTopazVideo" },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			if (!request.video_url) {
				throw new Error("Video URL is required for upscaling");
			}

			const modelConfig = getModelConfig("topaz_video_upscale");
			if (!modelConfig) {
				throw new Error("Topaz upscaler model not found");
			}

			const endpoint = modelConfig.endpoints.upscale_video;
			if (!endpoint) {
				throw new Error("Topaz upscaler endpoint not configured");
			}

			const upscaleFactor = request.upscale_factor ?? 2;
			if (upscaleFactor < 2 || upscaleFactor > 8) {
				throw new Error("Topaz upscale factor must be between 2 and 8");
			}

			const payload: Record<string, unknown> = {
				video_url: request.video_url,
				upscale_factor: upscaleFactor,
				// Reason: fal uses `H264_output` (capital H) on the wire. Map from
				// our camelCase interface field here so callers don't need to know.
				H264_output: request.h264_output ?? false,
			};

			if (typeof request.target_fps === "number") {
				payload.target_fps = request.target_fps;
			}

			const jobId = generateJobId();
			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Upscale video with Topaz");
			}

			const result = await response.json();
			return {
				job_id: jobId,
				status: "completed",
				message: `Video upscaled with Topaz (${upscaleFactor}x)`,
				estimated_time: 0,
				video_url:
					result.video?.url ||
					(typeof result.video === "string" ? result.video : result.url),
				video_data: result,
			};
		}
	);
}
