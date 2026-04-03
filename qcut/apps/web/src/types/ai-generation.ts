/**
 * Type definitions for AI video generation features
 * Including Veo 3.1 integration
 */

// ============================================
// Veo 3.1 Type Definitions
// ============================================

/**
 * Veo 3.1 Text-to-Video Input Parameters
 */
export interface Veo31TextToVideoInput {
	prompt: string; // Required: Text description for video
	aspect_ratio?: "9:16" | "16:9" | "1:1"; // Default: "16:9"
	duration?: "4s" | "6s" | "8s"; // Default: "8s"
	resolution?: "720p" | "1080p"; // Default: "720p"
	generate_audio?: boolean; // Default: true
	negative_prompt?: string; // Optional: What to avoid
	enhance_prompt?: boolean; // Default: true
	seed?: number; // For reproducibility
	auto_fix?: boolean; // Policy compliance, default: true
}

/**
 * Veo 3.1 Image-to-Video Input Parameters
 */
export interface Veo31ImageToVideoInput {
	prompt: string; // Required: Animation description
	image_url: string; // Required: Input image URL (720p+, 16:9 or 9:16)
	aspect_ratio?: "auto" | "16:9" | "9:16"; // Default: "16:9" (Lite supports "auto")
	duration?: "4s" | "6s" | "8s"; // Standard/Fast: "8s" only; Lite: "4s"/"6s"/"8s"
	resolution?: "720p" | "1080p"; // Default: "720p"
	generate_audio?: boolean; // Default: true
}

/**
 * Veo 3.1 First-Last-Frame-to-Video Input Parameters
 */
export interface Veo31FrameToVideoInput {
	prompt: string; // Required: Animation description
	first_frame_url: string; // Required: Opening frame URL
	last_frame_url: string; // Required: Closing frame URL
	aspect_ratio?: "9:16" | "16:9"; // Default: "16:9"
	duration?: "8s"; // Currently only "8s" supported
	resolution?: "720p" | "1080p"; // Default: "720p"
	generate_audio?: boolean; // Default: true
}

/**
 * Veo 3.1 Extend-Video Input Parameters
 * Extends an existing video by 7 seconds based on a text prompt
 */
export interface Veo31ExtendVideoInput {
	prompt: string; // Required: How the video should continue
	video_url: string; // Required: Video to extend (720p+, 16:9 or 9:16, up to 8s)
	aspect_ratio?: "auto" | "16:9" | "9:16"; // Default: "auto"
	duration?: "7s"; // Currently only "7s" supported
	resolution?: "720p"; // Currently only "720p" supported
	generate_audio?: boolean; // Default: true
	auto_fix?: boolean; // Default: false
}

/**
 * Veo 3.1 API Response
 */
export interface Veo31Response {
	video: {
		url: string;
		content_type: string;
		file_name: string;
	};
}

/**
 * Veo 3.1 Settings State
 */
export interface Veo31Settings {
	resolution: "720p" | "1080p";
	duration: "4s" | "6s" | "8s";
	aspectRatio: "9:16" | "16:9" | "1:1" | "auto";
	generateAudio: boolean;
	enhancePrompt: boolean;
	autoFix: boolean;
}

// ============================================
// Existing Generation Types (for reference)
// ============================================

export interface GeneratedVideo {
	jobId: string;
	videoUrl: string;
	videoPath?: string;
	fileSize?: number;
	duration?: number;
	prompt: string;
	model: string;
}

export interface GeneratedVideoResult {
	modelId: string;
	video: GeneratedVideo;
}

// ============================================
// Reve Models Type Definitions
// ============================================

/**
 * Reve Text-to-Image Input Parameters
 */
export interface ReveTextToImageInput {
	prompt: string; // Required: 1-2560 characters
	aspect_ratio?: "16:9" | "9:16" | "3:2" | "2:3" | "4:3" | "3:4" | "1:1"; // Default: "3:2"
	num_images?: number; // 1-4, default: 1
	output_format?: "png" | "jpeg" | "webp"; // Default: "png"
	sync_mode?: boolean; // Default: false
}

/**
 * Reve Text-to-Image Output
 */
export interface ReveTextToImageOutput {
	images: Array<{
		url: string;
		content_type?: string;
		file_name?: string;
		file_size?: number;
		width?: number;
		height?: number;
	}>;
}

/**
 * Reve Edit Input Parameters
 */
export interface ReveEditInput {
	prompt: string; // Required: editing instructions
	image_url: string; // Required: image to edit (URL or base64 data URI)
	num_images?: number; // 1-4, default: 1
	output_format?: "png" | "jpeg" | "webp"; // Default: "png"
	sync_mode?: boolean; // Default: false
}

/**
 * Reve Edit Output
 */
export interface ReveEditOutput {
	images: Array<{
		url: string;
		content_type?: string;
		file_name?: string;
		file_size?: number;
		width?: number;
		height?: number;
	}>;
}

export type UpscaleModelId =
	import("@/lib/ai-models/upscale-models").UpscaleModelId;
export interface UpscaleResult {
	url: string;
	scale: number;
	dimensions: { width: number; height: number };
}

// ============================================
// SAM-3 Segmentation Types (re-export)
// ============================================
export type {
	Sam3Input,
	Sam3Output,
	Sam3PointPrompt,
	Sam3BoxPrompt,
	Sam3ImageOutput,
	Sam3MaskMetadata,
	Sam3SegmentationMode,
	Sam3SegmentationResult,
	Sam3ProgressCallback,
	// Video types
	Sam3VideoInput,
	Sam3VideoOutput,
	Sam3VideoPointPrompt,
	Sam3VideoBoxPrompt,
	Sam3FileOutput,
	Sam3VideoProgressCallback,
} from "./sam3";
