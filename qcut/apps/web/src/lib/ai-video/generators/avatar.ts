/**
 * Avatar Video Generators
 *
 * Functions for generating avatar/talking-head videos.
 */

import { handleAIServiceError } from "@/lib/debug/error-handler";
import type {
	AvatarVideoRequest,
	VideoGenerationResponse,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import { ERROR_MESSAGES } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	getFalApiKey,
	getFalApiKeyAsync,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
} from "../core/fal-request";
import {
	getModelConfig,
	fileToDataURL,
	withErrorHandling,
} from "./base-generator";
import {
	validateKlingAvatarV2Audio,
	validateSyncLipsyncReact1Inputs,
} from "../validation/validators";

/**
 * Generate an avatar video from a character image using a specified avatar model.
 *
 * Builds and sends a model-specific payload (image plus audio or source video) to the configured FAL endpoint.
 *
 * @param request - Request object containing model id, character image File and model-specific inputs
 * @returns VideoGenerationResponse containing job_id, status, message, and the generated video URL
 * @throws Error if FAL API key missing, model unknown, or required inputs missing
 */
export async function generateAvatarVideo(
	request: AvatarVideoRequest
): Promise<VideoGenerationResponse> {
	return withErrorHandling(
		"Generate avatar video",
		{ operation: "generateAvatarVideo", model: request.model },
		async () => {
			const falApiKey = await getFalApiKeyAsync();
			if (!falApiKey) {
				throw new Error(
					"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
				);
			}

			console.log("Starting avatar video generation with FAL AI");
			console.log("Model:", request.model);

			const modelConfig = getModelConfig(request.model);
			if (!modelConfig) {
				throw new Error(`Unknown avatar model: ${request.model}`);
			}

			if (modelConfig.category !== "avatar") {
				throw new Error(`Model ${request.model} is not an avatar model`);
			}

			// Determine endpoint and payload based on model
			let endpoint: string;
			let payload: Record<string, unknown>;

			if (request.model === "wan_animate_replace") {
				if (!request.characterImage) {
					throw new Error("WAN Animate/Replace requires a character image");
				}
				if (!request.sourceVideo) {
					throw new Error("WAN Animate/Replace requires a source video");
				}
				const characterImageUrl = await fileToDataURL(request.characterImage);
				const sourceVideoUrl = await fileToDataURL(request.sourceVideo);
				endpoint = modelConfig.endpoints.text_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}
				payload = {
					...(modelConfig.default_params || {}),
					video_url: sourceVideoUrl,
					image_url: characterImageUrl,
					...(request.resolution && { resolution: request.resolution }),
				};
			} else if (
				request.model === "kling_avatar_pro" ||
				request.model === "kling_avatar_standard"
			) {
				if (!request.characterImage) {
					throw new Error(`${request.model} requires a character image`);
				}
				if (!request.audioFile) {
					throw new Error(`${request.model} requires an audio file`);
				}
				const characterImageUrl = await fileToDataURL(request.characterImage);
				const audioUrl = await fileToDataURL(request.audioFile);
				endpoint = modelConfig.endpoints.text_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}
				payload = {
					...(modelConfig.default_params || {}),
					image_url: characterImageUrl,
					audio_url: audioUrl,
					...(request.prompt && { prompt: request.prompt }),
					...(request.resolution && { resolution: request.resolution }),
				};
			} else if (
				request.model === "kling_avatar_v2_standard" ||
				request.model === "kling_avatar_v2_pro"
			) {
				// Kling Avatar V2 requires pre-uploaded URLs (FAL storage), not local files
				// audioFile is only used for client-side validation before upload
				if (request.audioFile) {
					validateKlingAvatarV2Audio(request.audioFile, request.audioDuration);
				}

				if (!request.characterImageUrl) {
					throw new Error(
						"Kling Avatar v2 requires pre-uploaded image URL (use FAL storage)"
					);
				}
				if (!request.audioUrl) {
					throw new Error(
						"Kling Avatar v2 requires pre-uploaded audio URL (use FAL storage)"
					);
				}

				endpoint = modelConfig.endpoints.text_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}
				payload = {
					...(modelConfig.default_params || {}),
					image_url: request.characterImageUrl,
					audio_url: request.audioUrl,
					...(request.prompt && { prompt: request.prompt }),
				};
			} else if (request.model === "bytedance_omnihuman_v1_5") {
				if (!request.characterImage) {
					throw new Error(
						"ByteDance OmniHuman v1.5 requires a character image"
					);
				}
				if (!request.audioFile) {
					throw new Error("ByteDance OmniHuman v1.5 requires an audio file");
				}
				const characterImageUrl = await fileToDataURL(request.characterImage);
				const audioUrl = await fileToDataURL(request.audioFile);
				endpoint = modelConfig.endpoints.text_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}
				payload = {
					...(modelConfig.default_params || {}),
					image_url: characterImageUrl,
					audio_url: audioUrl,
					...(request.resolution && { resolution: request.resolution }),
				};
			} else if (request.model === "kling_o1_ref2video") {
				if (!request.characterImage) {
					throw new Error("Kling O1 Ref2Video requires a character image");
				}
				const characterImageUrl = await fileToDataURL(request.characterImage);
				endpoint = modelConfig.endpoints.image_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}

				let enhancedPrompt = request.prompt || "";
				if (!enhancedPrompt.includes("@Image")) {
					enhancedPrompt =
						`Use @Image1 as the reference. ${enhancedPrompt}`.trim();
				}

				payload = {
					prompt: enhancedPrompt,
					image_urls: [characterImageUrl],
					duration: String(
						request.duration || modelConfig.default_params?.duration || 5
					),
					aspect_ratio: modelConfig.default_params?.aspect_ratio || "16:9",
					...((modelConfig.default_params?.cfg_scale && {
						cfg_scale: modelConfig.default_params.cfg_scale,
					}) as Record<string, unknown>),
					...((modelConfig.default_params?.negative_prompt && {
						negative_prompt: modelConfig.default_params.negative_prompt,
					}) as Record<string, unknown>),
				};
			} else if (request.model === "grok_imagine_r2v") {
				if (!request.characterImage && !request.referenceImageUrls?.length) {
					throw new Error(
						"Grok Imagine R2V requires at least one reference image"
					);
				}

				// Build reference image URLs: use pre-uploaded URLs or convert the character image
				const refUrls: string[] = [];
				if (request.referenceImageUrls?.length) {
					refUrls.push(...request.referenceImageUrls);
				} else if (request.characterImage) {
					refUrls.push(await fileToDataURL(request.characterImage));
				}

				endpoint = modelConfig.endpoints.image_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}

				let grokPrompt = request.prompt || "";
				if (!grokPrompt.includes("@Image")) {
					grokPrompt = `Use @Image1 as the reference. ${grokPrompt}`.trim();
				}

				payload = {
					prompt: grokPrompt,
					reference_image_urls: refUrls,
					duration:
						request.duration || modelConfig.default_params?.duration || 8,
					aspect_ratio: modelConfig.default_params?.aspect_ratio || "16:9",
					resolution:
						request.resolution ||
						modelConfig.default_params?.resolution ||
						"480p",
				};
			} else if (request.model === "sync_lipsync_react1") {
				// Sync Lipsync React-1 requires pre-uploaded URLs (like Kling Avatar V2)
				// Validate inputs
				validateSyncLipsyncReact1Inputs({
					videoUrl: request.videoUrl,
					audioUrl: request.audioUrl,
					videoDuration: request.videoDuration,
					audioDuration: request.audioDuration,
					emotion: request.emotion,
					temperature: request.temperature,
				});

				endpoint = modelConfig.endpoints.text_to_video || "";
				if (!endpoint) {
					throw new Error(
						`Model ${request.model} does not have a valid endpoint`
					);
				}

				payload = {
					video_url: request.videoUrl,
					audio_url: request.audioUrl,
					emotion: request.emotion,
					model_mode:
						request.modelMode ??
						modelConfig.default_params?.model_mode ??
						"face",
					lipsync_mode:
						request.lipsyncMode ??
						modelConfig.default_params?.lipsync_mode ??
						"bounce",
					temperature:
						request.temperature ??
						modelConfig.default_params?.temperature ??
						0.5,
				};
			} else {
				throw new Error(`Unsupported avatar model: ${request.model}`);
			}

			const jobId = generateJobId();

			// Add timeout (6 minutes for avatar video generation)
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 360_000);

			try {
				const response = await makeFalRequest(endpoint, payload, {
					signal: controller.signal,
				});

				clearTimeout(timeoutId);

				if (!response.ok) {
					await handleFalResponse(response, "Generate avatar video");
				}

				const result = await response.json();

				return {
					job_id: jobId,
					status: "completed",
					message: `Avatar video generated successfully with ${request.model}`,
					estimated_time: 0,
					video_url: result.video?.url || result.video || result.url,
					video_data: result,
				};
			} catch (error) {
				clearTimeout(timeoutId);
				if (error instanceof Error && error.name === "AbortError") {
					throw new Error(
						"Avatar video generation timed out (6 minutes). Please try again."
					);
				}
				throw error;
			}
		}
	);
}
