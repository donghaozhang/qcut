/**
 * SAM-3 Segmentation Client
 *
 * WHY this client:
 * - Centralized FAL API integration for SAM-3 segmentation
 * - Handles authentication, queue polling, and error recovery
 * - Follows pattern from video-edit-client.ts and image-edit-client.ts
 *
 * Performance: Direct client-to-FAL reduces latency vs backend proxy
 *
 * @module Sam3Client
 */

import { platform } from "@qcut/platform-core";
import { handleAIServiceError } from "../debug/error-handler";
import { debugLogger } from "../debug/debug-logger";
import type {
	Sam3Input,
	Sam3Output,
	Sam3PointPrompt,
	Sam3BoxPrompt,
	Sam3ProgressCallback,
	Sam3VideoInput,
	Sam3VideoOutput,
	Sam3VideoProgressCallback,
} from "@/types/sam3";

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;
const FAL_API_BASE = "https://fal.run";
const SAM3_ENDPOINT = "fal-ai/sam-3/image";
const SAM3_VIDEO_ENDPOINT = "fal-ai/sam-3/video";
const SAM3_LOG_COMPONENT = "Sam3Client";

/**
 * SAM-3 Segmentation Client
 * Singleton pattern for consistent FAL configuration
 */
class Sam3Client {
	private apiKey: string | null = null;

	// Note: API key initialization is deferred to ensureApiKey() for proper async handling.
	// Constructors cannot await async methods, so we rely on ensureApiKey() being called
	// at the start of each public method.

	/**
	 * Initialize API key from environment or Electron storage
	 */
	private async initializeApiKey(): Promise<void> {
		// Try environment variable first
		this.apiKey = FAL_API_KEY || null;

		// Try Electron API if available
		if (!this.apiKey) {
			try {
				const keys = await platform().apiKeys.get();
				if (keys?.falApiKey) {
					this.apiKey = keys.falApiKey;
				}
			} catch (error) {
				debugLogger.error(
					SAM3_LOG_COMPONENT,
					"API_KEY_LOAD_FAILED",
					error as Error
				);
			}
		}
	}

	/**
	 * Ensure API key is available before making API calls
	 * @throws Error if API key is not configured after initialization attempt
	 */
	private async ensureApiKey(): Promise<void> {
		if (!this.apiKey) {
			await this.initializeApiKey();
		}
		if (!this.apiKey) {
			throw new Error(
				"FAL API key not configured. Set VITE_FAL_API_KEY or configure in Settings."
			);
		}
	}

	/**
	 * Segment image with SAM-3
	 *
	 * @param input - SAM-3 input parameters
	 * @param onProgress - Optional progress callback
	 * @returns Segmentation output with masks
	 */
	async segmentImage(
		input: Sam3Input,
		onProgress?: Sam3ProgressCallback
	): Promise<Sam3Output> {
		await this.ensureApiKey();

		const startTime = Date.now();

		debugLogger.log(SAM3_LOG_COMPONENT, "SEGMENT_START", {
			hasTextPrompt: !!input.text_prompt,
			pointCount: input.prompts?.length || 0,
			boxCount: input.box_prompts?.length || 0,
		});

		if (onProgress) {
			onProgress({
				status: "queued",
				progress: 0,
				message: "Submitting to SAM-3...",
				elapsedTime: 0,
			});
		}

		try {
			const response = await fetch(`${FAL_API_BASE}/${SAM3_ENDPOINT}`, {
				method: "POST",
				headers: {
					Authorization: `Key ${this.apiKey}`,
					"Content-Type": "application/json",
					"X-Fal-Queue": "true",
				},
				body: JSON.stringify(input),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				handleAIServiceError(
					new Error(`SAM-3 API Error: ${response.status}`),
					"SAM-3 segmentation request",
					{ status: response.status, errorData }
				);
				throw new Error(
					`API error: ${response.status} - ${errorData.detail || response.statusText}`
				);
			}

			const result = await response.json();

			// Handle queue mode
			if (result.request_id) {
				return await this.pollForResult(
					result.request_id,
					startTime,
					onProgress
				);
			}

			// Direct result
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Segmentation complete",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return result as Sam3Output;
		} catch (error) {
			handleAIServiceError(error, "SAM-3 segmentation", {
				operation: "segmentImage",
			});
			throw error;
		}
	}

	/**
	 * Poll for queued job result from FAL API
	 * @param requestId - The FAL queue request ID to poll
	 * @param startTime - Timestamp when the request started (for elapsed time calculation)
	 * @param onProgress - Optional callback for progress updates
	 * @returns The segmentation output when completed
	 * @throws Error if polling times out or the job fails
	 */
	private async pollForResult(
		requestId: string,
		startTime: number,
		onProgress?: Sam3ProgressCallback
	): Promise<Sam3Output> {
		const maxAttempts = 60; // 5 minutes max
		let attempts = 0;

		while (attempts < maxAttempts) {
			attempts++;
			const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

			try {
				const statusResponse = await fetch(
					`${FAL_API_BASE}/queue/requests/${requestId}/status`,
					{
						headers: { Authorization: `Key ${this.apiKey}` },
					}
				);

				if (!statusResponse.ok) {
					await this.sleep(5000);
					continue;
				}

				const status = await statusResponse.json();

				if (onProgress) {
					onProgress({
						status: status.status === "IN_PROGRESS" ? "processing" : "queued",
						progress: Math.min(90, 10 + attempts * 3),
						message:
							status.status === "IN_PROGRESS"
								? "Processing..."
								: `Queued (position: ${status.queue_position || "unknown"})`,
						elapsedTime,
					});
				}

				if (status.status === "COMPLETED") {
					const resultResponse = await fetch(
						`${FAL_API_BASE}/queue/requests/${requestId}`,
						{
							headers: { Authorization: `Key ${this.apiKey}` },
						}
					);

					if (resultResponse.ok) {
						const result = await resultResponse.json();

						if (onProgress) {
							onProgress({
								status: "completed",
								progress: 100,
								message: "Segmentation complete",
								elapsedTime,
							});
						}

						return result as Sam3Output;
					}
				}

				if (status.status === "FAILED") {
					throw new Error(status.error || "Segmentation failed");
				}

				await this.sleep(5000);
			} catch (error) {
				if (attempts >= maxAttempts) {
					throw new Error(
						"Segmentation timeout - maximum polling attempts reached"
					);
				}
				await this.sleep(5000);
			}
		}

		throw new Error("Maximum polling attempts reached");
	}

	/**
	 * Convenience method to segment an image using a text prompt
	 * @param imageUrl - URL of the image to segment
	 * @param textPrompt - Text description of the object to segment (e.g., "person", "car")
	 * @param options - Optional additional SAM-3 parameters
	 * @returns Segmentation output with masks
	 */
	async segmentWithText(
		imageUrl: string,
		textPrompt: string,
		options?: Partial<Omit<Sam3Input, "image_url" | "text_prompt">>
	): Promise<Sam3Output> {
		return this.segmentImage({
			image_url: imageUrl,
			text_prompt: textPrompt,
			...options,
		});
	}

	/**
	 * Convenience method to segment an image using point prompts
	 * @param imageUrl - URL of the image to segment
	 * @param points - Array of point prompts with x, y coordinates and label (0=background, 1=foreground)
	 * @param options - Optional additional SAM-3 parameters
	 * @returns Segmentation output with masks
	 */
	async segmentWithPoints(
		imageUrl: string,
		points: Sam3PointPrompt[],
		options?: Partial<Omit<Sam3Input, "image_url" | "prompts">>
	): Promise<Sam3Output> {
		return this.segmentImage({
			image_url: imageUrl,
			prompts: points,
			...options,
		});
	}

	/**
	 * Convenience method to segment an image using a bounding box prompt
	 * @param imageUrl - URL of the image to segment
	 * @param box - Box prompt with x_min, y_min, x_max, y_max coordinates
	 * @param options - Optional additional SAM-3 parameters
	 * @returns Segmentation output with masks
	 */
	async segmentWithBox(
		imageUrl: string,
		box: Sam3BoxPrompt,
		options?: Partial<Omit<Sam3Input, "image_url" | "box_prompts">>
	): Promise<Sam3Output> {
		return this.segmentImage({
			image_url: imageUrl,
			box_prompts: [box],
			...options,
		});
	}

	/**
	 * Segment video with SAM-3
	 *
	 * @param input - SAM-3 video input parameters
	 * @param onProgress - Optional progress callback
	 * @returns Video segmentation output
	 */
	async segmentVideo(
		input: Sam3VideoInput,
		onProgress?: Sam3VideoProgressCallback
	): Promise<Sam3VideoOutput> {
		await this.ensureApiKey();

		const startTime = Date.now();

		debugLogger.log(SAM3_LOG_COMPONENT, "VIDEO_SEGMENT_START", {
			hasTextPrompt: !!input.text_prompt,
			pointCount: input.prompts?.length || 0,
			boxCount: input.box_prompts?.length || 0,
			detectionThreshold: input.detection_threshold,
		});

		if (onProgress) {
			onProgress({
				status: "queued",
				progress: 0,
				message: "Submitting video to SAM-3...",
				elapsedTime: 0,
			});
		}

		try {
			const response = await fetch(`${FAL_API_BASE}/${SAM3_VIDEO_ENDPOINT}`, {
				method: "POST",
				headers: {
					Authorization: `Key ${this.apiKey}`,
					"Content-Type": "application/json",
					"X-Fal-Queue": "true",
				},
				body: JSON.stringify(input),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				handleAIServiceError(
					new Error(`SAM-3 Video API Error: ${response.status}`),
					"SAM-3 video segmentation request",
					{ status: response.status, errorData }
				);
				throw new Error(
					`API error: ${response.status} - ${errorData.detail || response.statusText}`
				);
			}

			const result = await response.json();

			// Handle queue mode (video always uses queue)
			if (result.request_id) {
				return await this.pollForVideoResult(
					result.request_id,
					startTime,
					onProgress
				);
			}

			// Direct result (unlikely for video)
			if (onProgress) {
				onProgress({
					status: "completed",
					progress: 100,
					message: "Video segmentation complete",
					elapsedTime: Math.floor((Date.now() - startTime) / 1000),
				});
			}

			return result as Sam3VideoOutput;
		} catch (error) {
			handleAIServiceError(error, "SAM-3 video segmentation", {
				operation: "segmentVideo",
			});
			throw error;
		}
	}

	/**
	 * Poll for queued video job result
	 */
	private async pollForVideoResult(
		requestId: string,
		startTime: number,
		onProgress?: Sam3VideoProgressCallback
	): Promise<Sam3VideoOutput> {
		const maxAttempts = 120; // 10 minutes max for video
		let attempts = 0;

		while (attempts < maxAttempts) {
			attempts++;
			const elapsedTime = Math.floor((Date.now() - startTime) / 1000);

			try {
				const statusResponse = await fetch(
					`${FAL_API_BASE}/queue/requests/${requestId}/status`,
					{
						headers: { Authorization: `Key ${this.apiKey}` },
					}
				);

				if (!statusResponse.ok) {
					await this.sleep(5000);
					continue;
				}

				const status = await statusResponse.json();

				if (onProgress) {
					onProgress({
						status: status.status === "IN_PROGRESS" ? "processing" : "queued",
						progress: Math.min(90, 10 + attempts * 1.5),
						message:
							status.status === "IN_PROGRESS"
								? "Processing video frames..."
								: `Queued (position: ${status.queue_position || "unknown"})`,
						elapsedTime,
					});
				}

				if (status.status === "COMPLETED") {
					const resultResponse = await fetch(
						`${FAL_API_BASE}/queue/requests/${requestId}`,
						{
							headers: { Authorization: `Key ${this.apiKey}` },
						}
					);

					if (resultResponse.ok) {
						const result = await resultResponse.json();

						if (onProgress) {
							onProgress({
								status: "completed",
								progress: 100,
								message: "Video segmentation complete",
								elapsedTime,
							});
						}

						return result as Sam3VideoOutput;
					}
				}

				if (status.status === "FAILED") {
					throw new Error(status.error || "Video segmentation failed");
				}

				await this.sleep(5000);
			} catch (error) {
				if (attempts >= maxAttempts) {
					throw new Error(
						"Video segmentation timeout - maximum polling attempts reached"
					);
				}
				await this.sleep(5000);
			}
		}

		throw new Error("Maximum polling attempts reached");
	}

	/**
	 * Convenience: Segment video with text prompt
	 */
	async segmentVideoWithText(
		videoUrl: string,
		textPrompt: string,
		options?: Partial<Omit<Sam3VideoInput, "video_url" | "text_prompt">>
	): Promise<Sam3VideoOutput> {
		return this.segmentVideo({
			video_url: videoUrl,
			text_prompt: textPrompt,
			...options,
		});
	}

	/**
	 * Check if the SAM-3 client is properly configured with an API key
	 * @returns True if API key is available, false otherwise
	 */
	async isAvailable(): Promise<boolean> {
		await this.initializeApiKey();
		return !!this.apiKey;
	}

	/**
	 * Sleep for a specified duration
	 * @param ms - Duration to sleep in milliseconds
	 * @returns Promise that resolves after the specified duration
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/** Singleton instance of the SAM-3 client */
export const sam3Client = new Sam3Client();

/**
 * Segment an image using SAM-3 with full parameter control
 * @param input - SAM-3 input parameters including image URL and prompts
 * @param onProgress - Optional callback for progress updates during processing
 * @returns Segmentation output with masks and metadata
 */
export async function segmentImage(
	input: Sam3Input,
	onProgress?: Sam3ProgressCallback
): Promise<Sam3Output> {
	return sam3Client.segmentImage(input, onProgress);
}

/**
 * Segment an image using a text prompt
 * @param imageUrl - URL of the image to segment
 * @param textPrompt - Text description of the object to segment (e.g., "person", "car")
 * @param options - Optional additional SAM-3 parameters
 * @returns Segmentation output with masks
 */
export async function segmentWithText(
	imageUrl: string,
	textPrompt: string,
	options?: Partial<Omit<Sam3Input, "image_url" | "text_prompt">>
): Promise<Sam3Output> {
	return sam3Client.segmentWithText(imageUrl, textPrompt, options);
}

/**
 * Segment an image using point prompts (click-to-segment)
 * @param imageUrl - URL of the image to segment
 * @param points - Array of point prompts with x, y coordinates and label (0=background, 1=foreground)
 * @param options - Optional additional SAM-3 parameters
 * @returns Segmentation output with masks
 */
export async function segmentWithPoints(
	imageUrl: string,
	points: Sam3PointPrompt[],
	options?: Partial<Omit<Sam3Input, "image_url" | "prompts">>
): Promise<Sam3Output> {
	return sam3Client.segmentWithPoints(imageUrl, points, options);
}

/**
 * Segment an image using a bounding box prompt
 * @param imageUrl - URL of the image to segment
 * @param box - Box prompt with x_min, y_min, x_max, y_max coordinates
 * @param options - Optional additional SAM-3 parameters
 * @returns Segmentation output with masks
 */
export async function segmentWithBox(
	imageUrl: string,
	box: Sam3BoxPrompt,
	options?: Partial<Omit<Sam3Input, "image_url" | "box_prompts">>
): Promise<Sam3Output> {
	return sam3Client.segmentWithBox(imageUrl, box, options);
}

/**
 * Segment a video using SAM-3 with full parameter control
 * @param input - SAM-3 video input parameters
 * @param onProgress - Optional callback for progress updates during processing
 * @returns Video segmentation output with segmented video URL
 */
export async function segmentVideo(
	input: Sam3VideoInput,
	onProgress?: Sam3VideoProgressCallback
): Promise<Sam3VideoOutput> {
	return sam3Client.segmentVideo(input, onProgress);
}

/**
 * Segment a video using a text prompt
 * @param videoUrl - URL of the video to segment
 * @param textPrompt - Text description of the object to segment
 * @param options - Optional additional SAM-3 video parameters
 * @returns Video segmentation output with segmented video URL
 */
export async function segmentVideoWithText(
	videoUrl: string,
	textPrompt: string,
	options?: Partial<Omit<Sam3VideoInput, "video_url" | "text_prompt">>
): Promise<Sam3VideoOutput> {
	return sam3Client.segmentVideoWithText(videoUrl, textPrompt, options);
}
