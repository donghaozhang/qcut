/**
 * Image-to-Video Generators
 *
 * Functions for generating videos from images using various AI models.
 */

import type {
	ImageToVideoRequest,
	VideoGenerationResponse,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import type { Sora2Duration } from "@/types/sora2";
import {
	generateJobId,
	getFalApiKeyAsync,
	handleFalResponse,
	makeFalRequest,
} from "../core/fal-request";
import {
	convertSora2Parameters,
	getSora2ModelType,
	isSora2Model,
	parseSora2Response,
} from "../models/sora2";
import {
	fileToDataURL,
	getModelConfig,
	withErrorHandling,
} from "./base-generator";

/**
 * Generates AI video from a static image using FAL AI's image-to-video models.
 *
 * @param request - Image file, model ID, optional prompt, and generation parameters
 * @returns VideoGenerationResponse with job_id for polling
 * @throws Error if model doesn't support image-to-video or FAL_API_KEY missing
 */
export async function generateVideoFromImage(
	request: ImageToVideoRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate video from image",
		{ operation: "generateVideoFromImage", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			// Convert image to base64 data URL
			const imageUrl = await fileToDataURL(request.image);

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

			// Build payload based on model type
			let payload: Record<string, unknown>;

			if (isSora2Model(request.model)) {
				const modelType = getSora2ModelType(request.model);
				if (
					modelType &&
					(modelType === "image-to-video" || modelType === "image-to-video-pro")
				) {
					const sora2Payload = convertSora2Parameters(
						{
							prompt:
								request.prompt || "Create a cinematic video from this image",
							image_url: imageUrl,
							duration: request.duration,
							resolution: request.resolution,
							aspect_ratio: request.aspect_ratio || "auto",
						} as Parameters<typeof convertSora2Parameters>[0],
						modelType
					);
					const { type, ...apiPayload } = sora2Payload;
					payload = apiPayload;
				} else {
					payload = {
						prompt:
							request.prompt || "Create a cinematic video from this image",
						image_url: imageUrl,
						...(modelConfig.default_params || {}),
						...(request.duration && { duration: request.duration }),
						...(request.resolution && { resolution: request.resolution }),
					};
				}
			} else {
				payload = {
					prompt: request.prompt || "Create a cinematic video from this image",
					image_url: imageUrl,
					...(modelConfig.default_params || {}),
					...(request.duration && { duration: request.duration }),
					...(request.resolution && { resolution: request.resolution }),
				};

				// Model-specific adjustments
				if (request.model === "wan_turbo") {
					payload.resolution =
						request.resolution &&
						["480p", "580p", "720p"].includes(request.resolution)
							? request.resolution
							: "720p";
					payload.seed = Math.floor(Math.random() * 1_000_000);
				} else if (request.model === "wan_25_preview") {
					payload.quality = "high";
				} else if (request.model === "seedance_pro") {
					payload.duration = request.duration?.toString() || "5";
				}
			}

			const jobId = generateJobId();

			const response = await makeFalRequest(endpoint, payload);

			if (!response.ok) {
				await handleFalResponse(response, "Generate video from image");
			}

			const result = await response.json();

			// Parse Sora 2 response if needed
			let videoUrl = result.video?.url || result.video || result.url;
			if (isSora2Model(request.model)) {
				try {
					const parsed = parseSora2Response(
						result,
						(request.duration || 4) as Sora2Duration,
						request.resolution,
						request.aspect_ratio
					);
					videoUrl = parsed.videoUrl;
				} catch {
					// Use default format
				}
			}

			return {
				job_id: jobId,
				status: "completed",
				message: `Video generated successfully with ${request.model}`,
				estimated_time: 0,
				video_url: videoUrl,
				video_data: result,
			};
		}
	);
}

export {
	generateKling26ImageVideo,
	generateKlingImageVideo,
	generateKlingO1RefVideo,
	generateKlingO1Video,
} from "./kling-generators";
export {
	generateWAN25ImageVideo,
	generateWAN26ImageVideo,
	generateWAN26RefVideo,
} from "./wan-generators";
export {
	generateViduQ2Video,
	generateViduQ3ImageVideo,
} from "./vidu-generators";
export {
	generateLTXV2ImageVideo,
	generateLTX23ImageVideo,
	generateLTX23AudioVideo,
	generateSeedanceVideo,
	generateSeedance2Video,
	generateSeedance2RefVideo,
} from "./misc-generators";
export { generatePixverseImageVideo } from "./pixverse-generators";
