/**
 * AI Video Module
 *
 * Central barrel file for all AI video generation functionality.
 * Maintains backward compatibility with the original ai-video-client.ts exports.
 *
 * Module Structure:
 * - core/       - FAL API request utilities, polling, and streaming
 * - generators/ - Video generation functions by category
 * - models/     - Model-specific utilities (Sora2, etc.)
 * - validation/ - Input validation functions
 * - api.ts      - High-level API utilities
 */

// ============================================
// Core Utilities
// ============================================
export {
	getFalApiKey,
	getFalApiKeyAsync,
	clearFalApiKeyCache,
	FAL_API_BASE,
	FAL_UPLOAD_URL,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
	parseFalErrorResponse,
	type FalRequestOptions,
} from "./core/fal-request";

export {
	pollQueueStatus,
	handleQueueError,
	mapQueueStatusToProgress,
	type PollOptions,
} from "./core/polling";

export {
	streamVideoDownload,
	type StreamOptions,
} from "./core/streaming";

export {
	uploadFileToFal,
	uploadImageToFal,
	uploadAudioToFal,
	uploadVideoToFal,
	isElectronUploadAvailable,
	type FalUploadFileType,
	type FalUploadError,
} from "./core/fal-upload";

// ============================================
// Validation Functions
// ============================================
export {
	// Video validators
	validateHailuo23Prompt,
	validateViduQ2Prompt,
	validateViduQ2Duration,
	validateLTXV2Resolution,
	validateLTXV2T2VDuration,
	validateLTXV2I2VDuration,
	validateLTXV2FastExtendedConstraints,
	validateKlingAvatarV2Audio,
	isFastLTXV2TextModel,
	isLTX23Model,
	isLTX23FastModel,
	isLTX23ProModel,
	validateLTX23Resolution,
	validateLTX23Duration,
	validateLTX23FastExtendedConstraints,
	validateLTX23A2VDuration,
	isHailuo23TextToVideo,
	// Vidu Q3 validators
	validateViduQ3Prompt,
	validateViduQ3Duration,
	validateViduQ3Resolution,
	validateViduQ3AspectRatio,
	isViduQ3Model,
	VIDU_Q3_RESOLUTIONS,
	VIDU_Q3_ASPECT_RATIOS,
	VIDU_Q3_MAX_PROMPT_LENGTH,
	VIDU_Q3_MIN_DURATION,
	VIDU_Q3_MAX_DURATION,
	VIDU_Q3_DEFAULT_DURATION,
	// WAN v2.6 validators
	validateWAN26Prompt,
	validateWAN26NegativePrompt,
	validateWAN26Duration,
	validateWAN26Resolution,
	validateWAN26T2VResolution,
	validateWAN26AspectRatio,
	validateWAN26RefVideoUrl,
	isWAN26Model,
	isWAN26Ref2VideoModel,
	// Sync Lipsync React-1 validators
	validateSyncLipsyncReact1Inputs,
	validateSyncLipsyncReact1VideoDuration,
	validateSyncLipsyncReact1AudioDuration,
	validateSyncLipsyncReact1Emotion,
	validateSyncLipsyncReact1Temperature,
	SYNC_LIPSYNC_REACT1_MAX_DURATION,
	SYNC_LIPSYNC_REACT1_EMOTIONS,
	SYNC_LIPSYNC_REACT1_MODEL_MODES,
	SYNC_LIPSYNC_REACT1_SYNC_MODES,
	// Image validators
	VALID_OUTPUT_FORMATS,
	DEFAULT_OUTPUT_FORMAT,
	DEFAULT_ASPECT_RATIO,
	IMAGE_SIZE_TO_ASPECT_RATIO,
	MIN_REVE_IMAGES,
	MAX_REVE_IMAGES,
	MAX_REVE_PROMPT_LENGTH,
	normalizeAspectRatio,
	imageSizeToAspectRatio,
	normalizeOutputFormat,
	clampReveNumImages,
	truncateRevePrompt,
	validateRevePrompt,
	validateReveNumImages,
	type OutputFormat,
} from "./validation/validators";

// ============================================
// Model Utilities
// ============================================
export {
	isSora2Model,
	getSora2ModelType,
	convertSora2Parameters,
	parseSora2Response,
	type Sora2InputParams,
	type Sora2ParsedResponse,
} from "./models/sora2";

// ============================================
// Base Generator Utilities
// ============================================
export {
	getModelConfig,
	fileToDataURL,
	buildVideoResponse,
	withErrorHandling,
	createSimpleResponse,
} from "./generators/base-generator";

// ============================================
// Text-to-Video Generators
// ============================================
export {
	generateVideo,
	generateVideoFromText,
	generateLTXV2Video,
	generateWAN26TextVideo,
	generateViduQ3TextVideo,
} from "./generators/text-to-video";
export { generateLTX23TextVideo } from "./generators/text-to-video/ltx23-generator";

// ============================================
// Image-to-Video Generators
// ============================================
export {
	generateVideoFromImage,
	generateViduQ2Video,
	generateViduQ3ImageVideo,
	generateLTXV2ImageVideo,
	generateLTX23ImageVideo,
	generateLTX23AudioVideo,
	generateSeedanceVideo,
	generateKlingImageVideo,
	generateKling26ImageVideo,
	generateKlingO1Video,
	generateKlingO1RefVideo,
	generateWAN25ImageVideo,
	generateWAN26ImageVideo,
	generateWAN26RefVideo,
} from "./generators/image-to-video";

// ============================================
// Avatar Video Generators
// ============================================
export { generateAvatarVideo } from "./generators/avatar";

// ============================================
// Video Upscale Functions
// ============================================
export {
	upscaleByteDanceVideo,
	upscaleFlashVSRVideo,
	upscaleTopazVideo,
} from "./generators/upscale";

// ============================================
// Image Generation Functions
// ============================================
export {
	generateSeeddream45Image,
	editSeeddream45Image,
	uploadImageForSeeddream45Edit,
	type Seeddream45ImageResult,
	type Seeddream45GenerateParams,
	type Seeddream45EditParams,
} from "./generators/image";

// ============================================
// Cinematic Angles Generator
// ============================================
export {
	generateCinematicAngles,
	type AngleGenerationRequest,
	type AngleProgressCallback,
} from "./generators/angles";

// ============================================
// High-Level API Functions
// ============================================
export {
	getGenerationStatus,
	getAvailableModels,
	estimateCost,
	handleApiError,
	isApiAvailable,
} from "./api";
