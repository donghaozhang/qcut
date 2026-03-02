/**
 * FAL.ai Client
 *
 * HTTP client for interacting with FAL.ai image and video generation APIs.
 * Supports multiple model versions (V3, V4, Flux, etc.) and handles
 * API key management from both environment variables and Electron storage.
 *
 * @module lib/fal-ai-client
 */

import { TEXT2IMAGE_MODELS } from "../ai-models/text2image-models";
import { debugLogger } from "../debug/debug-logger";
import {
	handleAIServiceError,
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "../debug/error-handler";
import type {
	Veo31TextToVideoInput,
	Veo31ImageToVideoInput,
	Veo31FrameToVideoInput,
	Veo31ExtendVideoInput,
	ReveTextToImageInput,
	ReveTextToImageOutput,
	ReveEditInput,
	ReveEditOutput,
} from "@/types/ai-generation";
import type { VideoGenerationResponse } from "./ai-video-client";
import {
	uploadFileToFal as uploadFileToFalCore,
	type FalUploadFileType,
} from "../ai-video/core/fal-upload";
import {
	convertV3Parameters,
	convertV4Parameters,
	convertNanoBananaParameters,
	convertFluxParameters,
	detectModelVersion,
} from "../fal-ai/model-handlers";
import {
	generateWithModel as generateWithModelCore,
	generateWithMultipleModels as generateWithMultipleModelsCore,
} from "./fal-ai-client-generation";
import {
	veo31FastTextToVideo,
	veo31FastImageToVideo,
	veo31FastFrameToVideo,
	veo31TextToVideo,
	veo31ImageToVideo,
	veo31FrameToVideo,
	veo31FastExtendVideo,
	veo31ExtendVideo,
} from "./fal-ai-client-veo31";
import { reveTextToImage, reveEdit } from "./fal-ai-client-reve";
import {
	FAL_LOG_COMPONENT,
	type FalImageResponse,
	type GenerationSettings,
	type GenerationResult,
	type MultiModelGenerationResult,
} from "./fal-ai-client-internal-types";

export type {
	GenerationSettings,
	GenerationResult,
	MultiModelGenerationResult,
} from "./fal-ai-client-internal-types";

/**
 * Client for FAL.ai image and video generation APIs.
 * Handles authentication, request building, and response parsing
 * for various AI models including Flux, SDXL, and video generation models.
 */
class FalAIClient {
	private apiKey: string | null = null;
	private baseUrl = "https://fal.run";
	private apiKeyInitPromise: Promise<void> | null = null;

	/** Creates a new FAL.ai client instance and initializes API key */
	constructor() {
		// Try to get API key from environment variables first
		try {
			this.apiKey =
				import.meta.env.VITE_FAL_API_KEY ||
				(typeof window !== "undefined" &&
					(window as any).process?.env?.FAL_API_KEY) ||
				null;

			// If no env var, try Electron storage asynchronously
			if (!this.apiKey) {
				// Assign promise immediately to avoid race condition if ensureApiKey() is called
				// before the async init starts. Promise creation is synchronous.
				this.apiKeyInitPromise = this.initApiKeyFromElectron();
			}
		} catch (error) {
			// Silently handle initialization errors during module loading
			console.warn("[FalAIClient] Constructor error:", error);
			this.apiKey = null;
		}
	}

	/**
	 * Initialize API key from Electron storage if available.
	 * Called lazily when env var is not set.
	 */
	private async initApiKeyFromElectron(): Promise<void> {
		if (typeof window !== "undefined" && window.electronAPI?.apiKeys) {
			try {
				const keys = await window.electronAPI.apiKeys.get();
				if (keys?.falApiKey) {
					this.apiKey = keys.falApiKey;
					debugLogger.log(FAL_LOG_COMPONENT, "API_KEY_LOADED_FROM_ELECTRON", {
						keyLength: keys.falApiKey.length,
					});
				}
			} catch (error) {
				debugLogger.error(
					FAL_LOG_COMPONENT,
					"API_KEY_ELECTRON_LOAD_FAILED",
					error instanceof Error ? error.message : "Unknown error"
				);
			}
		}

		if (!this.apiKey) {
			debugLogger.error(
				FAL_LOG_COMPONENT,
				"API_KEY_MISSING",
				"FAL API key not found. Set VITE_FAL_API_KEY or configure it in Settings."
			);
		}
	}

	/**
	 * Ensure API key is loaded before making requests.
	 * Awaits the Electron storage init if it's in progress.
	 */
	private async ensureApiKey(): Promise<string | null> {
		if (this.apiKeyInitPromise) {
			await this.apiKeyInitPromise;
			this.apiKeyInitPromise = null;
		}
		return this.apiKey;
	}

	/**
	 * Makes an authenticated HTTP request to the FAL.ai API.
	 * @param endpoint - The API endpoint URL or path
	 * @param params - Request parameters to send as JSON body
	 * @returns The parsed API response
	 * @throws Error if API key is missing or request fails
	 */
	private async makeRequest<T = FalImageResponse>(
		endpoint: string,
		params: Record<string, unknown>
	): Promise<T> {
		// Ensure API key is loaded (may be async from Electron storage)
		const apiKey = await this.ensureApiKey();
		if (!apiKey) {
			throw new Error(
				"FAL API key is required. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
			);
		}

		// The endpoint already contains the full URL, so use it directly
		const requestUrl = endpoint.startsWith("https://")
			? endpoint
			: `${this.baseUrl}${endpoint}`;

		debugLogger.log(FAL_LOG_COMPONENT, "REQUEST_START", {
			endpoint: requestUrl,
			params,
		});

		// Make direct API call to fal.run instead of proxy
		const response = await fetch(requestUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Key ${apiKey}`,
			},
			body: JSON.stringify(params),
		});

		debugLogger.log(FAL_LOG_COMPONENT, "REQUEST_STATUS", {
			endpoint: requestUrl,
			status: response.status,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			handleAIServiceError(
				new Error(`FAL AI API request failed: ${response.status}`),
				"FAL AI API request",
				{
					status: response.status,
					statusText: response.statusText,
					errorData,
					endpoint: requestUrl,
					operation: "makeRequest",
				}
			);

			// Handle different error response formats
			let errorMessage = `API request failed: ${response.status}`;

			if (errorData.error) {
				if (typeof errorData.error === "string") {
					errorMessage = errorData.error;
				} else if (typeof errorData.error === "object") {
					errorMessage = JSON.stringify(errorData.error, null, 2);
				}
			} else if (errorData.detail) {
				if (typeof errorData.detail === "string") {
					errorMessage = errorData.detail;
				} else if (Array.isArray(errorData.detail)) {
					errorMessage = errorData.detail
						.map((d: any) => d.msg || JSON.stringify(d))
						.join(", ");
				} else {
					errorMessage = JSON.stringify(errorData.detail, null, 2);
				}
			} else if (errorData.message) {
				errorMessage = errorData.message;
			}

			throw new Error(errorMessage);
		}

		const result = (await response.json()) as T;
		debugLogger.log(FAL_LOG_COMPONENT, "REQUEST_SUCCESS", {
			endpoint: requestUrl,
			responseType: typeof result,
		});
		return result;
	}

	/**
	 * Upload a file to FAL.ai storage.
	 * Delegates to shared upload module which handles Electron IPC fallback.
	 */
	private async uploadFileToFal(
		file: File,
		fileType: FalUploadFileType = "asset"
	): Promise<string> {
		// Ensure API key is loaded (may be async from Electron storage)
		const apiKey = await this.ensureApiKey();
		if (!apiKey) {
			throw new Error(
				"FAL API key is required for asset upload. Please set VITE_FAL_API_KEY environment variable or configure it in Settings."
			);
		}
		return uploadFileToFalCore(file, fileType, apiKey);
	}

	/**
	 * Uploads an image file to FAL storage and returns the resulting URL.
	 */
	async uploadImageToFal(file: File): Promise<string> {
		return this.uploadFileToFal(file, "image");
	}

	/**
	 * Uploads an audio file (MP3/WAV) to FAL storage and returns the resulting URL.
	 */
	async uploadAudioToFal(file: File): Promise<string> {
		return this.uploadFileToFal(file, "audio");
	}

	/**
	 * Uploads an MP4/MOV/AVI asset to FAL storage and returns the URL.
	 */
	async uploadVideoToFal(file: File): Promise<string> {
		return this.uploadFileToFal(file, "video");
	}

	async generateWithModel(
		modelKey: string,
		prompt: string,
		settings: GenerationSettings
	): Promise<GenerationResult> {
		return generateWithModelCore(
			{ makeRequest: this.makeRequest.bind(this) },
			modelKey,
			prompt,
			settings
		);
	}

	async generateWithMultipleModels(
		modelKeys: string[],
		prompt: string,
		settings: GenerationSettings
	): Promise<MultiModelGenerationResult> {
		return generateWithMultipleModelsCore(
			{ makeRequest: this.makeRequest.bind(this) },
			modelKeys,
			prompt,
			settings
		);
	}

	// API key management
	setApiKey(apiKey: string): void {
		this.apiKey = apiKey;
		this.apiKeyInitPromise = null; // Clear any pending init
		debugLogger.log(FAL_LOG_COMPONENT, "API_KEY_UPDATED", {
			keyLength: apiKey?.length ?? 0,
		});
	}

	async hasApiKey(): Promise<boolean> {
		const apiKey = await this.ensureApiKey();
		return !!apiKey;
	}

	async getApiKeyStatus(): Promise<{ hasKey: boolean; source: string }> {
		const apiKey = await this.ensureApiKey();
		if (!apiKey) {
			return { hasKey: false, source: "none" };
		}

		// Determine source of API key
		let source = "unknown";
		if (import.meta.env.VITE_FAL_API_KEY) source = "VITE_FAL_API_KEY";
		else if (typeof window !== "undefined" && window.electronAPI?.apiKeys)
			source = "electron_storage";
		else source = "manually_set";

		return { hasKey: true, source };
	}

	// Utility methods
	async testModelAvailability(modelKey: string): Promise<boolean> {
		try {
			// Check API key first
			const hasKey = await this.hasApiKey();
			if (!hasKey) {
				debugLogger.warn(FAL_LOG_COMPONENT, "MODEL_TEST_SKIPPED_NO_KEY", {
					modelKey,
				});
				return false;
			}

			const model = TEXT2IMAGE_MODELS[modelKey];
			if (!model) return false;

			// Test with a simple prompt
			const result = await this.generateWithModel(modelKey, "test image", {
				imageSize: "square",
			});

			return result.success;
		} catch (error) {
			handleError(error instanceof Error ? error : new Error(String(error)), {
				operation: "Test FAL AI model availability",
				category: ErrorCategory.AI_SERVICE,
				severity: ErrorSeverity.MEDIUM,
				metadata: { modelKey, operation: "testModelAvailability" },
				showToast: false, // Don't spam users with test failures
			});
			return false;
		}
	}

	async estimateGenerationTime(
		modelKeys: string[],
		prompt: string
	): Promise<Record<string, number>> {
		const estimates: Record<string, number> = {};

		modelKeys.forEach((modelKey) => {
			const model = TEXT2IMAGE_MODELS[modelKey];
			if (model) {
				// Rough estimation based on model speed rating and prompt complexity
				const baseTime = 15; // seconds
				const speedMultiplier = (6 - model.speedRating) * 0.5; // 0.5 to 2.5
				const promptComplexity = Math.min(prompt.split(" ").length / 10, 2); // 0 to 2

				estimates[modelKey] = Math.round(
					baseTime * speedMultiplier * (1 + promptComplexity)
				);
			}
		});

		return estimates;
	}

	async getModelCapabilities(modelKey: string): Promise<{
		available: boolean;
		maxResolution: string;
		estimatedCost: string;
		features: string[];
	} | null> {
		const model = TEXT2IMAGE_MODELS[modelKey];
		if (!model) return null;

		return {
			available: true, // Would check with actual API in real implementation
			maxResolution: model.maxResolution,
			estimatedCost: model.estimatedCost,
			features: model.strengths,
		};
	}

	// ============================================
	// Veo 3.1 FAST Methods (budget-friendly, faster)
	// ============================================

	async generateVeo31FastTextToVideo(
		params: Veo31TextToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31FastTextToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateVeo31FastImageToVideo(
		params: Veo31ImageToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31FastImageToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateVeo31FastFrameToVideo(
		params: Veo31FrameToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31FastFrameToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	// ============================================
	// Veo 3.1 STANDARD Methods (premium quality)
	// ============================================

	async generateVeo31TextToVideo(
		params: Veo31TextToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31TextToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateVeo31ImageToVideo(
		params: Veo31ImageToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31ImageToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateVeo31FrameToVideo(
		params: Veo31FrameToVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31FrameToVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	// ============================================
	// Veo 3.1 Extend-Video Methods
	// ============================================

	async generateVeo31FastExtendVideo(
		params: Veo31ExtendVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31FastExtendVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateVeo31ExtendVideo(
		params: Veo31ExtendVideoInput
	): Promise<VideoGenerationResponse> {
		return veo31ExtendVideo(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateReveTextToImage(
		params: ReveTextToImageInput
	): Promise<ReveTextToImageOutput> {
		return reveTextToImage(
			{ makeRequest: this.makeRequest.bind(this) },
			params
		);
	}

	async generateReveEdit(params: ReveEditInput): Promise<ReveEditOutput> {
		return reveEdit({ makeRequest: this.makeRequest.bind(this) }, params);
	}
}

// Add model-specific parameter conversion for image editing
export function convertParametersForModel(modelId: string, params: any) {
	switch (modelId) {
		case "seededit":
			// Keep existing V3 conversion unchanged
			return convertV3Parameters(params);

		case "seeddream-v4":
			return convertV4Parameters(params);

		case "nano-banana":
			return convertNanoBananaParameters(params);

		case "flux-kontext":
		case "flux-kontext-max":
			// Keep existing flux conversion unchanged
			return convertFluxParameters(params);

		default:
			throw new Error(`Unknown model: ${modelId}`);
	}
}

// Lazy singleton to avoid temporal dead zone errors during module loading
let _falAIClientInstance: FalAIClient | null = null;

function getFalAIClientInstance(): FalAIClient {
	if (!_falAIClientInstance) {
		_falAIClientInstance = new FalAIClient();
	}
	return _falAIClientInstance;
}

// Export a proxy that lazily creates the instance on first access
// This prevents the singleton from being created during module initialization
export const falAIClient: FalAIClient = new Proxy({} as FalAIClient, {
	get(_target, prop) {
		const instance = getFalAIClientInstance();
		const value = (instance as unknown as Record<string | symbol, unknown>)[
			prop
		];
		if (typeof value === "function") {
			return (value as (...args: unknown[]) => unknown).bind(instance);
		}
		return value;
	},
	set(_target, prop, value) {
		const instance = getFalAIClientInstance();
		(instance as unknown as Record<string | symbol, unknown>)[prop] = value;
		return true;
	},
});

// Export main functions for easy importing
export async function generateWithModel(
	modelKey: string,
	prompt: string,
	settings: GenerationSettings
): Promise<GenerationResult> {
	return falAIClient.generateWithModel(modelKey, prompt, settings);
}

export async function generateWithMultipleModels(
	modelKeys: string[],
	prompt: string,
	settings: GenerationSettings
): Promise<MultiModelGenerationResult> {
	return falAIClient.generateWithMultipleModels(modelKeys, prompt, settings);
}

export async function testModelAvailability(
	modelKey: string
): Promise<boolean> {
	return falAIClient.testModelAvailability(modelKey);
}

export async function estimateGenerationTime(
	modelKeys: string[],
	prompt: string
): Promise<Record<string, number>> {
	return falAIClient.estimateGenerationTime(modelKeys, prompt);
}

// Helper function to batch requests with rate limiting
export async function batchGenerate(
	requests: Array<{
		modelKey: string;
		prompt: string;
		settings: GenerationSettings;
	}>,
	options: {
		concurrency?: number;
		delayBetweenBatches?: number;
	} = {}
): Promise<Array<{ request: (typeof requests)[0]; result: GenerationResult }>> {
	const { concurrency = 3, delayBetweenBatches = 1000 } = options;
	const results: Array<{
		request: (typeof requests)[0];
		result: GenerationResult;
	}> = [];

	// Process requests in batches
	for (let i = 0; i < requests.length; i += concurrency) {
		const batch = requests.slice(i, i + concurrency);

		const batchPromises = batch.map(async (request) => {
			const result = await generateWithModel(
				request.modelKey,
				request.prompt,
				request.settings
			);
			return { request, result };
		});

		const batchResults = await Promise.allSettled(batchPromises);

		batchResults.forEach((settledResult) => {
			if (settledResult.status === "fulfilled") {
				results.push(settledResult.value);
			} else {
				// Handle rejected batch item
				handleError(
					settledResult.reason instanceof Error
						? settledResult.reason
						: new Error(String(settledResult.reason)),
					{
						operation: "Batch image generation",
						category: ErrorCategory.AI_SERVICE,
						severity: ErrorSeverity.MEDIUM,
						metadata: { operation: "batchGenerate" },
						showToast: false, // Don't spam with batch failures
					}
				);
			}
		});

		// Delay between batches to respect rate limits
		if (i + concurrency < requests.length && delayBetweenBatches > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
		}
	}

	return results;
}

// Re-export detectModelVersion for backward compatibility
export { detectModelVersion } from "../fal-ai/model-handlers";
