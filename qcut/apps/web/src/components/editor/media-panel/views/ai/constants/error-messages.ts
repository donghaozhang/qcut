/**
 * Error Messages for AI Video Generation
 *
 * Centralized error messages for AI video generation features.
 * Organized by model/feature for easy maintenance.
 */

export const ERROR_MESSAGES = {
	// Common errors
	INVALID_FILE_TYPE: "Please select a valid image file",
	FILE_TOO_LARGE: "Image file too large (max 10MB)",
	NO_MODELS_SELECTED: "Please select at least one AI model",
	EMPTY_PROMPT: "Please enter a prompt for video generation",
	GENERATION_FAILED: "Video generation failed. Please try again.",
	DOWNLOAD_FAILED: "Failed to download video. Please try again.",
	HISTORY_SAVE_FAILED: "Failed to save generation history",
	HISTORY_LOAD_FAILED: "Failed to load generation history",

	// Veo 3.1 specific errors
	VEO31_IMAGE_TOO_LARGE: "Image must be under 8MB for Veo 3.1",
	VEO31_INVALID_ASPECT_RATIO:
		"Veo 3.1 requires 16:9 or 9:16 aspect ratio for images",
	VEO31_MISSING_FIRST_FRAME:
		"First frame is required for Veo 3.1 frame-to-video",
	VEO31_MISSING_LAST_FRAME: "Last frame is required for Veo 3.1 frame-to-video",
	VEO31_FRAME_ASPECT_MISMATCH:
		"First and last frames must have matching aspect ratios",

	// Hailuo 2.3 Text-to-Video errors
	HAILUO23_T2V_PROMPT_TOO_LONG_STANDARD:
		"Prompt exceeds 1500 character limit for Hailuo 2.3 Standard",
	HAILUO23_T2V_PROMPT_TOO_LONG_PRO:
		"Prompt exceeds 2000 character limit for Hailuo 2.3 Pro",
	HAILUO23_T2V_EMPTY_PROMPT: "Please enter a text prompt for video generation",
	HAILUO23_T2V_INVALID_DURATION:
		"Duration must be either 6 or 10 seconds for Hailuo 2.3 models",

	// Reve specific errors
	REVE_IMAGE_TOO_LARGE: "Image must be under 10MB for Reve Edit",
	REVE_INVALID_DIMENSIONS:
		"Image dimensions must be between 128×128 and 4096×4096 pixels",
	REVE_INVALID_FORMAT: "Please upload PNG, JPEG, WebP, AVIF, or HEIF image",
	REVE_PROMPT_TOO_LONG: "Prompt must be under 2560 characters",

	// Vidu Q2 errors
	VIDU_Q2_PROMPT_TOO_LONG: "Prompt exceeds 3000 character limit for Vidu Q2",
	VIDU_Q2_INVALID_DURATION:
		"Duration must be between 2 and 8 seconds for Vidu Q2",
	VIDU_Q2_MISSING_IMAGE:
		"Image is required for Vidu Q2 image-to-video generation",

	// Vidu Q3 errors
	VIDU_Q3_EMPTY_PROMPT:
		"Please enter a text prompt for Vidu Q3 video generation",
	VIDU_Q3_PROMPT_TOO_LONG:
		"Prompt exceeds maximum length of 2000 characters for Vidu Q3",
	VIDU_Q3_INVALID_DURATION: "Vidu Q3 currently only supports 5-second duration",
	VIDU_Q3_INVALID_RESOLUTION:
		"Invalid resolution for Vidu Q3. Supported: 360p, 540p, 720p, 1080p",
	VIDU_Q3_INVALID_ASPECT_RATIO:
		"Invalid aspect ratio for Vidu Q3. Supported: 16:9, 9:16, 4:3, 3:4, 1:1",
	VIDU_Q3_I2V_MISSING_IMAGE:
		"Image is required for Vidu Q3 image-to-video generation",

	// LTX Video 2.0 errors
	LTXV2_INVALID_DURATION:
		"Duration must be 6, 8, or 10 seconds for LTX Video 2.0",
	LTXV2_INVALID_RESOLUTION:
		"Resolution must be 1080p, 1440p, or 2160p for LTX Video 2.0",
	LTXV2_EMPTY_PROMPT: "Please enter a text prompt for LTX Video 2.0",
	LTXV2_FAST_T2V_INVALID_DURATION:
		"Duration must be 6, 8, 10, 12, 14, 16, 18, or 20 seconds for LTX Video 2.0 Fast Text-to-Video",
	LTXV2_FAST_T2V_EXTENDED_DURATION_CONSTRAINT:
		"Videos longer than 10 seconds require 1080p resolution and 25 FPS for LTX Video 2.0 Fast",
	LTXV2_STD_I2V_EMPTY_PROMPT:
		"Please enter a prompt describing the desired video motion",
	LTXV2_STD_I2V_MISSING_IMAGE:
		"Image URL is required for LTX Video 2.0 image-to-video generation",
	LTXV2_STD_I2V_INVALID_DURATION:
		"Duration must be 6, 8, or 10 seconds for LTX Video 2.0",
	LTXV2_STD_I2V_INVALID_RESOLUTION:
		"Resolution must be 1080p (1920x1080), 1440p (2560x1440), or 2160p (3840x2160) for LTX Video 2.0 Standard",
	LTXV2_STD_I2V_IMAGE_TOO_LARGE:
		"Image file must be under 7MB for LTX Video 2.0 image-to-video",
	LTXV2_STD_I2V_INVALID_FORMAT:
		"Image must be PNG, JPEG, WebP, AVIF, or HEIF for LTX Video 2.0 image-to-video",
	LTXV2_I2V_INVALID_DURATION:
		"Duration must be 6, 8, 10, 12, 14, 16, 18, or 20 seconds for LTX Video 2.0 Fast",
	LTXV2_I2V_INVALID_RESOLUTION:
		"Resolution must be 1080p (1920x1080), 1440p (2560x1440), or 2160p (3840x2160) for LTX Video 2.0 Fast I2V",
	LTXV2_I2V_EXTENDED_DURATION_CONSTRAINT:
		"Videos longer than 10 seconds require 1080p resolution and 25 FPS for LTX Video 2.0 Fast",
	LTXV2_I2V_MISSING_IMAGE:
		"Image is required for LTX Video 2.0 Fast image-to-video generation",

	// LTX Video 2.3 errors
	LTX23_PRO_INVALID_DURATION:
		"Duration must be 6, 8, or 10 seconds for LTX Video 2.3 Pro",
	LTX23_FAST_INVALID_DURATION:
		"Duration must be 6, 8, 10, 12, 14, 16, 18, or 20 seconds for LTX Video 2.3 Fast",
	LTX23_INVALID_RESOLUTION:
		"Resolution must be 1080p, 1440p, or 2160p for LTX Video 2.3",
	LTX23_EXTENDED_DURATION_CONSTRAINT:
		"Videos longer than 10 seconds require 1080p resolution and 25 FPS for LTX Video 2.3 Fast",
	LTX23_EMPTY_PROMPT: "Please enter a text prompt for LTX Video 2.3 generation",
	LTX23_I2V_MISSING_IMAGE:
		"Image is required for LTX Video 2.3 image-to-video generation",
	LTX23_A2V_MISSING_AUDIO:
		"Audio file is required for LTX Video 2.3 audio-to-video generation",
	LTX23_A2V_INVALID_DURATION:
		"Duration must be 6, 8, or 10 seconds for LTX Video 2.3 audio-to-video",
	LTX23_A2V_AUDIO_TOO_SHORT:
		"Audio must be at least 2 seconds for LTX Video 2.3 audio-to-video",
	LTX23_A2V_AUDIO_TOO_LONG:
		"Audio must be no longer than 20 seconds for LTX Video 2.3 audio-to-video",

	// Seeddream 4.5 errors
	SEEDDREAM45_EMPTY_PROMPT: "Please enter a prompt for image generation",
	SEEDDREAM45_EDIT_NO_IMAGES: "Please select at least one image to edit",
	SEEDDREAM45_EDIT_TOO_MANY_IMAGES:
		"Maximum 10 images allowed for Seeddream 4.5 edit",
	SEEDDREAM45_UPLOAD_FAILED: "Failed to upload image for editing",
	SEEDDREAM45_GENERATION_FAILED: "Seeddream 4.5 image generation failed",

	// Kling 2.6 specific errors
	KLING26_EMPTY_PROMPT: "Please enter a prompt for Kling 2.6 video generation",
	KLING26_INVALID_DURATION: "Duration must be 5 or 10 seconds for Kling 2.6",
	KLING26_INVALID_ASPECT_RATIO:
		"Aspect ratio must be 16:9, 9:16, or 1:1 for Kling 2.6",
	KLING26_I2V_MISSING_IMAGE:
		"Image is required for Kling 2.6 image-to-video generation",
	KLING26_PROMPT_TOO_LONG:
		"Prompt exceeds maximum length of 2,500 characters for Kling 2.6",

	// Kling Avatar v2 specific errors
	KLING_AVATAR_V2_MISSING_IMAGE:
		"Character image is required for Kling Avatar v2",
	KLING_AVATAR_V2_MISSING_AUDIO: "Audio file is required for Kling Avatar v2",
	KLING_AVATAR_V2_AUDIO_TOO_SHORT:
		"Audio must be at least 2 seconds for Kling Avatar v2",
	KLING_AVATAR_V2_AUDIO_TOO_LONG:
		"Audio must be under 60 seconds for Kling Avatar v2",
	KLING_AVATAR_V2_AUDIO_TOO_LARGE:
		"Audio file must be under 5MB for Kling Avatar v2",

	// Sync Lipsync React-1 specific errors
	SYNC_LIPSYNC_REACT1_MISSING_VIDEO:
		"Video is required for Sync Lipsync React-1",
	SYNC_LIPSYNC_REACT1_MISSING_AUDIO:
		"Audio is required for Sync Lipsync React-1",
	SYNC_LIPSYNC_REACT1_VIDEO_TOO_LONG:
		"Video must be 15 seconds or shorter for Sync Lipsync React-1",
	SYNC_LIPSYNC_REACT1_AUDIO_TOO_LONG:
		"Audio must be 15 seconds or shorter for Sync Lipsync React-1",
	SYNC_LIPSYNC_REACT1_MISSING_EMOTION:
		"Emotion is required for Sync Lipsync React-1",
	SYNC_LIPSYNC_REACT1_INVALID_EMOTION:
		"Invalid emotion for Sync Lipsync React-1. Must be one of: happy, angry, sad, neutral, disgusted, surprised",
	SYNC_LIPSYNC_REACT1_INVALID_TEMPERATURE:
		"Temperature must be between 0 and 1 for Sync Lipsync React-1",

	// Video file fallback errors
	VIDEO_FILE_TOO_LARGE_FOR_FALLBACK:
		"Video file too large for browser fallback (max 50MB). Please use the desktop app for larger files.",

	// Veo 3.1 Extend-Video specific errors
	EXTEND_VIDEO_TOO_LONG:
		"Input video must be 8 seconds or less for Veo 3.1 extend-video",
	EXTEND_VIDEO_INVALID_RESOLUTION:
		"Video must be 720p or 1080p for Veo 3.1 extend-video",
	EXTEND_VIDEO_INVALID_ASPECT_RATIO:
		"Video must be 16:9 or 9:16 for Veo 3.1 extend-video",
	EXTEND_VIDEO_MISSING: "Please upload a source video to extend",
	EXTEND_VIDEO_INVALID_FORMAT:
		"Video format must be MP4, MOV, WebM, M4V, or GIF for Veo 3.1 extend-video",

	// WAN v2.6 specific errors
	WAN26_EMPTY_PROMPT: "Please enter a prompt for WAN v2.6 video generation",
	WAN26_PROMPT_TOO_LONG:
		"Prompt exceeds maximum length of 2000 characters for WAN v2.6",
	WAN26_NEGATIVE_PROMPT_TOO_LONG:
		"Negative prompt exceeds maximum length of 1000 characters for WAN v2.6",
	WAN26_INVALID_DURATION: "Duration must be 5, 10, or 15 seconds for WAN v2.6",
	WAN26_INVALID_RESOLUTION: "Resolution must be 720p or 1080p for WAN v2.6",
	WAN26_T2V_INVALID_RESOLUTION:
		"Resolution must be 720p or 1080p for WAN v2.6 text-to-video",
	WAN26_INVALID_ASPECT_RATIO:
		"Aspect ratio must be 16:9, 9:16, 1:1, 4:3, or 3:4 for WAN v2.6",
	WAN26_I2V_MISSING_IMAGE:
		"Image is required for WAN v2.6 image-to-video generation",
} as const;

export type ErrorMessageKey = keyof typeof ERROR_MESSAGES;
