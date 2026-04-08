/**
 * AI Types — barrel re-export
 * Split from ai-types.ts into focused modules
 */

// Model configuration
export type {
	AIModelEndpoints,
	UpscaleModelEndpoints,
	AIModelParameters,
	UpscaleModelParameters,
	ModelCategory,
	AIModel,
} from "./model-config";

// Generation state and progress
export type {
	GeneratedVideo,
	GeneratedVideoResult,
	PollingState,
	AIServiceManager,
	ProgressUpdate,
	ProgressCallback,
	GenerationStatus,
	APIConfiguration,
	AIError,
} from "./generation";

// Hook props and state
export type {
	UseAIGenerationProps,
	AIGenerationState,
	UseAIHistoryProps,
	AIHistoryState,
	AIActiveTab,
	AvatarUploadState,
	ImageUploadState,
} from "./hook-props";

// Request/response types
export type {
	VideoGenerationRequest,
	ImageToVideoRequest,
	TextToVideoRequest,
	ViduQ2I2VRequest,
	ViduQ3T2VRequest,
	ViduQ3I2VRequest,
	LTXV2T2VRequest,
	LTXV2I2VRequest,
	LTX23T2VRequest,
	LTX23I2VRequest,
	LTX23A2VRequest,
	AvatarVideoRequest,
	VideoGenerationResponse,
	ModelsResponse,
	CostEstimate,
	SeedanceI2VRequest,
	Seedance2I2VRequest,
	Seedance2Ref2VRequest,
	KlingI2VRequest,
	Kling26I2VRequest,
	KlingO1V2VRequest,
	KlingO1Ref2VideoRequest,
	WAN25I2VRequest,
	WAN26T2VRequest,
	WAN26I2VRequest,
	WAN26Ref2VideoRequest,
	ByteDanceUpscaleRequest,
	FlashVSRUpscaleRequest,
	TopazUpscaleRequest,
	PixverseV6I2VRequest,
} from "./request-types";

// Lipsync types
export type {
	SyncLipsyncEmotion,
	SyncLipsyncModelMode,
	SyncLipsyncSyncMode,
	SyncLipsyncReact1Request,
} from "./lipsync-types";

// Sora 2 types
export type {
	Sora2ModelType,
	Sora2BasePayload,
	Sora2Payload,
} from "./sora2-types";

// Seeddream types
export type {
	Seeddream45ImageSize,
	Seeddream45TextToImageParams,
	Seeddream45EditParams,
} from "./seeddream-types";

// Convenience aliases
export type { AIModel as Model } from "./model-config";
export type {
	GeneratedVideo as Video,
	GeneratedVideoResult as VideoResult,
	PollingState as Polling,
	AIServiceManager as ServiceManager,
} from "./generation";
export type {
	AIGenerationState as GenerationState,
	AIHistoryState as HistoryState,
} from "./hook-props";
