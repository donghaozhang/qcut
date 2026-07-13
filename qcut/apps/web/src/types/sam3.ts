/**
 * SAM-3 (Segment Anything Model 3) Type Definitions
 *
 * Provides image segmentation with multiple prompt types:
 * - Text prompts: Natural language object descriptions
 * - Point prompts: Click coordinates with foreground/background labels
 * - Box prompts: Bounding box regions
 *
 * @module SAM3Types
 */

// ============================================
// Input Types
// ============================================

/**
 * Point prompt for SAM-3 segmentation
 * Represents a click point on the image with a label
 */
export interface Sam3PointPrompt {
	/** X coordinate (0-1 normalized or pixel value) */
	x: number;
	/** Y coordinate (0-1 normalized or pixel value) */
	y: number;
	/** 0 = background (exclude), 1 = foreground (include) */
	label: 0 | 1;
	/** Optional object ID for multi-object segmentation */
	object_id?: number;
}

/**
 * Box prompt for SAM-3 segmentation
 * Represents a bounding box region
 */
export interface Sam3BoxPrompt {
	/** Left edge X coordinate */
	x_min: number;
	/** Top edge Y coordinate */
	y_min: number;
	/** Right edge X coordinate */
	x_max: number;
	/** Bottom edge Y coordinate */
	y_max: number;
	/** Optional object ID for multi-object segmentation */
	object_id?: number;
}

/**
 * SAM-3 API input parameters
 */
export interface Sam3Input {
	/** URL of image to segment (required) */
	image_url: string;
	/** Text description of object to segment */
	text_prompt?: string;
	/** Point prompts for click-based segmentation */
	prompts?: Sam3PointPrompt[];
	/** Box prompts for region-based segmentation */
	box_prompts?: Sam3BoxPrompt[];
	/** Apply mask overlay to output image (default: true) */
	apply_mask?: boolean;
	/** Return as data URI instead of URL (default: false) */
	sync_mode?: boolean;
	/** Output image format (default: "png") */
	output_format?: "jpeg" | "png" | "webp";
	/** Return multiple mask options (default: false) */
	return_multiple_masks?: boolean;
	/** Maximum masks to return when return_multiple_masks=true (default: 3) */
	max_masks?: number;
	/** Include confidence scores in response (default: false) */
	include_scores?: boolean;
	/** Include bounding boxes in response (default: false) */
	include_boxes?: boolean;
}

// ============================================
// Output Types
// ============================================

/**
 * Image output from SAM-3
 */
export interface Sam3ImageOutput {
	/** URL to the image */
	url: string;
	/** Original filename */
	file_name?: string;
	/** MIME type (e.g., "image/png") */
	content_type?: string;
	/** Image width in pixels */
	width?: number;
	/** Image height in pixels */
	height?: number;
	/** File size in bytes */
	file_size?: number;
}

/**
 * Per-mask metadata (scores and boxes)
 */
export interface Sam3MaskMetadata {
	/** Confidence scores for each mask */
	scores?: number[];
	/** Bounding boxes in [cx, cy, w, h] normalized format */
	boxes?: number[][];
}

/**
 * SAM-3 API response
 */
export interface Sam3Output {
	/** Composite image with mask overlay (when apply_mask=true) */
	image?: Sam3ImageOutput;
	/** Individual segmentation masks */
	masks: Sam3ImageOutput[];
	/** Per-mask metadata */
	metadata?: Sam3MaskMetadata[];
	/** Confidence scores (when include_scores=true) */
	scores?: number[][];
	/** Bounding boxes (when include_boxes=true) */
	boxes?: number[][][];
}

// ============================================
// Convenience Types
// ============================================

/**
 * Segmentation mode for UI selection
 */
export type Sam3SegmentationMode = "text" | "point" | "box" | "auto";

/**
 * Simplified result for UI consumption
 */
export interface Sam3SegmentationResult {
	/** Job/request ID */
	jobId: string;
	/** Status of the operation */
	status: "processing" | "completed" | "failed";
	/** Error message if failed */
	error?: string;
	/** Masked image URL */
	maskedImageUrl?: string;
	/** Individual mask URLs */
	maskUrls: string[];
	/** Confidence scores per mask */
	scores?: number[];
	/** Processing time in ms */
	processingTime?: number;
}

/**
 * Progress callback for segmentation operations
 */
export type Sam3ProgressCallback = (status: {
	status: "queued" | "processing" | "completed" | "failed";
	progress?: number;
	message?: string;
	elapsedTime?: number;
}) => void;

// ============================================
// Video Segmentation Types
// ============================================

/**
 * Point prompt for video segmentation
 * Includes frame_index for specifying which frame the prompt applies to
 */
export interface Sam3VideoPointPrompt extends Sam3PointPrompt {
	/** Frame index to interact with (0-based) */
	frame_index?: number;
}

/**
 * Box prompt for video segmentation
 * Includes frame_index for specifying which frame the prompt applies to
 */
export interface Sam3VideoBoxPrompt extends Sam3BoxPrompt {
	/** Frame index to interact with (0-based) */
	frame_index?: number;
}

/**
 * SAM-3 Video API input parameters
 */
export interface Sam3VideoInput {
	/** URL of video to segment (required) */
	video_url: string;
	/** Text description of object to segment */
	prompt?: string;
	/** Point prompts for click-based segmentation with frame indices */
	point_prompts?: Sam3VideoPointPrompt[];
	/** Box prompts for region-based segmentation with frame indices */
	box_prompts?: Sam3VideoBoxPrompt[];
	/** Apply mask overlay to output video (default: true) */
	apply_mask?: boolean;
	/** Video container/codec returned by the service. */
	video_output_type?: "X264 (.mp4)" | "VP9 (.webm)";
	/** Confidence threshold for detection (0.01-1.0, default: 0.5) */
	detection_threshold?: number;
	/** Return per-frame bounding box overlays as zip (default: false) */
	boundingbox_zip?: boolean;
	/** Initial frame index for mask application (default: 0) */
	frame_index?: number;
	/** Initial mask URL for tracking */
	mask_url?: string;
}

/**
 * File output from SAM-3 video
 */
export interface Sam3FileOutput {
	/** URL to download the file */
	url: string;
	/** MIME type (e.g., "video/mp4") */
	content_type?: string;
	/** Generated filename */
	file_name?: string;
	/** File size in bytes */
	file_size?: number;
}

/**
 * SAM-3 Video API response
 */
export interface Sam3VideoOutput {
	/** Segmented output video */
	video: Sam3FileOutput;
	/** Optional zip with per-frame bounding box overlays */
	boundingbox_frames_zip?: Sam3FileOutput;
}

/**
 * Progress callback for video segmentation operations
 */
export type Sam3VideoProgressCallback = (status: {
	status: "queued" | "processing" | "completed" | "failed";
	/** Stable FAL queue identity used to resume polling after an interruption. */
	requestId?: string;
	progress?: number;
	message?: string;
	elapsedTime?: number;
	framesProcessed?: number;
	totalFrames?: number;
}) => void;
