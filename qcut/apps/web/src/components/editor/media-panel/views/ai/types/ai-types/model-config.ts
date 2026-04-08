/**
 * AI Model Configuration Types
 */

// Model Configuration Interfaces
export interface AIModelEndpoints {
	text_to_video?: string;
	text_to_image?: string;
	image_edit?: string;
	image_to_video?: string;
	reference_to_video?: string;
	upscale_video?: string;
	text_to_speech?: string;
	speech_to_speech?: string;
	clone_voice?: string;
}

/**
 * API endpoints for image upscaling models
 * Simple structure since upscale models only have one endpoint type
 */
export interface UpscaleModelEndpoints {
	/** FAL.ai API endpoint path for upscaling operations */
	upscale: string;
}

/**
 * Parameters for AI video generation models
 * These vary by model but share common properties like duration and resolution
 */
export interface AIModelParameters {
	duration?: number;
	resolution?: string;
	cfg_scale?: number;
	aspect_ratio?: string;
	quality?: string;
	style_preset?: string;
	enhance_prompt?: boolean;
	[key: string]: unknown;
}

/**
 * Parameters for AI image upscaling operations
 *
 * These control the quality, scale, and processing method for upscaling images.
 * Different models support different subsets of these parameters.
 */
export interface UpscaleModelParameters {
	/** Multiplier for image dimensions (2x, 4x, 8x, etc.) */
	scale_factor?: number;
	/** Noise reduction amount (0-1 or 0-100 depending on model) */
	denoise?: number;
	/** Creative detail synthesis level (SeedVR models only, 0-1 or 0-100) */
	creativity?: number;
	/** Enable tile overlap processing to avoid seam artifacts (Topaz models only) */
	overlapping_tiles?: boolean;
	/** Output image format */
	output_format?: "png" | "jpeg" | "webp";
	/** Allow additional model-specific parameters */
	[key: string]: unknown;
}

/**
 * Category classification for AI models
 *
 * Determines which UI tab the model appears in and what inputs it requires.
 * - text: Text-to-video generation
 * - image: Image-to-video or image animation
 * - video: Video-to-video transformation
 * - avatar: Character animation from image + audio
 * - upscale: Image quality enhancement
 */
export type ModelCategory =
	| "text"
	| "image"
	| "video"
	| "avatar"
	| "upscale"
	| "angles"
	| "speech";

// Core AI Model Interface
export interface AIModel {
	id: string;
	name: string;
	description: string;
	price: string;
	resolution: string;
	max_duration: number;
	endpoints: AIModelEndpoints;
	default_params?: AIModelParameters;
	category?: ModelCategory;
	badge?: string;
	requiredInputs?: string[];
	pricingModel?: string;
	supportedResolutions?: string[]; // For models supporting multiple resolutions (e.g., Pro models)
	supportedFPS?: string[];
	supportedDurations?: number[];
	supportedAspectRatios?: string[];
	perSecondPricing?: Record<string, number>;
	supportedUpscaleFactors?:
		| number[]
		| {
				min: number;
				max: number;
				step?: number;
		  };
	supportedAcceleration?: string[];
	supportedOutputFormats?: string[];
	supportedOutputQuality?: string[];
	supportedWriteModes?: string[];
	/** Audio constraints for avatar models (Kling Avatar v2) */
	audioConstraints?: {
		minDurationSec: number;
		maxDurationSec: number;
		maxFileSizeBytes: number;
	};
	/** Supported emotions for lipsync models (Sync Lipsync React-1) */
	supportedEmotions?: string[];
	/** Supported model modes for lipsync models */
	supportedModelModes?: string[];
	/** Supported lipsync modes for lipsync models */
	supportedLipsyncModes?: string[];
	/** Provider backend override (defaults to "fal" if not set) */
	providerBackend?: "fal" | "gmi" | "runway";
}
