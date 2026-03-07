/**
 * Model-specific request/response types for video generation
 */

import type { AIModel } from "./model-config";
import type {
	SyncLipsyncEmotion,
	SyncLipsyncModelMode,
	SyncLipsyncSyncMode,
} from "./lipsync-types";

// ============================================
// Video Generation Request/Response Types
// (Moved from ai-video-client.ts for centralization)
// ============================================

/**
 * Request parameters for text-to-video generation
 */
export interface VideoGenerationRequest {
	prompt: string;
	model: string;
	resolution?: string;
	duration?: number;
	aspect_ratio?: string;
}

/**
 * Request parameters for image-to-video generation
 */
export interface ImageToVideoRequest {
	image: File;
	model: string;
	prompt?: string;
	resolution?: string;
	duration?: number;
	aspect_ratio?: string;
}

/**
 * Request parameters for Hailuo text-to-video models
 */
export interface TextToVideoRequest {
	model: string;
	prompt: string;
	duration?: 6 | 10;
	prompt_optimizer?: boolean;
	resolution?: string;
}

/**
 * Request parameters for Vidu Q2 Turbo image-to-video
 */
export interface ViduQ2I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
	resolution?: "720p" | "1080p";
	movement_amplitude?: "auto" | "small" | "medium" | "large";
	bgm?: boolean;
	seed?: number;
}

/**
 * Request parameters for Vidu Q3 text-to-video
 */
export interface ViduQ3T2VRequest {
	model: string;
	prompt: string;
	duration?: number;
	resolution?: "360p" | "540p" | "720p" | "1080p";
	aspect_ratio?: "16:9" | "9:16" | "4:3" | "3:4" | "1:1";
	audio?: boolean;
	seed?: number;
}

/**
 * Request parameters for Vidu Q3 image-to-video
 */
export interface ViduQ3I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: number;
	resolution?: "360p" | "540p" | "720p" | "1080p";
	audio?: boolean;
	seed?: number;
}

/**
 * Request parameters for LTX Video 2.0 text-to-video
 */
export interface LTXV2T2VRequest {
	model: string;
	prompt: string;
	duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	resolution?: "1080p" | "1440p" | "2160p";
	aspect_ratio?: "16:9";
	fps?: 25 | 50;
	generate_audio?: boolean;
}

/**
 * Request parameters for LTX Video 2.0 image-to-video
 */
export interface LTXV2I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	resolution?: "1080p" | "1440p" | "2160p";
	aspect_ratio?: "16:9";
	fps?: 25 | 50;
	generate_audio?: boolean;
}

/**
 * Request parameters for LTX Video 2.3 text-to-video
 */
export interface LTX23T2VRequest {
	model: string;
	prompt: string;
	duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	resolution?: "1080p" | "1440p" | "2160p";
	aspect_ratio?: "16:9" | "9:16";
	fps?: 24 | 25 | 48 | 50;
	generate_audio?: boolean;
}

/**
 * Request parameters for LTX Video 2.3 image-to-video
 */
export interface LTX23I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	end_image_url?: string;
	duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	resolution?: "1080p" | "1440p" | "2160p";
	aspect_ratio?: "16:9" | "9:16" | "auto";
	fps?: 24 | 25 | 48 | 50;
	generate_audio?: boolean;
}

/**
 * Request parameters for LTX Video 2.3 audio-to-video
 */
export interface LTX23A2VRequest {
	model: string;
	audio_url: string;
	image_url?: string;
	prompt?: string;
	guidance_scale?: number;
	duration?: 6 | 8 | 10;
	resolution?: "1080p" | "1440p" | "2160p";
	aspect_ratio?: "16:9" | "9:16";
	fps?: 24 | 25 | 48 | 50;
}

/**
 * Request parameters for avatar video generation
 */
export interface AvatarVideoRequest {
	model: string;
	/** Character image for avatar models (not required for lipsync models) */
	characterImage?: File;
	audioFile?: File;
	sourceVideo?: File;
	prompt?: string;
	resolution?: string;
	duration?: number;
	audioDuration?: number;
	characterImageUrl?: string;
	audioUrl?: string;
	// Sync Lipsync React-1 specific fields
	/** Pre-uploaded video URL for lipsync models */
	videoUrl?: string;
	/** Video duration in seconds for validation */
	videoDuration?: number;
	/** Emotion for Sync Lipsync React-1 */
	emotion?: SyncLipsyncEmotion;
	/** Model mode for Sync Lipsync React-1 */
	modelMode?: SyncLipsyncModelMode;
	/** Lipsync mode for Sync Lipsync React-1 */
	lipsyncMode?: SyncLipsyncSyncMode;
	/** Temperature for Sync Lipsync React-1 (0-1) */
	temperature?: number;
}

/**
 * Response from video generation APIs
 */
export interface VideoGenerationResponse {
	job_id: string;
	status: string;
	message: string;
	estimated_time?: number;
	video_url?: string;
	video_data?: unknown;
}

/**
 * Response for model listing
 */
export interface ModelsResponse {
	models: AIModel[];
}

/**
 * Cost estimation response
 */
export interface CostEstimate {
	model: string;
	duration: number;
	base_cost: number;
	estimated_cost: number;
	currency: string;
}

/**
 * Seedance image-to-video request parameters
 */
export interface SeedanceI2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
	resolution?: "480p" | "720p" | "1080p";
	aspect_ratio?: "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "auto";
	camera_fixed?: boolean;
	seed?: number;
	enable_safety_checker?: boolean;
	end_image_url?: string;
}

/**
 * Kling v2.5 Turbo Pro image-to-video request parameters
 */
export interface KlingI2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 5 | 10;
	cfg_scale?: number;
	aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	enhance_prompt?: boolean;
	negative_prompt?: string;
}

/**
 * Kling v2.6 Pro image-to-video request parameters
 */
export interface Kling26I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 5 | 10;
	generate_audio?: boolean;
	negative_prompt?: string;
}

/**
 * Kling O1 video-to-video request parameters
 */
export interface KlingO1V2VRequest {
	model: string;
	prompt: string;
	sourceVideo: File;
	duration?: 5 | 10;
	aspect_ratio?: "auto" | "16:9" | "9:16" | "1:1";
	keep_audio?: boolean;
}

/**
 * Kling O1 reference-to-video request parameters
 */
export interface KlingO1Ref2VideoRequest {
	model: string;
	prompt: string;
	image_urls: string[];
	duration?: 5 | 10;
	aspect_ratio?: "16:9" | "9:16" | "1:1";
	cfg_scale?: number;
	negative_prompt?: string;
}

/**
 * WAN 2.5 Preview image-to-video request parameters
 */
export interface WAN25I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 5 | 10;
	resolution?: "480p" | "720p" | "1080p";
	audio_url?: string;
	negative_prompt?: string;
	enable_prompt_expansion?: boolean;
	seed?: number;
}

/**
 * WAN v2.6 text-to-video request parameters
 */
export interface WAN26T2VRequest {
	model: string;
	prompt: string;
	duration?: 5 | 10 | 15;
	resolution?: "720p" | "1080p";
	aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	audio_url?: string;
	negative_prompt?: string;
	enable_prompt_expansion?: boolean;
	multi_shots?: boolean;
	seed?: number;
	enable_safety_checker?: boolean;
}

/**
 * WAN v2.6 image-to-video request parameters
 */
export interface WAN26I2VRequest {
	model: string;
	prompt: string;
	image_url: string;
	duration?: 5 | 10 | 15;
	resolution?: "720p" | "1080p";
	aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	audio_url?: string;
	negative_prompt?: string;
	enable_prompt_expansion?: boolean;
	seed?: number;
	enable_safety_checker?: boolean;
}

/**
 * WAN v2.6 reference-to-video request parameters
 *
 * Generates video using a reference video clip to guide motion/style
 * while maintaining subject identity from the prompt.
 */
export interface WAN26Ref2VideoRequest {
	model: string;
	/** Descriptive prompt for the generated video */
	prompt: string;
	/** Pre-uploaded reference video URL (FAL storage) */
	reference_video_url: string;
	/** Duration of output video in seconds */
	duration?: 5 | 10 | 15;
	/** Output video resolution */
	resolution?: "720p" | "1080p";
	/** Aspect ratio of output video */
	aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	/** Optional audio URL to sync with the output */
	audio_url?: string;
	/** Negative prompt to avoid unwanted elements */
	negative_prompt?: string;
	/** Enable AI prompt expansion for better results */
	enable_prompt_expansion?: boolean;
	/** Random seed for reproducibility */
	seed?: number;
	/** Enable safety content filtering */
	enable_safety_checker?: boolean;
}

/**
 * ByteDance video upscaler request parameters
 */
export interface ByteDanceUpscaleRequest {
	video_url: string;
	target_resolution?: "1080p" | "2k" | "4k";
	target_fps?: "30fps" | "60fps";
}

/**
 * FlashVSR video upscaler request parameters
 */
export interface FlashVSRUpscaleRequest {
	video_url: string;
	upscale_factor?: number;
	acceleration?: "regular" | "high" | "full";
	quality?: number;
	color_fix?: boolean;
	preserve_audio?: boolean;
	output_format?: "X264" | "VP9" | "PRORES4444" | "GIF";
	output_quality?: "low" | "medium" | "high" | "maximum";
	output_write_mode?: "fast" | "balanced" | "small";
	seed?: number;
}

/**
 * Topaz video upscaler request parameters
 */
export interface TopazUpscaleRequest {
	video_url: string;
	upscale_factor?: number;
	target_fps?: "original" | "interpolated";
	h264_output?: boolean;
}
