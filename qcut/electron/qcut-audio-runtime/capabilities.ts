import type {
	QcutAudioRuntimeFeature,
	QcutAudioRuntimeStatus,
} from "../qcut-audio-runtime-contract.js";
import {
	QCUT_AUDIO_RUNTIME_ID,
	QCUT_AUDIO_RUNTIME_VERSION,
} from "../qcut-audio-runtime-contract.js";
import {
	getQcutAudioCacheDirectory,
	getQcutAudioModelCacheDirectory,
} from "./cache.js";

const LOCAL_FFMPEG_FEATURES = [
	"basic-processing",
	"loudness-normalization",
	"spectral-denoise",
	"voice-enhancement",
	"pitch",
	"stereo-balance",
	"channel-mapping",
] as const;

const MODEL_FEATURES = [
	[
		"neural-denoise",
		"deep-filter",
		"QCut neural denoise model is not installed",
	],
	["stem-separation", "demucs", "QCut stem separation model is not installed"],
	[
		"voice-conversion",
		"voice-conversion",
		"QCut voice conversion model is not installed",
	],
	[
		"audio-translation",
		"audio-translation",
		"QCut speech translation models are not installed",
	],
] as const;

function runtimeFeatures(): QcutAudioRuntimeFeature[] {
	return [
		...LOCAL_FFMPEG_FEATURES.map((id) => ({
			id,
			status: "ready" as const,
			engine: QCUT_AUDIO_RUNTIME_ID,
		})),
		...MODEL_FEATURES.map(([id, modelCacheKey, reason]) => ({
			id,
			status: "model-required" as const,
			modelCacheKey,
			reason,
		})),
	];
}

export function inspectQcutAudioRuntime({
	cacheDirectory = getQcutAudioCacheDirectory(),
	modelCacheDirectory = getQcutAudioModelCacheDirectory(),
}: {
	cacheDirectory?: string;
	modelCacheDirectory?: string;
} = {}): QcutAudioRuntimeStatus {
	return {
		runtimeId: QCUT_AUDIO_RUNTIME_ID,
		version: QCUT_AUDIO_RUNTIME_VERSION,
		provider: "qcut",
		independentFromJianying: true,
		cacheDirectory,
		modelCacheDirectory,
		features: runtimeFeatures(),
	};
}
