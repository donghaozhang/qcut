/**
 * Hook props and state interfaces for AI generation
 */

import type { TProject } from "@/types/project";
import type {
	GeneratedVideo,
	GeneratedVideoResult,
	ProgressUpdate,
} from "./generation";
import type {
	SyncLipsyncEmotion,
	SyncLipsyncModelMode,
	SyncLipsyncSyncMode,
} from "./lipsync-types";
import type { Seeddream45ImageSize } from "./seeddream-types";

// Hook Interface Definitions (Enhanced based on validation findings)

// ⚠️ ENHANCED: Include ALL state variables identified in source validation

export interface UseAIGenerationProps {
	prompt: string;
	selectedModels: string[];
	selectedImage: File | null;
	activeTab: "text" | "image" | "avatar" | "upscale" | "angles";
	activeProject: TProject | null;
	onProgress: (status: ProgressUpdate) => void;
	onError: (error: string) => void;
	onComplete: (videos: GeneratedVideoResult[]) => void;
	// ⚠️ CRITICAL ADDITIONS: Include missing dependencies from validation
	onJobIdChange?: (jobId: string | null) => void;
	// Avatar-specific props
	avatarImage?: File | null;
	audioFile?: File | null;
	sourceVideo?: File | null;
	referenceImages?: (File | null)[];
	onGeneratedVideoChange?: (video: GeneratedVideo | null) => void;
	// Hailuo text-to-video options
	hailuoT2VDuration?: 6 | 10;
	// Unified text-to-video controls
	t2vAspectRatio?: string;
	t2vResolution?: string;
	t2vDuration?: number;
	t2vNegativePrompt?: string;
	t2vPromptExpansion?: boolean;
	t2vSeed?: number;
	t2vSafetyChecker?: boolean;
	// Vidu Q2 Turbo options
	viduQ2Duration?: 2 | 3 | 4 | 5 | 6 | 7 | 8;
	viduQ2Resolution?: "720p" | "1080p";
	viduQ2MovementAmplitude?: "auto" | "small" | "medium" | "large";
	viduQ2EnableBGM?: boolean;
	// LTX Video 2.0 options
	ltxv2Duration?: 6 | 8 | 10;
	ltxv2Resolution?: "1080p" | "1440p" | "2160p";
	ltxv2FPS?: 25 | 50;
	ltxv2GenerateAudio?: boolean;
	// LTX Video 2.0 Fast text-to-video options
	ltxv2FastDuration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	ltxv2FastResolution?: "1080p" | "1440p" | "2160p";
	ltxv2FastFPS?: 25 | 50;
	ltxv2FastGenerateAudio?: boolean;
	// LTX Video 2.3 text-to-video options
	ltx23Duration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	ltx23Resolution?: "1080p" | "1440p" | "2160p";
	ltx23FPS?: 24 | 25 | 48 | 50;
	ltx23GenerateAudio?: boolean;
	ltx23AspectRatio?: "16:9" | "9:16";
	// LTX Video 2.0 standard image-to-video options
	ltxv2I2VDuration?: 6 | 8 | 10;
	ltxv2I2VResolution?: "1080p" | "1440p" | "2160p";
	ltxv2I2VFPS?: 25 | 50;
	ltxv2I2VGenerateAudio?: boolean;
	// LTX Video 2.0 Fast image-to-video options
	ltxv2ImageDuration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	ltxv2ImageResolution?: "1080p" | "1440p" | "2160p"; // Fast I2V supports 1080p/1440p/2160p, not 720p
	ltxv2ImageFPS?: 25 | 50;
	ltxv2ImageGenerateAudio?: boolean;
	// LTX Video 2.3 image-to-video options
	ltx23I2VDuration?: 6 | 8 | 10 | 12 | 14 | 16 | 18 | 20;
	ltx23I2VResolution?: "1080p" | "1440p" | "2160p";
	ltx23I2VFPS?: 24 | 25 | 48 | 50;
	ltx23I2VGenerateAudio?: boolean;
	ltx23I2VAspectRatio?: "16:9" | "9:16" | "auto";
	ltx23I2VEndImageUrl?: string | null;
	ltx23I2VEndImageFile?: File | null;
	// Seedance image-to-video options
	seedanceDuration?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
	seedanceResolution?: "480p" | "720p" | "1080p";
	seedanceAspectRatio?:
		| "21:9"
		| "16:9"
		| "4:3"
		| "1:1"
		| "3:4"
		| "9:16"
		| "auto";
	seedanceCameraFixed?: boolean;
	seedanceEndFrameUrl?: string;
	seedanceEndFrameFile?: File | null;
	imageSeed?: number;
	// Kling v2.5 Turbo Pro I2V options
	klingDuration?: 5 | 10;
	klingCfgScale?: number;
	klingAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	klingEnhancePrompt?: boolean;
	klingNegativePrompt?: string;
	// Kling v2.6 Pro options
	kling26Duration?: 5 | 10;
	kling26AspectRatio?: "16:9" | "9:16" | "1:1";
	kling26CfgScale?: number;
	kling26GenerateAudio?: boolean;
	kling26NegativePrompt?: string;
	// WAN 2.5 Preview I2V options
	wan25Duration?: 5 | 10;
	wan25Resolution?: "480p" | "720p" | "1080p";
	wan25AudioUrl?: string;
	wan25AudioFile?: File | null;
	wan25NegativePrompt?: string;
	wan25EnablePromptExpansion?: boolean;

	// WAN v2.6 T2V options
	wan26T2VDuration?: 5 | 10 | 15;
	wan26T2VResolution?: "720p" | "1080p";
	wan26T2VAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	wan26T2VNegativePrompt?: string;
	wan26T2VEnablePromptExpansion?: boolean;
	wan26T2VMultiShots?: boolean;
	// WAN v2.6 I2V options
	wan26Duration?: 5 | 10 | 15;
	wan26Resolution?: "720p" | "1080p";
	wan26AspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	wan26AudioUrl?: string;
	wan26AudioFile?: File | null;
	wan26NegativePrompt?: string;
	wan26EnablePromptExpansion?: boolean;

	// WAN v2.6 Reference-to-Video options (Avatar tab)
	/** Reference video file for WAN v2.6 Ref2Video */
	wan26RefVideo?: File | null;
	/** Duration for WAN v2.6 Ref2Video */
	wan26RefDuration?: 5 | 10 | 15;
	/** Resolution for WAN v2.6 Ref2Video */
	wan26RefResolution?: "720p" | "1080p";
	/** Aspect ratio for WAN v2.6 Ref2Video */
	wan26RefAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	/** Audio URL for WAN v2.6 Ref2Video */
	wan26RefAudioUrl?: string;
	/** Audio file for WAN v2.6 Ref2Video */
	wan26RefAudioFile?: File | null;
	/** Negative prompt for WAN v2.6 Ref2Video */
	wan26RefNegativePrompt?: string;
	/** Enable prompt expansion for WAN v2.6 Ref2Video */
	wan26RefEnablePromptExpansion?: boolean;
	/** Random seed for reproducibility */
	wan26RefSeed?: number;
	/** Enable safety content filtering */
	wan26RefEnableSafetyChecker?: boolean;

	// Kling Avatar v2 options
	/** Optional prompt for animation guidance (Kling Avatar v2) */
	klingAvatarV2Prompt?: string;
	/** Audio duration in seconds for cost calculation */
	audioDuration?: number | null;

	// Sync Lipsync React-1 options
	/** Emotion for Sync Lipsync React-1 */
	syncLipsyncEmotion?: SyncLipsyncEmotion;
	/** Model mode: lips, face, or head */
	syncLipsyncModelMode?: SyncLipsyncModelMode;
	/** Sync mode: cut_off, loop, bounce, silence, remap */
	syncLipsyncSyncMode?: SyncLipsyncSyncMode;
	/** Temperature 0-1 for expressiveness */
	syncLipsyncTemperature?: number;
	/** Video duration for validation */
	videoDuration?: number | null;

	// Veo 3.1 Extend-Video options
	/** Aspect ratio for extend-video: auto, 16:9, or 9:16 */
	extendVideoAspectRatio?: "auto" | "16:9" | "9:16";
	/** Whether to generate audio for extended video */
	extendVideoGenerateAudio?: boolean;

	// Video upscaling options
	// ByteDance Upscaler options
	bytedanceTargetResolution?: "1080p" | "2k" | "4k";
	bytedanceTargetFPS?: "30fps" | "60fps";
	// FlashVSR Upscaler options
	flashvsrUpscaleFactor?: number; // 1.0 to 4.0
	flashvsrAcceleration?: "regular" | "high" | "full";
	flashvsrQuality?: number; // 0 to 100
	flashvsrColorFix?: boolean;
	flashvsrPreserveAudio?: boolean;
	flashvsrOutputFormat?: "X264" | "VP9" | "PRORES4444" | "GIF";
	flashvsrOutputQuality?: "low" | "medium" | "high" | "maximum";
	flashvsrOutputWriteMode?: "fast" | "balanced" | "small";
	flashvsrSeed?: number;
	// Topaz Upscaler options
	topazUpscaleFactor?: number; // 2.0 to 8.0
	topazTargetFPS?: "original" | "interpolated";
	topazH264Output?: boolean;
	// Shared video upscaling inputs
	sourceVideoFile?: File | null;
	sourceVideoUrl?: string;

	// First + Last Frame support for Frame-to-Video models (Veo 3.1)
	/** First frame image file for F2V models. Required when F2V model selected. */
	firstFrame?: File | null;
	/** Last frame image file for F2V models. Optional - enables frame-to-frame animation. */
	lastFrame?: File | null;
	/** Callback when first frame changes. */
	onFirstFrameChange?: (file: File | null, preview?: string | null) => void;
	/** Callback when last frame changes. */
	onLastFrameChange?: (file: File | null, preview?: string | null) => void;

	// Seeddream 4.5 options (text-to-image and image edit)
	/** Image size for Seeddream 4.5 models */
	seeddream45ImageSize?: Seeddream45ImageSize;
	/** Number of images to generate (1-6) */
	seeddream45NumImages?: number;
	/** Seed for reproducible results */
	seeddream45Seed?: number;
	/** Enable safety checker */
	seeddream45SafetyChecker?: boolean;
	/** Images selected for Seeddream 4.5 edit (up to 10) */
	seeddream45EditImages?: (File | null)[];
}

// ⚠️ ENHANCED: Complete generation state interface
export interface AIGenerationState {
	// Core generation state
	isGenerating: boolean;
	generationProgress: number;
	statusMessage: string;
	elapsedTime: number;
	estimatedTime?: number;
	currentModelIndex: number;
	progressLogs: string[];
	generationStartTime: number | null;

	// ⚠️ CRITICAL ADDITIONS: Missing state variables from validation
	jobId: string | null;
	generatedVideo: GeneratedVideo | null;
	generatedVideos: GeneratedVideoResult[];

	// ⚠️ CRITICAL: Polling state management
	pollingInterval: ReturnType<typeof setInterval> | null;
}

export type UseAIHistoryProps = Record<string, never>;

export interface AIHistoryState {
	generationHistory: GeneratedVideo[];
	isHistoryPanelOpen: boolean;
}

// UI State Types
export type AIActiveTab = "text" | "image" | "avatar" | "upscale" | "angles";

// Avatar-specific types
export interface AvatarUploadState {
	characterImage: File | null;
	characterImagePreview: string | null;
	audioFile: File | null;
	audioPreview: string | null;
	sourceVideo: File | null;
	sourceVideoPreview: string | null;
}

// Image handling types
export interface ImageUploadState {
	selectedImage: File | null;
	imagePreview: string | null;
	isValidImage: boolean;
	uploadError?: string;
}
