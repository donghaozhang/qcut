import type { VideoEditModel } from "./video-edit-types";

/**
 * Video Edit Models Configuration
 *
 * MAINTENANCE NOTE: Check FAL AI pricing monthly at https://fal.ai/models
 * Last updated: October 2024
 */
export const VIDEO_EDIT_MODELS: VideoEditModel[] = [
	{
		id: "kling_video_to_audio",
		name: "Kling Video to Audio",
		description: "Generate audio from video (3-20s clips)",
		price: "$0.035", // Official FAL AI pricing
		category: "audio-gen",
		max_video_size: 100 * 1024 * 1024, // 100MB hard limit
		max_duration: 20, // 20 seconds max per API docs
		endpoints: {
			process: "fal-ai/kling-video/video-to-audio",
		},
		default_params: {}, // Prompts are optional
	},
	{
		id: "mmaudio_v2",
		name: "MMAudio V2",
		description: "Synchronized audio generation",
		price: "$0.001/sec", // Confirmed pricing
		category: "audio-sync",
		max_video_size: 100 * 1024 * 1024,
		max_duration: 60, // 1 minute max
		endpoints: {
			process: "fal-ai/mmaudio-v2",
		},
		default_params: {
			num_steps: 25, // Quality/speed sweet spot
			cfg_strength: 4.5, // Balanced adherence
			mask_away_clip: false,
		},
	},
	{
		id: "topaz_upscale",
		name: "Topaz Video Upscale",
		description: "Professional upscaling up to 8x",
		price: "$0.50-$5.00", // Varies by factor
		category: "upscale",
		max_video_size: 500 * 1024 * 1024, // 500MB
		max_duration: 120, // 2 minutes practical limit
		endpoints: {
			process: "fal-ai/topaz/upscale/video",
		},
		default_params: {
			upscale_factor: 2.0, // Most common use case
			H264_output: false, // H265 default (smaller)
		},
	},
];

/**
 * File Upload Constants
 * Matches pattern from ai-constants.ts UPLOAD_CONSTANTS
 *
 * WHY model-specific limits:
 * - Kling and MMAudio: 100MB limit (typical short clips)
 * - Topaz: 500MB limit (longer videos for upscaling)
 */
export const VIDEO_EDIT_UPLOAD_CONSTANTS = {
	MAX_VIDEO_SIZE_BYTES: 100 * 1024 * 1024, // 100MB (default for Kling/MMAudio)
	MAX_VIDEO_SIZE_LABEL: "100MB",
	TOPAZ_MAX_VIDEO_SIZE_BYTES: 500 * 1024 * 1024, // 500MB (for Topaz upscale)
	TOPAZ_MAX_VIDEO_SIZE_LABEL: "500MB",
	ALLOWED_VIDEO_TYPES: [
		"video/mp4",
		"video/quicktime", // macOS .mov
		"video/x-quicktime", // Browser variant for .mov
		"video/x-msvideo", // Windows .avi
	] as const,
	VIDEO_FORMATS_LABEL: "MP4, MOV, AVI",
} as const;

/**
 * Error Messages
 * User-facing, actionable error messages
 */
export const VIDEO_EDIT_ERROR_MESSAGES = {
	NO_VIDEO: "Please upload a video file to process",
	NO_PROMPT: "Please enter a prompt to guide audio generation",
	INVALID_VIDEO_TYPE: "Please upload a valid video file (MP4, MOV, or AVI)",
	VIDEO_TOO_LARGE: "Video file is too large. Maximum size is 100MB.",
	DURATION_TOO_LONG: "Video is too long. Maximum duration is ",
	PROCESSING_FAILED: "Video processing failed. Please try again.",
	NETWORK_ERROR: "Network error. Please check your connection.",
	API_KEY_MISSING: "FAL AI API key not configured.",
	QUOTA_EXCEEDED: "Processing quota exceeded. Please try again later.",
} as const;

/**
 * Status Messages
 * Processing stage feedback
 */
export const VIDEO_EDIT_STATUS_MESSAGES = {
	UPLOADING: "Uploading video...",
	ENCODING: "Encoding video for processing...",
	QUEUED: "Queued for processing...",
	PROCESSING: "Processing video...",
	DOWNLOADING: "Downloading result...",
	COMPLETE: "Processing complete!",
	FAILED: "Processing failed",
} as const;

/**
 * Processing Constants
 * Timing and limits
 */
export const VIDEO_EDIT_PROCESSING_CONSTANTS = {
	POLLING_INTERVAL_MS: 5000, // 5 seconds between polls
	MAX_POLL_ATTEMPTS: 60, // 5 minutes max wait
	PROGRESS_UPDATE_THROTTLE_MS: 100, // UI update throttle
	BASE64_CHUNK_SIZE: 1024 * 1024, // 1MB chunks for encoding
} as const;

/**
 * Helper Functions
 * Utility functions for common operations
 */
export const VIDEO_EDIT_HELPERS = {
	/**
	 * Get model by ID
	 */
	getModelById: (id: string): VideoEditModel | undefined => {
		return VIDEO_EDIT_MODELS.find((model) => model.id === id);
	},

	/**
	 * Get models by category
	 */
	getModelsByCategory: (
		category: VideoEditModel["category"]
	): VideoEditModel[] => {
		return VIDEO_EDIT_MODELS.filter((model) => model.category === category);
	},

	/**
	 * Calculate MMAudio V2 cost
	 * WHY: Only model with per-second pricing
	 */
	calculateMMAudioCost: (durationSeconds: number): number => {
		return durationSeconds * 0.001; // $0.001 per second
	},

	/**
	 * Estimate Topaz upscale cost
	 * WHY: Cost scales with upscale factor
	 */
	estimateTopazCost: (upscaleFactor: number): number => {
		// Rough estimation based on factor
		if (upscaleFactor <= 2) return 0.5;
		if (upscaleFactor <= 4) return 2.0;
		return 5.0; // 8x
	},

	/**
	 * Calculate HeyGen Translate cost
	 * WHY: $0.05 per second of output video
	 */
	calculateTranslateCost: (durationSeconds: number): number => {
		return durationSeconds * 0.05;
	},

	/**
	 * Format cost for display
	 */
	formatCost: (cost: number): string => {
		return `$${cost.toFixed(2)}`;
	},

	/**
	 * Validate video file
	 * WHY: Client-side validation before upload
	 * @param file - File to validate
	 * @param maxSizeBytes - Optional custom size limit (defaults to 100MB)
	 */
	validateVideoFile: (
		file: File,
		maxSizeBytes?: number
	): { valid: boolean; error?: string } => {
		// Check file type
		if (
			!(
				VIDEO_EDIT_UPLOAD_CONSTANTS.ALLOWED_VIDEO_TYPES as readonly string[]
			).includes(file.type)
		) {
			return {
				valid: false,
				error: VIDEO_EDIT_ERROR_MESSAGES.INVALID_VIDEO_TYPE,
			};
		}

		// Check file size with optional custom limit
		const sizeLimit =
			maxSizeBytes || VIDEO_EDIT_UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_BYTES;
		if (file.size > sizeLimit) {
			const sizeMB = Math.round(sizeLimit / 1024 / 1024);
			return {
				valid: false,
				error: `Video file is too large. Maximum size is ${sizeMB}MB.`,
			};
		}

		return { valid: true };
	},

	/**
	 * Convert file to base64 data URL
	 * WHY: FAL AI accepts base64 data URLs
	 * Performance: Use FileReader for <50MB, chunked for larger
	 */
	fileToDataURL: async (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	},
} as const;
