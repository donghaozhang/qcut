/**
 * Shared model handler types
 */

import type { ProgressCallback } from "@/lib/ai-clients/ai-video-client";
import type {
	SyncLipsyncEmotion,
	SyncLipsyncModelMode,
	SyncLipsyncSyncMode,
} from "../../types/ai-types";

/**
 * Common context passed to all model handlers
 */
export interface ModelHandlerContext {
	prompt: string;
	modelId: string;
	modelName: string;
	progressCallback: ProgressCallback;
}

/**
 * Text-to-Video specific settings
 */
export interface TextToVideoSettings {
	veo31Settings: {
		aspectRatio: "9:16" | "16:9" | "1:1" | "auto";
		duration: "4s" | "6s" | "8s";
		resolution: "720p" | "1080p";
		generateAudio: boolean;
		enhancePrompt: boolean;
		autoFix: boolean;
	};
	hailuoT2VDuration: number;
	ltxv2Duration: number;
	ltxv2Resolution: string;
	ltxv2FPS: number;
	ltxv2GenerateAudio: boolean;
	ltxv2FastDuration: number;
	ltxv2FastResolution: string;
	ltxv2FastFPS: number;
	ltxv2FastGenerateAudio: boolean;
	ltx23Duration: number;
	ltx23Resolution: string;
	ltx23FPS: number;
	ltx23GenerateAudio: boolean;
	ltx23AspectRatio: string;
	unifiedParams: Record<string, unknown>;
	duration?: number;
	aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
	resolution?: "720p" | "1080p" | "auto";
	wan26T2VDuration: number;
	wan26T2VResolution: string;
	wan26T2VAspectRatio: string;
	wan26T2VNegativePrompt: string;
	wan26T2VEnablePromptExpansion: boolean;
	wan26T2VMultiShots: boolean;
}

/**
 * Image-to-Video specific settings
 */
export interface ImageToVideoSettings {
	selectedImage: File | null;
	firstFrame: File | null;
	lastFrame: File | null;
	veo31Settings: {
		aspectRatio: "9:16" | "16:9" | "1:1" | "auto";
		duration: "4s" | "6s" | "8s";
		resolution: "720p" | "1080p";
		generateAudio: boolean;
		enhancePrompt: boolean;
		autoFix: boolean;
	};
	viduQ2Duration: number;
	viduQ2Resolution: string;
	viduQ2MovementAmplitude: number | string;
	viduQ2EnableBGM: boolean;
	ltxv2I2VDuration: number;
	ltxv2I2VResolution: string;
	ltxv2I2VFPS: number;
	ltxv2I2VGenerateAudio: boolean;
	ltxv2ImageDuration: number;
	ltxv2ImageResolution: string;
	ltxv2ImageFPS: number;
	ltxv2ImageGenerateAudio: boolean;
	ltx23I2VDuration: number;
	ltx23I2VResolution: string;
	ltx23I2VFPS: number;
	ltx23I2VGenerateAudio: boolean;
	ltx23I2VAspectRatio: string;
	ltx23I2VEndImageUrl: string | null;
	ltx23I2VEndImageFile: File | null;
	seedanceDuration: number;
	seedanceResolution: string;
	seedanceAspectRatio: string;
	seedanceCameraFixed: boolean;
	seedanceEndFrameUrl: string | null;
	seedanceEndFrameFile: File | null;
	klingDuration: number;
	klingCfgScale: number;
	klingAspectRatio: string;
	klingEnhancePrompt: boolean;
	klingNegativePrompt: string;
	kling26Duration: number;
	kling26GenerateAudio: boolean;
	kling26NegativePrompt: string;
	wan25Duration: number;
	wan25Resolution: string;
	wan25AudioUrl: string | null;
	wan25AudioFile: File | null;
	wan25NegativePrompt: string;
	wan25EnablePromptExpansion: boolean;
	wan26Duration: number;
	wan26Resolution: string;
	wan26AspectRatio: string;
	wan26AudioUrl: string | null;
	wan26AudioFile: File | null;
	wan26NegativePrompt: string;
	wan26EnablePromptExpansion: boolean;
	imageSeed: number | null;
	duration?: number;
	aspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9";
	resolution?: "720p" | "1080p" | "auto";
	uploadImageToFal: (file: File) => Promise<string>;
	uploadAudioToFal: (file: File) => Promise<string>;
}

/**
 * Avatar generation specific settings
 */
export interface AvatarSettings {
	avatarImage: File | null;
	audioFile: File | null;
	sourceVideo: File | null;
	referenceImages: (File | null)[];
	klingAvatarV2Prompt: string;
	audioDuration: number | null;
	uploadImageToFal: (file: File) => Promise<string>;
	uploadAudioToFal: (file: File) => Promise<string>;
	syncLipsyncEmotion?: SyncLipsyncEmotion;
	syncLipsyncModelMode?: SyncLipsyncModelMode;
	syncLipsyncLipsyncMode?: SyncLipsyncSyncMode;
	syncLipsyncTemperature?: number;
	videoDuration?: number | null;
	extendVideoAspectRatio?: "auto" | "16:9" | "9:16";
	extendVideoGenerateAudio?: boolean;
	wan26RefDuration?: 5 | 10 | 15;
	wan26RefResolution?: "720p" | "1080p";
	wan26RefAspectRatio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
	wan26RefNegativePrompt?: string;
	wan26RefEnablePromptExpansion?: boolean;
	wan26RefSeed?: number;
	wan26RefEnableSafetyChecker?: boolean;
}

/**
 * Upscale specific settings
 */
export interface UpscaleSettings {
	sourceVideoFile: File | null;
	sourceVideoUrl: string | null;
	bytedanceTargetResolution: string;
	bytedanceTargetFPS: number | string;
	flashvsrUpscaleFactor: number | null;
	flashvsrAcceleration: string;
	flashvsrQuality: number;
	flashvsrColorFix: boolean;
	flashvsrPreserveAudio: boolean;
	flashvsrOutputFormat: string;
	flashvsrOutputQuality: string;
	flashvsrOutputWriteMode: string;
	flashvsrSeed: number | null;
}

interface VideoResponse {
	video_url?: string;
	job_id?: string;
	status?: string;
	video_data?: unknown;
}

/**
 * Handler result type
 */
export interface ModelHandlerResult {
	response: VideoResponse | undefined;
	shouldSkip?: boolean;
	skipReason?: string;
}
