import type { AudioSettings } from "./ffmpeg/audio-settings.js";

export const QCUT_AUDIO_RUNTIME_VERSION = 1;
export const QCUT_AUDIO_RUNTIME_ID = "qcut-ffmpeg-audio-v1";

export const QCUT_AUDIO_RUNTIME_STATUS_CHANNEL = "qcut-audio-runtime:status";
export const QCUT_AUDIO_RUNTIME_PROCESS_CHANNEL = "qcut-audio-runtime:process";
export const QCUT_AUDIO_RUNTIME_CACHE_STATS_CHANNEL =
	"qcut-audio-runtime:cache-stats";
export const QCUT_AUDIO_RUNTIME_CLEAR_CACHE_CHANNEL =
	"qcut-audio-runtime:clear-cache";
export const QCUT_AUDIO_RUNTIME_CANCEL_CHANNEL = "qcut-audio-runtime:cancel";

export type QcutAudioRuntimeFeatureId =
	| "basic-processing"
	| "loudness-normalization"
	| "spectral-denoise"
	| "voice-enhancement"
	| "pitch"
	| "stereo-balance"
	| "channel-mapping"
	| "neural-denoise"
	| "stem-separation"
	| "voice-conversion"
	| "audio-translation";

export interface QcutAudioRuntimeFeature {
	id: QcutAudioRuntimeFeatureId;
	status: "ready" | "model-required";
	engine?: string;
	modelCacheKey?: string;
	reason?: string;
}

export interface QcutAudioRuntimeStatus {
	runtimeId: typeof QCUT_AUDIO_RUNTIME_ID;
	version: typeof QCUT_AUDIO_RUNTIME_VERSION;
	provider: "qcut";
	independentFromJianying: true;
	cacheDirectory: string;
	modelCacheDirectory: string;
	features: QcutAudioRuntimeFeature[];
}

export interface QcutAudioProcessRequest {
	requestId: string;
	sourcePath: string;
	audio: AudioSettings;
}

export interface QcutAudioProcessResult {
	requestId: string;
	outputPath: string;
	manifestPath: string;
	cacheKey: string;
	cacheHit: boolean;
	fileSize: number;
	sha256: string;
	provider: "qcut";
	engine: typeof QCUT_AUDIO_RUNTIME_ID;
}

export interface QcutAudioCacheStats {
	cacheDirectory: string;
	entryCount: number;
	totalBytes: number;
	maxBytes: number;
	maxEntries: number;
}

export interface QcutAudioCacheClearResult extends QcutAudioCacheStats {
	removedEntries: number;
	removedBytes: number;
}

export interface QcutAudioArtifactManifest {
	schemaVersion: 1;
	cacheKey: string;
	createdAt: string;
	provider: "qcut";
	engine: typeof QCUT_AUDIO_RUNTIME_ID;
	sourceSha256: string;
	settingsSha256: string;
	outputSha256: string;
	fileSize: number;
	format: "flac";
	sampleRate: 48_000;
	channels: 2;
}
