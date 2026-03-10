/**
 * Image Generators
 *
 * Functions for generating and editing images using AI models.
 * Currently supports Seeddream 4.5 text-to-image and edit.
 */

import { platform } from "@qcut/platform-core";
import { handleAIServiceError } from "@/lib/debug/error-handler";
import type {
	Seeddream45ImageSize,
	Seeddream45TextToImageParams,
	Seeddream45EditParams,
} from "@/components/editor/media-panel/views/ai/types/ai-types";
import { ERROR_MESSAGES } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	getFalApiKey,
	getFalApiKeyAsync,
	FAL_API_BASE,
} from "../core/fal-request";

// Re-export for convenience (using export from pattern)
export type {
	Seeddream45TextToImageParams,
	Seeddream45EditParams,
} from "@/components/editor/media-panel/views/ai/types/ai-types";

/**
 * Seeddream 4.5 image generation result
 */
export interface Seeddream45ImageResult {
	images: Array<{
		url: string;
		content_type: string;
		file_name: string;
		file_size: number;
		width: number;
		height: number;
	}>;
	seed: number;
}

/** @deprecated Use Seeddream45TextToImageParams instead */
export type Seeddream45GenerateParams = Seeddream45TextToImageParams;

/**
 * Generate images using Seeddream 4.5 text-to-image model
 *
 * @example
 * ```typescript
 * const result = await generateSeeddream45Image({
 *   prompt: "A serene mountain landscape at sunset",
 *   image_size: "auto_2K",
 *   num_images: 1,
 * });
 * ```
 */
export async function generateSeeddream45Image(
	params: Seeddream45GenerateParams
): Promise<Seeddream45ImageResult> {
	try {
		const apiKey = await getFalApiKeyAsync();
		if (!apiKey) {
			throw new Error(
				"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
			);
		}

		const endpoint = "fal-ai/bytedance/seedream/v4.5/text-to-image";

		const input = {
			prompt: params.prompt,
			image_size: params.image_size ?? "auto_2K",
			num_images: params.num_images ?? 1,
			max_images: params.max_images ?? 1,
			sync_mode: params.sync_mode ?? false,
			enable_safety_checker: params.enable_safety_checker ?? true,
			...(params.seed !== undefined && { seed: params.seed }),
		};

		console.log("🎨 [Seeddream 4.5] Starting text-to-image generation...");
		console.log(`📝 Prompt: ${params.prompt.slice(0, 50)}...`);

		const response = await fetch(`${FAL_API_BASE}/${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Key ${apiKey}`,
			},
			body: JSON.stringify(input),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`${ERROR_MESSAGES.SEEDDREAM45_GENERATION_FAILED}: ${response.status} - ${errorText}`
			);
		}

		const result = await response.json();
		console.log(
			`✅ [Seeddream 4.5] Generation complete: ${result.images?.length || 0} images`
		);

		return result;
	} catch (error) {
		handleAIServiceError(error, "Generate Seeddream 4.5 image", {
			operation: "generateSeeddream45Image",
			prompt: params.prompt.slice(0, 100),
		});
		throw error;
	}
}

/**
 * Edit images using Seeddream 4.5 edit model
 * Supports up to 10 input images for multi-image compositing
 *
 * @example
 * ```typescript
 * // Single image edit
 * const result = await editSeeddream45Image({
 *   prompt: "Replace the background with a beach sunset",
 *   image_urls: ["https://fal.ai/storage/uploaded-image.png"],
 * });
 *
 * // Multi-image compositing
 * const result = await editSeeddream45Image({
 *   prompt: "Replace the product in Figure 1 with the product from Figure 2",
 *   image_urls: [
 *     "https://fal.ai/storage/scene.png",
 *     "https://fal.ai/storage/product.png"
 *   ],
 * });
 * ```
 */
export async function editSeeddream45Image(
	params: Seeddream45EditParams
): Promise<Omit<Seeddream45ImageResult, "seed">> {
	try {
		const apiKey = await getFalApiKeyAsync();
		if (!apiKey) {
			throw new Error(
				"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
			);
		}

		// Validate image_urls
		if (!params.image_urls || params.image_urls.length === 0) {
			throw new Error(ERROR_MESSAGES.SEEDDREAM45_EDIT_NO_IMAGES);
		}
		if (params.image_urls.length > 10) {
			throw new Error(ERROR_MESSAGES.SEEDDREAM45_EDIT_TOO_MANY_IMAGES);
		}

		const endpoint = "fal-ai/bytedance/seedream/v4.5/edit";

		const input = {
			prompt: params.prompt,
			image_urls: params.image_urls,
			image_size: params.image_size ?? "auto_2K",
			num_images: params.num_images ?? 1,
			max_images: params.max_images ?? 1,
			sync_mode: params.sync_mode ?? false,
			enable_safety_checker: params.enable_safety_checker ?? true,
			...(params.seed !== undefined && { seed: params.seed }),
		};

		console.log("🎨 [Seeddream 4.5 Edit] Starting image edit...");
		console.log(`📝 Prompt: ${params.prompt.slice(0, 50)}...`);
		console.log(`🖼️ Input images: ${params.image_urls.length}`);

		const response = await fetch(`${FAL_API_BASE}/${endpoint}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Key ${apiKey}`,
			},
			body: JSON.stringify(input),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`${ERROR_MESSAGES.SEEDDREAM45_GENERATION_FAILED}: ${response.status} - ${errorText}`
			);
		}

		const result = await response.json();
		console.log(
			`✅ [Seeddream 4.5 Edit] Edit complete: ${result.images?.length || 0} images`
		);

		return result;
	} catch (error) {
		handleAIServiceError(error, "Edit Seeddream 4.5 image", {
			operation: "editSeeddream45Image",
			prompt: params.prompt.slice(0, 100),
			imageCount: params.image_urls?.length ?? 0,
		});
		throw error;
	}
}

/**
 * Upload image to FAL storage for use with Seeddream 4.5 edit
 * Uses Electron IPC to bypass CORS restrictions
 *
 * @param imageFile - Image file to upload
 * @returns FAL storage URL for use in image_urls
 */
export async function uploadImageForSeeddream45Edit(
	imageFile: File
): Promise<string> {
	try {
		const apiKey = await getFalApiKeyAsync();
		if (!apiKey) {
			throw new Error(
				"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
			);
		}

		// Use Electron IPC upload if available (bypasses CORS)
		if (platform().fal?.uploadImage) {
			console.log(
				`📤 [Seeddream 4.5] Uploading image via Electron IPC: ${imageFile.name}`
			);

			const arrayBuffer = await imageFile.arrayBuffer();
			const result = await platform().fal.uploadImage(
				new Uint8Array(arrayBuffer),
				imageFile.name,
				apiKey
			);

			if (!result.success || !result.url) {
				throw new Error(
					result.error ?? ERROR_MESSAGES.SEEDDREAM45_UPLOAD_FAILED
				);
			}

			console.log(`✅ [Seeddream 4.5] Image uploaded: ${result.url}`);
			return result.url;
		}

		// Fallback: Direct upload (may hit CORS in browser)
		throw new Error(
			"Image upload requires Electron. Please run in the desktop app."
		);
	} catch (error) {
		handleAIServiceError(error, "Upload image for Seeddream 4.5 edit", {
			operation: "uploadImageForSeeddream45Edit",
			fileName: imageFile.name,
			fileSize: imageFile.size,
		});
		throw error;
	}
}
