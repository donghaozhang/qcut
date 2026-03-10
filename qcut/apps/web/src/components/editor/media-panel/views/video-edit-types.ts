/**
 * Video Edit Feature Type Definitions
 *
 * WHY this file exists:
 * - Centralized type safety for all video edit features
 * - Prevents type drift between components and API client
 * - Enables IntelliSense across the feature
 */

import type { TProject } from "@/types/project";

/**
 * Tab discriminator for the three video edit models
 */
export type VideoEditTab = "audio-gen" | "audio-sync" | "upscale" | "translate";

/**
 * Kling Video to Audio Parameters
 *
 * WHY each field:
 * - video_url: FAL AI requires base64 data URL or public HTTP URL
 * - sound_effect_prompt: Optional creative control for sound generation
 * - background_music_prompt: Optional creative control for music
 * - asmr_mode: Premium feature that costs 2x but enhances subtle sounds
 *
 * Edge case: ASMR mode ignored for videos >10 seconds (API limitation)
 */
export interface KlingVideoToAudioParams {
	video_url: string;
	sound_effect_prompt?: string;
	background_music_prompt?: string;
	asmr_mode?: boolean;
}

/**
 * MMAudio V2 Parameters
 *
 * WHY each field:
 * - prompt: Required for directing audio style/content
 * - negative_prompt: Prevents unwanted sounds (e.g., "no speech")
 * - num_steps: Quality vs speed tradeoff (25 is optimal)
 * - cfg_strength: Balance between prompt adherence and video sync
 *
 * Business logic: $0.001 per second of output audio
 * Performance: num_steps linearly affects processing time
 */
export interface MMAudioV2Params {
	video_url: string;
	prompt: string;
	negative_prompt?: string;
	seed?: number;
	num_steps?: number; // 10-50, default 25
	duration?: number; // Auto-detected if omitted
	cfg_strength?: number; // 1.0-7.0, default 4.5
	mask_away_clip?: boolean;
}

/**
 * Topaz Upscale Parameters
 *
 * WHY each field:
 * - upscale_factor: Direct resolution multiplier (2.0 = double width/height)
 * - target_fps: Enables frame interpolation when set
 * - H264_output: Trade-off between compatibility (H264) vs size (H265)
 *
 * Edge case: upscale_factor >4.0 may fail for 720p+ sources (8K output limit)
 * Performance: Processing time increases exponentially with upscale_factor
 */
export interface TopazUpscaleParams {
	video_url: string;
	upscale_factor?: number; // 1.0-8.0, default 2.0
	target_fps?: number; // 24/30/60/120
	H264_output?: boolean; // Default false (H265)
}

/**
 * HeyGen Translate Parameters
 *
 * WHY each field:
 * - output_language: Target language for translation (40+ supported)
 * - translate_audio_only: Skip lip-sync, only translate voice
 * - enable_dynamic_duration: Adjust duration for different speaking rates
 * - speaker_num: Number of speakers in the video (auto-detected if omitted)
 */
export interface HeyGenTranslateParams {
	output_language: string;
	translate_audio_only?: boolean;
	enable_dynamic_duration?: boolean;
	speaker_num?: number;
}

/**
 * Union type for default parameters
 * WHY: Type-safe default parameters without using 'any'
 * Excludes 'video_url' since it's runtime-provided
 */
type VideoEditDefaultParams =
	| Omit<Partial<KlingVideoToAudioParams>, "video_url">
	| Omit<Partial<MMAudioV2Params>, "video_url">
	| Omit<Partial<TopazUpscaleParams>, "video_url">;

/**
 * Video Edit Model Configuration
 * Matches pattern from ai-constants.ts for consistency
 */
export interface VideoEditModel {
	id: string;
	name: string;
	description: string;
	price: string; // String to support "$0.001/sec" format
	category: "audio-gen" | "audio-sync" | "upscale";
	max_video_size?: number; // Bytes
	max_duration?: number; // Seconds
	endpoints: {
		process: string; // FAL AI endpoint path
	};
	default_params?: VideoEditDefaultParams;
}

/**
 * Processing Result
 *
 * WHY this structure:
 * - jobId: FAL AI polling identifier
 * - videoUrl: May be same as input for audio-only edits
 * - audioUrl: Separate for standalone audio files
 *
 * Edge case: videoUrl might be null if processing failed with 200 status
 */
export interface VideoEditResult {
	modelId: string;
	videoUrl: string | null;
	audioUrl?: string;
	jobId: string;
	duration?: number;
	fileSize?: number;
	width?: number; // Video width in pixels
	height?: number; // Video height in pixels
	cost?: number; // Calculated cost in USD
}

/**
 * Processing Hook Props
 * Follows pattern from use-ai-generation.ts
 */
export interface UseVideoEditProcessingProps {
	sourceVideo: File | null;
	activeTab: VideoEditTab;
	activeProject: TProject | null; // From useProjectStore
	onSuccess?: (result: VideoEditResult) => void;
	onError?: (error: string) => void;
	onProgress?: (progress: number, message: string) => void;
}

/**
 * Processing State
 * Comprehensive state tracking for UI updates
 */
export interface VideoEditProcessingState {
	isProcessing: boolean;
	progress: number; // 0-100
	statusMessage: string;
	elapsedTime: number; // Seconds
	estimatedTime?: number; // Seconds
	currentStage:
		| "uploading"
		| "queued"
		| "processing"
		| "downloading"
		| "complete"
		| "failed";
	result: VideoEditResult | null;
	error: string | null;
}
