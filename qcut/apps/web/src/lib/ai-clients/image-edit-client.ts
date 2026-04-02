/**
 * Image Editing API Client for FAL.ai Models
 * Supports SeedEdit v3, FLUX Pro Kontext, FLUX Pro Kontext Max, FLUX 2 Flex Edit,
 * SeedDream v4, Nano Banana, Nano Banana 2, Reve Edit, and Gemini 3 Pro Edit
 */

import { handleAIServiceError } from "../debug/error-handler";
import {
	UPSCALE_MODEL_ENDPOINTS,
	type UpscaleModelId,
} from "../ai-models/upscale-models";
import {
	getModelCapabilities,
	type ImageEditModelId,
	type ModelCapability,
	MODEL_CAPABILITIES,
	IMAGE_EDIT_MODEL_IDS,
} from "./image-edit-capabilities";
import { getFalApiKey, generateJobId, FAL_API_BASE } from "./image-edit-utils";
import { pollImageEditStatus } from "./image-edit-polling";
import type {
	ImageEditResponse,
	ImageEditProgressCallback,
} from "./image-edit-types";

// Re-export capabilities for convenience
export {
	getModelCapabilities,
	type ImageEditModelId,
	type ModelCapability,
	MODEL_CAPABILITIES,
	IMAGE_EDIT_MODEL_IDS,
} from "./image-edit-capabilities";

// Barrel re-exports from extracted modules
export { getFalApiKey, generateJobId } from "./image-edit-utils";
export {
	pollImageEditStatus,
	mapEditStatusToProgress,
	sleep,
} from "./image-edit-polling";
export { getImageEditModels } from "./image-edit-models-info";
export type {
	ImageEditResponse,
	ImageEditProgressCallback,
} from "./image-edit-types";

export interface ImageEditRequest {
	/** @deprecated Use imageUrls instead for multi-image support */
	imageUrl?: string;
	/** Array of image URLs - supports multi-image models */
	imageUrls?: string[];
	prompt: string;
	model: ImageEditModelId;
	guidanceScale?: number;
	steps?: number;
	seed?: number;
	safetyTolerance?: number;
	numImages?: number;

	// New V4-specific parameters
	imageSize?: string | number; // String presets ("square_hd", "square", etc.) or custom pixel values for V4
	maxImages?: number; // 1-10 for V4
	syncMode?: boolean; // V4, Nano Banana, Reve Edit, and Gemini 3 Pro Edit
	enableSafetyChecker?: boolean; // V4
	outputFormat?: "jpeg" | "png" | "webp"; // Nano Banana, Reve Edit, and Gemini 3 Pro Edit (lowercase required by FAL API)

	// Gemini 3 Pro Edit / Nano Banana 2 specific parameters
	resolution?: "0.5K" | "1K" | "2K" | "4K";
	aspectRatio?: string; // auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16

	// Nano Banana 2 specific parameters
	enableWebSearch?: boolean;
	limitGenerations?: boolean;

	// GPT Image 1.5 Edit specific parameters
	background?: "auto" | "transparent" | "opaque";
	inputFidelity?: "low" | "high";
	quality?: "low" | "medium" | "high";
}

export interface ImageUpscaleRequest {
	imageUrl: string;
	model: UpscaleModelId;
	scaleFactor?: number;
	denoise?: number;
	creativity?: number;
	overlappingTiles?: boolean;
	outputFormat?: "png" | "jpeg" | "webp";
}

interface ModelEndpoint {
	endpoint: string;
	defaultParams: Record<string, any>;
}

export const MODEL_ENDPOINTS: Record<string, ModelEndpoint> = {
	"seededit": {
		endpoint: "fal-ai/bytedance/seededit/v3/edit-image",
		defaultParams: {
			guidance_scale: 1.0,
		},
	},
	"flux-kontext": {
		endpoint: "fal-ai/flux-pro/kontext",
		defaultParams: {
			guidance_scale: 3.5,
			num_inference_steps: 28,
			safety_tolerance: 2,
			num_images: 1,
		},
	},
	"flux-kontext-max": {
		endpoint: "fal-ai/flux-pro/kontext/max",
		defaultParams: {
			guidance_scale: 3.5,
			num_inference_steps: 28,
			safety_tolerance: 2,
			num_images: 1,
		},
	},

	// Add new SeedDream V4 endpoint
	"seeddream-v4": {
		endpoint: "fal-ai/bytedance/seedream/v4/edit",
		defaultParams: {
			image_size: "square_hd",
			max_images: 1,
			sync_mode: false,
			enable_safety_checker: true,
			num_images: 1,
		},
	},

	// Add SeedDream V4.5 Edit endpoint
	"seeddream-v4-5-edit": {
		endpoint: "fal-ai/bytedance/seedream/v4.5/edit",
		defaultParams: {
			image_size: "auto_2K",
			max_images: 1,
			sync_mode: false,
			enable_safety_checker: true,
			num_images: 1,
		},
	},

	// Add Nano Banana endpoint
	"nano-banana": {
		endpoint: "fal-ai/nano-banana/edit",
		defaultParams: {
			num_images: 1,
			output_format: "png",
			sync_mode: false,
		},
	},

	// Add Nano Banana 2 endpoint (Google's latest image editing model)
	"nano-banana-2": {
		endpoint: "fal-ai/nano-banana-2/edit",
		defaultParams: {
			num_images: 1,
			output_format: "png",
			resolution: "1K",
			aspect_ratio: "auto",
			sync_mode: true,
		},
	},

	// Add Reve Edit endpoint
	"reve-edit": {
		endpoint: "fal-ai/reve/edit",
		defaultParams: {
			num_images: 1,
			output_format: "png",
			sync_mode: false,
		},
	},

	// Add Gemini 3 Pro Edit endpoint
	"gemini-3-pro-edit": {
		endpoint: "fal-ai/gemini-3-pro-image-preview/edit",
		defaultParams: {
			num_images: 1,
			output_format: "png",
			resolution: "1K",
			aspect_ratio: "auto",
			sync_mode: false,
		},
	},

	// Add FLUX 2 Flex Edit endpoint
	"flux-2-flex-edit": {
		endpoint: "fal-ai/flux-2-flex/edit",
		defaultParams: {
			guidance_scale: 3.5,
			num_inference_steps: 28,
			safety_tolerance: 2,
			enable_prompt_expansion: true,
			num_images: 1,
			output_format: "jpeg",
			sync_mode: false,
		},
	},

	// Phota Edit endpoint
	"phota-edit": {
		endpoint: "fal-ai/phota/edit",
		defaultParams: {
			num_images: 1,
			resolution: "1K",
			aspect_ratio: "auto",
			output_format: "jpeg",
		},
	},

	// Wan 2.7 Edit endpoint
	"wan-v2-7-edit": {
		endpoint: "fal-ai/wan/v2.7/edit",
		defaultParams: {
			image_size: "square_hd",
			num_images: 1,
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},
	},

	// Wan 2.7 Pro Edit endpoint
	"wan-v2-7-pro-edit": {
		endpoint: "fal-ai/wan/v2.7/pro/edit",
		defaultParams: {
			image_size: "square_hd",
			num_images: 1,
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},
	},

	// GPT Image 1.5 Edit endpoint
	"gpt-image-1-5-edit": {
		endpoint: "fal-ai/gpt-image-1.5/edit",
		defaultParams: {
			image_size: "auto",
			background: "auto",
			quality: "high",
			input_fidelity: "high",
			num_images: 1,
			output_format: "png",
			sync_mode: false,
		},
	},

	// Upscale models
	"crystal-upscaler": {
		endpoint: UPSCALE_MODEL_ENDPOINTS["crystal-upscaler"],
		defaultParams: {
			scale_factor: 4,
			denoise: 0.45,
			output_format: "png",
		},
	},
	"seedvr-upscale": {
		endpoint: UPSCALE_MODEL_ENDPOINTS["seedvr-upscale"],
		defaultParams: {
			scale_factor: 6,
			denoise: 0.35,
			creativity: 0.4,
			output_format: "png",
		},
	},
	"topaz-upscale": {
		endpoint: UPSCALE_MODEL_ENDPOINTS["topaz-upscale"],
		defaultParams: {
			scale_factor: 6,
			denoise: 0.25,
			overlapping_tiles: true,
			output_format: "png",
		},
	},
};

/**
 * Upload image to FAL.ai and get URL
 */
export async function uploadImageToFAL(imageFile: File): Promise<string> {
	const apiKey = await getFalApiKey();
	if (!apiKey) {
		throw new Error(
			"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
		);
	}

	console.log("📤 UPLOAD: Starting upload process for:", {
		fileName: imageFile.name,
		fileSize: imageFile.size,
		fileType: imageFile.type,
	});

	// Use base64 data URL as primary method (reliable and fast)
	console.log("🔄 UPLOAD: Using base64 data URL (primary method)...");
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result) {
				let dataUrl = reader.result as string;

				// Fix malformed MIME type if needed
				if (dataUrl.startsWith("data:image;base64,")) {
					// Determine proper MIME type from file type or default to PNG
					const mimeType = imageFile.type || "image/png";
					const base64Data = dataUrl.split(",")[1];
					dataUrl = `data:${mimeType};base64,${base64Data}`;
					console.log("🔧 UPLOAD: Fixed MIME type in data URL");
				}

				console.log(
					"✅ UPLOAD: Image successfully converted to base64 data URL for FAL API"
				);
				console.log("🔍 UPLOAD: Data URL format:", {
					type: typeof dataUrl,
					length: dataUrl.length,
					startsWithData: dataUrl.startsWith("data:"),
					prefix: dataUrl.substring(0, 30),
					mimeType: dataUrl.split(";")[0],
				});
				resolve(dataUrl);
			} else {
				reject(new Error("Failed to convert image to base64"));
			}
		};
		reader.onerror = () => reject(new Error("Failed to read image file"));
		reader.readAsDataURL(imageFile);
	});
}

/**
 * Upload multiple images to FAL.ai in parallel
 * @param imageFiles - Array of File objects to upload
 * @param onProgress - Optional callback for upload progress
 * @returns Promise resolving to array of uploaded image URLs
 */
export async function uploadImagesToFAL(
	imageFiles: File[],
	onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
	if (imageFiles.length === 0) {
		return [];
	}

	const total = imageFiles.length;
	let completed = 0;

	const uploadPromises = imageFiles.map(async (file) => {
		const url = await uploadImageToFAL(file);
		completed++;
		onProgress?.(completed, total);
		return url;
	});

	// Upload in parallel for better performance
	const results = await Promise.all(uploadPromises);

	console.log(`✅ UPLOAD: Successfully uploaded ${results.length} images`);
	return results;
}

/**
 * Edit image using specified model
 */
export async function editImage(
	request: ImageEditRequest,
	onProgress?: ImageEditProgressCallback
): Promise<ImageEditResponse> {
	const apiKey = await getFalApiKey();
	if (!apiKey) {
		throw new Error(
			"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
		);
	}

	const modelConfig = MODEL_ENDPOINTS[request.model];
	if (!modelConfig) {
		throw new Error(`Unsupported model: ${request.model}`);
	}

	const startTime = Date.now();
	const jobId = generateJobId();

	// Build request payload
	const payload: any = {
		prompt: request.prompt,
		...modelConfig.defaultParams,
	};

	// Handle image URL(s) based on model capabilities
	const capabilities = getModelCapabilities(request.model);

	// Normalize to array format (support both imageUrl and imageUrls)
	const imageUrlsArray: string[] = request.imageUrls
		? request.imageUrls
		: request.imageUrl
			? [request.imageUrl]
			: [];

	// Validate image count
	if (imageUrlsArray.length === 0) {
		throw new Error("At least one image URL is required");
	}

	if (imageUrlsArray.length > capabilities.maxImages) {
		console.warn(
			`Model ${request.model} supports max ${capabilities.maxImages} images, ` +
				`but ${imageUrlsArray.length} provided. Using first ${capabilities.maxImages}.`
		);
	}

	// Apply model-appropriate payload format
	if (capabilities.supportsMultiple) {
		// Multi-image models use image_urls array
		payload.image_urls = imageUrlsArray.slice(0, capabilities.maxImages);
	} else {
		// Single-image models use image_url string
		payload.image_url = imageUrlsArray[0];
	}

	// Override with user-specified parameters
	if (request.guidanceScale !== undefined) {
		payload.guidance_scale = request.guidanceScale;
	}
	if (request.steps !== undefined) {
		payload.num_inference_steps = request.steps;
	}
	if (request.seed !== undefined) {
		payload.seed = request.seed;
	}
	if (request.safetyTolerance !== undefined) {
		payload.safety_tolerance = request.safetyTolerance;
	}
	if (request.numImages !== undefined) {
		payload.num_images = request.numImages;
	}

	// Add new V4-specific parameters
	if (request.imageSize !== undefined) {
		payload.image_size = request.imageSize;
	}
	if (request.maxImages !== undefined) {
		payload.max_images = request.maxImages;
	}
	if (request.syncMode !== undefined) {
		payload.sync_mode = request.syncMode;
	}
	if (request.enableSafetyChecker !== undefined) {
		payload.enable_safety_checker = request.enableSafetyChecker;
	}

	// Add Nano Banana-specific parameters
	if (request.outputFormat !== undefined) {
		payload.output_format = request.outputFormat;
	}

	// Gemini 3 Pro Edit specific parameters
	if (request.resolution !== undefined) {
		payload.resolution = request.resolution;
	}
	if (request.aspectRatio !== undefined) {
		payload.aspect_ratio = request.aspectRatio;
	}

	// Nano Banana 2 specific parameters
	if (request.model === "nano-banana-2") {
		if (request.enableWebSearch !== undefined) {
			payload.enable_web_search = request.enableWebSearch;
		}
		if (request.limitGenerations !== undefined) {
			payload.limit_generations = request.limitGenerations;
		}
	}

	// GPT Image 1.5 Edit specific parameters
	if (request.model === "gpt-image-1-5-edit") {
		if (request.background !== undefined) {
			payload.background = request.background;
		}
		if (request.inputFidelity !== undefined) {
			payload.input_fidelity = request.inputFidelity;
		}
		if (request.quality !== undefined) {
			payload.quality = request.quality;
		}
	}

	console.log(`🎨 Editing image with ${request.model}:`, {
		...payload,
		image_url: payload.image_url?.substring(0, 50) + "..." || "N/A", // Truncate for readability
		image_urls:
			payload.image_urls?.map((url: string) => url.substring(0, 50) + "...") ||
			"N/A", // For V4/Nano Banana
	});

	// Debug: Check the actual format of the image URL(s)
	const imageUrl = payload.image_url || payload.image_urls?.[0];
	console.log("🔍 DEBUG: Image URL details:", {
		type: typeof imageUrl,
		length: imageUrl?.length,
		startsWithData: imageUrl?.startsWith("data:"),
		startsWithHttps: imageUrl?.startsWith("https:"),
		firstChars: imageUrl?.substring(0, 20),
		hasImageUrls: !!payload.image_urls,
		imageUrlsLength: payload.image_urls?.length || 0,
	});

	if (onProgress) {
		onProgress({
			status: "queued",
			progress: 0,
			message: "Submitting to FAL.ai...",
			elapsedTime: 0,
		});
	}

	try {
		// Try queue mode first
		const ctrl = new AbortController();
		const timeout = setTimeout(() => ctrl.abort(), 180_000); // 3 minute timeout

		const response = await fetch(`${FAL_API_BASE}/${modelConfig.endpoint}`, {
			method: "POST",
			headers: {
				"Authorization": `Key ${apiKey}`,
				"Content-Type": "application/json",
				"X-Fal-Queue": "true",
			},
			body: JSON.stringify(payload),
			signal: ctrl.signal,
		});

		clearTimeout(timeout);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			handleAIServiceError(
				new Error(`FAL API Error: ${response.status}`),
				"FAL AI image edit request",
				{
					status: response.status,
					statusText: response.statusText,
					errorData,
					endpoint: modelConfig.endpoint,
					model: request.model,
					operation: "editImage",
				}
			);

			// Handle content policy violations (422 errors) with user-friendly messages
			if (
				response.status === 422 &&
				errorData.detail &&
				Array.isArray(errorData.detail)
			) {
				const contentPolicyError = errorData.detail.find(
					(error: any) => error.type === "content_policy_violation"
				);

				if (contentPolicyError) {
					throw new Error(
						"Content policy violation: Please use appropriate language for image descriptions"
					);
				}
			}

			// Handle other error types with original logic
			const errorMessage = errorData.detail
				? typeof errorData.detail === "string"
					? errorData.detail
					: JSON.stringify(errorData.detail)
				: errorData.message || response.statusText;
			throw new Error(`API error: ${response.status} - ${errorMessage}`);
		}

		const result = await response.json();
		console.log("✅ FAL API response:", JSON.stringify(result, null, 2));

		// Check if we got a direct result or need to poll
		if (result.request_id) {
			// Queue mode - poll for results
			console.log("📋 Using queue mode with request_id:", result.request_id);
			return await pollImageEditStatus(
				result.request_id,
				modelConfig.endpoint,
				startTime,
				onProgress,
				jobId,
				request.model
			);
		}
		if (result.images && result.images.length > 0) {
			// Direct mode - return immediately
			console.log("🎯 Using direct mode with images:", result.images.length);
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Image editing completed!",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return {
				job_id: jobId,
				status: "completed",
				message: "Image edited successfully",
				result_url: result.images[0].url,
				seed_used: result.seed,
				processing_time: Math.floor((Date.now() - startTime) / 1000),
			};
		}
		if (result.image && result.image.url) {
			// Alternative direct mode format - single image object
			console.log("🎯 Using direct mode with single image object");
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Image editing completed!",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return {
				job_id: jobId,
				status: "completed",
				message: "Image edited successfully",
				result_url: result.image.url,
				seed_used: result.seed,
				processing_time: Math.floor((Date.now() - startTime) / 1000),
			};
		}
		if (result.url) {
			// Alternative direct mode format - URL at root level
			console.log("🎯 Using direct mode with root URL");
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Image editing completed!",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return {
				job_id: jobId,
				status: "completed",
				message: "Image edited successfully",
				result_url: result.url,
				seed_used: result.seed,
				processing_time: Math.floor((Date.now() - startTime) / 1000),
			};
		}
		const error = new Error(
			`Unexpected response format from FAL API. Response keys: ${Object.keys(result).join(", ")}`
		);
		handleAIServiceError(error, "Parse FAL AI image edit response", {
			hasRequestId: !!result.request_id,
			hasImages: !!result.images,
			hasImageObject: !!result.image,
			hasUrlRoot: !!result.url,
			keys: Object.keys(result),
			model: request.model,
			operation: "parseEditResponse",
		});
		throw new Error(
			`Unexpected response format from FAL API. Response keys: ${Object.keys(result).join(", ")}`
		);
	} catch (error) {
		// Handle timeout errors specifically
		let errorMessage = "Unknown error";
		if (error instanceof Error) {
			if (error.name === "AbortError") {
				errorMessage =
					"Request timeout - the image editing service took too long to respond";
			} else {
				errorMessage = error.message;
			}
		}

		if (onProgress) {
			onProgress({
				status: "failed",
				progress: 0,
				message: errorMessage,
				elapsedTime: Math.floor((Date.now() - startTime) / 1000),
			});
		}
		throw error;
	}
}

/**
 * Upscale image using dedicated upscale models
 */
export async function upscaleImage(
	request: ImageUpscaleRequest,
	onProgress?: ImageEditProgressCallback
): Promise<ImageEditResponse> {
	const apiKey = await getFalApiKey();
	if (!apiKey) {
		throw new Error(
			"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
		);
	}

	const modelConfig = MODEL_ENDPOINTS[request.model];
	if (!modelConfig) {
		throw new Error(`Unsupported upscale model: ${request.model}`);
	}

	const startTime = Date.now();
	const jobId = generateJobId("upscale");

	const payload: Record<string, any> = {
		image_url: request.imageUrl,
		...modelConfig.defaultParams,
	};

	if (request.scaleFactor !== undefined) {
		payload.scale_factor = request.scaleFactor;
	}
	if (request.denoise !== undefined) {
		payload.denoise = request.denoise;
	}
	if (request.creativity !== undefined) {
		payload.creativity = request.creativity;
	}
	if (request.overlappingTiles !== undefined) {
		payload.overlapping_tiles = request.overlappingTiles;
	}
	if (request.outputFormat) {
		payload.output_format = request.outputFormat;
	}

	if (onProgress) {
		onProgress({
			status: "queued",
			progress: 0,
			message: "Submitting upscale request to FAL.ai...",
			elapsedTime: 0,
		});
	}

	try {
		const ctrl = new AbortController();
		const timeout = setTimeout(() => ctrl.abort(), 60_000);

		const response = await fetch(`${FAL_API_BASE}/${modelConfig.endpoint}`, {
			method: "POST",
			headers: {
				"Authorization": `Key ${apiKey}`,
				"Content-Type": "application/json",
				"X-Fal-Queue": "true",
			},
			body: JSON.stringify(payload),
			signal: ctrl.signal,
		});

		clearTimeout(timeout);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			handleAIServiceError(
				new Error(`FAL API Error: ${response.status}`),
				"FAL AI image upscale request",
				{
					status: response.status,
					statusText: response.statusText,
					errorData,
					endpoint: modelConfig.endpoint,
					model: request.model,
					operation: "upscaleImage",
				}
			);

			const errorMessage =
				errorData.detail && typeof errorData.detail === "string"
					? errorData.detail
					: errorData.message || response.statusText;
			throw new Error(
				`Upscale API error: ${response.status} - ${errorMessage}`
			);
		}

		const result = await response.json();
		if (result.request_id) {
			return await pollImageEditStatus(
				result.request_id,
				modelConfig.endpoint,
				startTime,
				onProgress,
				jobId,
				request.model
			);
		}

		const completedImage =
			result.images?.[0]?.url || result.image?.url || result.result_url;
		if (completedImage) {
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Upscale completed",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return {
				job_id: jobId,
				status: "completed",
				message: "Upscale completed",
				result_url: completedImage,
				processing_time: Math.floor((Date.now() - startTime) / 1000),
			};
		}

		throw new Error("Upscale response did not include an image URL");
	} catch (error) {
		handleAIServiceError(error, "FAL AI image upscaling", {
			model: request.model,
			endpoint: modelConfig.endpoint,
			operation: "upscaleImage",
		});

		if (onProgress) {
			onProgress({
				status: "failed",
				progress: 0,
				message:
					error instanceof Error
						? error.message
						: "Upscaling failed unexpectedly",
				elapsedTime: Math.floor((Date.now() - startTime) / 1000),
			});
		}

		throw error;
	}
}
