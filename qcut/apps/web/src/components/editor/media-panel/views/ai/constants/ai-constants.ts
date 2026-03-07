/**
 * AI View Constants
 *
 * Extracted from ai.tsx as part of safe refactoring process.
 * This file contains all constants and configuration used by the AI video generation feature.
 */

import type { AIModel, APIConfiguration } from "../types/ai-types";
import { UPSCALE_MODEL_ENDPOINTS as UPSCALE_MODEL_ENDPOINT_MAP } from "@/lib/ai-models/upscale-models";

// Import model configurations from category-specific files
import { T2V_MODELS } from "./text2video-models-config";
import { I2V_MODELS } from "./image2video-models-config";
import { AVATAR_MODELS } from "./avatar-models-config";
import { ANGLES_MODEL } from "./angles-config";
import { validateUniqueAIModelIds } from "./model-config-validation";
import { UPSCALE_MODELS } from "@/lib/ai-models/upscale-models";
import { ERROR_MESSAGES as ERROR_MESSAGES_INTERNAL } from "./error-messages";

// FAL API Configuration
/** FAL.ai API key from environment variables */
export const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;
/** Base URL for FAL.ai API endpoints */
export const FAL_API_BASE = "https://fal.run";
/**
 * Map of upscale model IDs to their FAL.ai endpoint paths
 * Re-exported from @/lib/ai-models/upscale-models for convenient access alongside AI model constants
 */
export const UPSCALE_MODEL_ENDPOINTS = UPSCALE_MODEL_ENDPOINT_MAP;

/**
 * API configuration for FAL.ai video generation service.
 * Includes retry logic, timeout settings, and authentication.
 */
export const API_CONFIG: APIConfiguration = {
	falApiKey: FAL_API_KEY,
	falApiBase: FAL_API_BASE,
	maxRetries: 3,
	timeoutMs: 30_000, // 30 seconds
};

// ============================================================================
// Model Configuration Re-exports
// ============================================================================
// Model definitions are now organized by category for better maintainability.
// Each category has its own config file with type-safe model definitions.

// Re-export Text-to-Video models
export {
	T2V_MODELS,
	T2V_MODEL_ORDER,
	T2V_MODEL_CAPABILITIES,
	getT2VModelsInOrder,
	type T2VModelId,
} from "./text2video-models-config";

// Re-export Image-to-Video models
export {
	I2V_MODELS,
	I2V_MODEL_ORDER,
	getI2VModelsInOrder,
	type I2VModelId,
} from "./image2video-models-config";

// Re-export Avatar/Talking-head models
export {
	AVATAR_MODELS,
	AVATAR_MODEL_ORDER,
	getAvatarModelsInOrder,
	type AvatarModelId,
} from "./avatar-models-config";

// Re-export Upscale models
export {
	UPSCALE_MODELS,
	UPSCALE_MODEL_ORDER,
	type UpscaleModelId,
} from "@/lib/ai-models/upscale-models";

// Re-export Angles config
export {
	ANGLES_MODEL,
	CINEMATIC_ANGLES,
	ANGLE_COUNT,
	ANGLE_BATCH_SIZE,
	type CinematicAngleId,
} from "./angles-config";

// ============================================================================
// Backward Compatibility: Consolidated AI_MODELS Array
// ============================================================================
/**
 * Legacy AI_MODELS array combining all video generation model categories.
 * Maintained for backward compatibility with existing code.
 *
 * For new code, prefer using category-specific imports:
 * - T2V_MODELS for text-to-video models
 * - I2V_MODELS for image-to-video models
 * - AVATAR_MODELS for avatar/talking-head models
 */
const UPSCALE_VIDEO_MODELS: AIModel[] = [
	{
		id: "bytedance_video_upscaler",
		name: "ByteDance Upscaler",
		description: "AI upscaling to 1080p/2K/4K with optional 60fps",
		price: "0.05",
		resolution: "4K",
		max_duration: 120,
		category: "upscale",
		endpoints: { upscale_video: "bytedance/video-upscaler" },
	},
	{
		id: "flashvsr_video_upscaler",
		name: "FlashVSR",
		description: "Fastest video upscaling up to 4x with quality control",
		price: "0.03",
		resolution: "4K",
		max_duration: 120,
		category: "upscale",
		endpoints: { upscale_video: "flashvsr/video-upscaler" },
	},
	{
		id: "topaz_video_upscale",
		name: "Topaz Video AI",
		description: "Professional upscaling up to 8x with frame interpolation",
		price: "0.50",
		resolution: "8K",
		max_duration: 120,
		category: "upscale",
		endpoints: { upscale_video: "topaz/video-upscale" },
	},
];

export const AI_MODELS: AIModel[] = [
	...Object.values(T2V_MODELS),
	...Object.values(I2V_MODELS),
	...Object.values(AVATAR_MODELS),
	ANGLES_MODEL,
	...UPSCALE_VIDEO_MODELS,
];

validateUniqueAIModelIds({
	categories: {
		T2V: Object.values(T2V_MODELS),
		I2V: Object.values(I2V_MODELS),
		AVATAR: Object.values(AVATAR_MODELS),
	},
});

/**
 * UI constraints and limits for the AI video generation interface.
 * Controls input validation, history management, and generation timeouts.
 */
export const UI_CONSTANTS = {
	MAX_PROMPT_CHARS: 500,
	MAX_IMAGE_SIZE_MB: 10,
	MAX_HISTORY_ITEMS: 10,
	POLLING_INTERVAL_MS: 2000,
	GENERATION_TIMEOUT_MS: 300_000, // 5 minutes
} as const;

/**
 * File upload constraints for all AI model types.
 * Defines supported formats, size limits, and model-specific requirements
 * for images, audio, and video uploads.
 */
export const UPLOAD_CONSTANTS = {
	// Image uploads (for image-to-video and avatar character images)
	ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
	MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
	MAX_IMAGE_SIZE_LABEL: "10MB",
	SUPPORTED_FORMATS: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
	IMAGE_FORMATS_LABEL: "JPG, PNG, WebP, GIF",

	// Avatar-specific image uploads (character images only, no GIF for consistency)
	ALLOWED_AVATAR_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
	AVATAR_IMAGE_FORMATS_LABEL: "JPG, PNG, WebP",

	// Audio uploads (for Kling and ByteDance avatar models)
	ALLOWED_AUDIO_TYPES: ["audio/mpeg", "audio/wav", "audio/aac"], // audio/mpeg is the correct MIME type for MP3
	MAX_AUDIO_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
	MAX_AUDIO_SIZE_LABEL: "50MB",
	SUPPORTED_AUDIO_FORMATS: [".mp3", ".wav", ".aac"],
	AUDIO_FORMATS_LABEL: "MP3, WAV, AAC",

	// Video uploads (WAN + Upscale)
	ALLOWED_VIDEO_TYPES: ["video/mp4", "video/quicktime", "video/x-msvideo"],
	MAX_VIDEO_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
	MAX_VIDEO_SIZE_LABEL: "100MB",
	SUPPORTED_VIDEO_FORMATS: [".mp4", ".mov", ".avi"],
	VIDEO_FORMATS_LABEL: "MP4, MOV, AVI",

	// Upscale overrides (ByteDance/Topaz allow 500MB)
	UPSCALE_MAX_VIDEO_SIZE_BYTES: 500 * 1024 * 1024,
	UPSCALE_MAX_VIDEO_SIZE_LABEL: "500MB",

	// Veo 3.1 frame uploads (for frame-to-video model)
	MAX_VEO31_FRAME_SIZE_BYTES: 8 * 1024 * 1024, // 8MB (Veo 3.1 limit)
	MAX_VEO31_FRAME_SIZE_LABEL: "8MB",
	ALLOWED_VEO31_ASPECT_RATIOS: ["16:9", "9:16"],

	// Seeddream 4.5 edit image uploads
	MAX_SEEDDREAM45_IMAGES: 10,
	MAX_SEEDDREAM45_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB per image
	MAX_SEEDDREAM45_IMAGE_SIZE_LABEL: "10MB",

	// Veo 3.1 extend-video constraints
	MAX_EXTEND_VIDEO_DURATION_SECONDS: 8,
	EXTEND_VIDEO_SUPPORTED_FORMATS: ["mp4", "mov", "webm", "m4v", "gif"],
	EXTEND_VIDEO_SUPPORTED_RESOLUTIONS: ["720p", "1080p"],
	EXTEND_VIDEO_SUPPORTED_ASPECT_RATIOS: ["16:9", "9:16"],
	EXTEND_VIDEO_OUTPUT_DURATION_SECONDS: 7,
} as const;

/**
 * Progress percentage milestones for video generation workflow.
 * Used to provide user feedback during generation, polling, and download phases.
 */
export const PROGRESS_CONSTANTS = {
	INITIAL_PROGRESS: 0,
	POLLING_START_PROGRESS: 10,
	DOWNLOAD_START_PROGRESS: 90,
	COMPLETE_PROGRESS: 100,
} as const;

/**
 * Local storage keys for persisting user data and preferences.
 * Used for generation history, user settings, and model selections.
 */
export const STORAGE_KEYS = {
	GENERATION_HISTORY: "ai-generation-history",
	USER_PREFERENCES: "ai-user-preferences",
	LAST_USED_MODELS: "ai-last-used-models",
} as const;

// Error Messages
// Re-export ERROR_MESSAGES for backward compatibility
export { ERROR_MESSAGES } from "./error-messages";
export { ERROR_MESSAGES as ERRORS } from "./error-messages";

/**
 * LTX Video 2.0 Fast model-specific configuration.
 * Defines supported durations, resolutions, FPS options, and pricing tiers.
 */
export const LTXV2_FAST_CONFIG = {
	DURATIONS: [6, 8, 10, 12, 14, 16, 18, 20] as const,
	RESOLUTIONS: {
		STANDARD: ["1080p", "1440p", "2160p"] as const,
		EXTENDED: ["1080p"] as const, // For videos > 10 seconds
	},
	FPS_OPTIONS: {
		STANDARD: [25, 50] as const,
		EXTENDED: [25] as const, // For videos > 10 seconds
	},
	EXTENDED_DURATION_THRESHOLD: 10,
	MAX_IMAGE_SIZE_MB: 7,
	SUPPORTED_FORMATS: ["PNG", "JPEG", "WebP", "AVIF", "HEIF"] as const,
	PRICING: {
		"1080p": 0.04, // per second
		"1440p": 0.08, // per second
		"2160p": 0.16, // per second
	},
} as const;

/**
 * LTX Video 2.3 model-specific configuration.
 * Shares extended-duration constraints with v2 but adds 9:16 aspect ratio
 * and 48/50 FPS options.
 */
export const LTX23_CONFIG = {
	PRO_DURATIONS: [6, 8, 10] as const,
	FAST_DURATIONS: [6, 8, 10, 12, 14, 16, 18, 20] as const,
	RESOLUTIONS: {
		STANDARD: ["1080p", "1440p", "2160p"] as const,
		EXTENDED: ["1080p"] as const,
	},
	FPS_OPTIONS: {
		STANDARD: [24, 25, 48, 50] as const,
		EXTENDED: [25] as const,
	},
	ASPECT_RATIOS: ["16:9", "9:16"] as const,
	EXTENDED_DURATION_THRESHOLD: 10,
	PRICING: {
		PRO: {
			"1080p": 0.06,
			"1440p": 0.12,
			"2160p": 0.24,
		},
		FAST: {
			"1080p": 0.04,
			"1440p": 0.08,
			"2160p": 0.16,
		},
		AUDIO_TO_VIDEO: 0.1,
	},
	AUDIO_TO_VIDEO: {
		DURATIONS: [6, 8, 10] as const,
		MIN_AUDIO_DURATION_SEC: 2,
		MAX_AUDIO_DURATION_SEC: 20,
		DEFAULT_GUIDANCE_SCALE: 7,
		ENDPOINT: "fal-ai/ltx-2.3/audio-to-video",
	},
} as const;

/**
 * User-facing status messages for video generation workflow.
 * Displayed in the UI during different stages of generation.
 */
export const STATUS_MESSAGES = {
	STARTING: "Starting generation...",
	PROCESSING: "Processing video...",
	DOWNLOADING: "Downloading video...",
	COMPLETE: "Generation complete!",
	CANCELLED: "Generation cancelled",
	FAILED: "Generation failed",
} as const;

/**
 * Default values for AI generation state initialization.
 * Used when creating new generation sessions or resetting state.
 */
export const DEFAULTS = {
	PROMPT: "",
	SELECTED_MODELS: [] as string[],
	ACTIVE_TAB: "text" as const,
	GENERATION_PROGRESS: 0,
	STATUS_MESSAGE: "",
	ELAPSED_TIME: 0,
	CURRENT_MODEL_INDEX: 0,
	PROGRESS_LOGS: [] as string[],
} as const;

/**
 * Utility functions for querying and filtering AI models.
 * Provides helpers for model lookup, filtering by capabilities, and input requirements.
 */
export const MODEL_HELPERS = {
	/**
	 * Get model by ID
	 */
	getModelById: (id: string): AIModel | undefined => {
		return AI_MODELS.find((model) => model.id === id);
	},

	/**
	 * Get models by resolution
	 * Checks both the main resolution field and supportedResolutions array for Pro models
	 */
	getModelsByResolution: (resolution: string): AIModel[] => {
		return AI_MODELS.filter((model) => {
			// Check supportedResolutions array first (for Pro models)
			if (model.supportedResolutions?.includes(resolution)) {
				return true;
			}
			// Fallback to exact resolution match
			return model.resolution === resolution;
		});
	},

	/**
	 * Get models by price range
	 */
	getModelsByPriceRange: (min: number, max: number): AIModel[] => {
		return AI_MODELS.filter((model) => {
			const price = parseFloat(model.price);
			return price >= min && price <= max;
		});
	},

	/**
	 * Sort models by price (ascending)
	 */
	sortModelsByPrice: (): AIModel[] => {
		return [...AI_MODELS].sort(
			(a, b) => parseFloat(a.price) - parseFloat(b.price)
		);
	},

	/**
	 * Get model display name with price
	 */
	getModelDisplayName: (model: AIModel): string => {
		return `${model.name} ($${model.price})`;
	},

	/**
	 * Check if model requires first + last frame inputs
	 * Used to determine if F2V upload UI should be shown
	 * @param modelId - Model ID to check
	 * @returns true if model supports frame-to-frame animation
	 */
	requiresFrameToFrame: (modelId: string): boolean => {
		const model = AI_MODELS.find((m) => m.id === modelId);
		return model?.requiredInputs?.includes("firstFrame") ?? false;
	},

	/**
	 * Check if model requires source video input
	 * Used to determine if V2V (video-to-video) upload UI should be shown
	 * @param modelId - Model ID to check
	 * @returns true if model requires source video for transformation
	 */
	requiresSourceVideo: (modelId: string): boolean => {
		const model = AI_MODELS.find((m) => m.id === modelId);
		return model?.requiredInputs?.includes("sourceVideo") ?? false;
	},

	/**
	 * Get required inputs for a model
	 * Centralizes input requirements for maintainability
	 * @param modelId - Model ID to check
	 * @returns Array of required input keys (e.g., ['firstFrame', 'lastFrame'])
	 */
	getRequiredInputs: (modelId: string): string[] => {
		const model = AI_MODELS.find((m) => m.id === modelId);
		return model?.requiredInputs || [];
	},
} as const;

// ============================================
// Reve Model Constants
// ============================================

/**
 * Reve Text-to-Image Model Configuration
 */
export const REVE_TEXT_TO_IMAGE_MODEL = {
	endpoint: "fal-ai/reve/text-to-image",
	pricing: {
		perImage: 0.04, // $0.04 per image
	},
	aspectRatios: [
		{ value: "16:9", label: "16:9 (Landscape)" },
		{ value: "9:16", label: "9:16 (Portrait)" },
		{ value: "3:2", label: "3:2 (Standard)" },
		{ value: "2:3", label: "2:3 (Portrait)" },
		{ value: "4:3", label: "4:3 (Classic)" },
		{ value: "3:4", label: "3:4 (Portrait)" },
		{ value: "1:1", label: "1:1 (Square)" },
	],
	defaultAspectRatio: "3:2" as const,
	outputFormats: ["png", "jpeg", "webp"] as const,
	defaultOutputFormat: "png" as const,
	numImagesRange: { min: 1, max: 4 },
	defaultNumImages: 1,
	promptMaxLength: 2560,
} as const;

/**
 * Reve Edit Model Configuration
 */
export const REVE_EDIT_MODEL = {
	endpoint: "fal-ai/reve/edit",
	pricing: {
		perImage: 0.04, // $0.04 per edit (estimated - TBD from fal.ai)
	},
	imageConstraints: {
		supportedFormats: [
			"image/png",
			"image/jpeg",
			"image/webp",
			"image/avif",
			"image/heif",
		] as const,
		maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
		maxFileSizeLabel: "10MB" as const,
		minDimensions: { width: 128, height: 128 },
		maxDimensions: { width: 4096, height: 4096 },
	},
	outputFormats: ["png", "jpeg", "webp"] as const,
	defaultOutputFormat: "png" as const,
	numImagesRange: { min: 1, max: 4 },
	defaultNumImages: 1,
} as const;

/**
 * Convenience aliases for commonly accessed constant groups.
 * Provides shorter names for importing frequently used constants.
 */
export {
	AI_MODELS as MODELS,
	UI_CONSTANTS as UI,
	UPLOAD_CONSTANTS as UPLOAD,
	PROGRESS_CONSTANTS as PROGRESS,
	STORAGE_KEYS as STORAGE,
	STATUS_MESSAGES as STATUS,
};

/**
 * Complete AI configuration object combining all constants.
 * Provides a single import point for all AI-related configuration.
 */
export const AI_CONFIG = {
	api: API_CONFIG,
	ui: UI_CONSTANTS,
	upload: UPLOAD_CONSTANTS,
	progress: PROGRESS_CONSTANTS,
	storage: STORAGE_KEYS,
	errors: ERROR_MESSAGES_INTERNAL,
	status: STATUS_MESSAGES,
	defaults: DEFAULTS,
	models: AI_MODELS,
	helpers: MODEL_HELPERS,
} as const;

export default AI_CONFIG;
