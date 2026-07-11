import type { MediaAudioSettings } from "@/types/timeline";
import { generateUUID } from "@/types/timeline";
import {
	createDefaultMediaAudioSettings,
	normalizeMediaAudioSettings,
} from "./audio-properties";

export const AUDIO_PRESET_STORAGE_KEY = "qcut-audio-presets-v1";

export type AudioPresetCategory = "voice" | "music" | "effect" | "custom";

export interface AudioPreset {
	id: string;
	name: string;
	category: AudioPresetCategory;
	builtIn: boolean;
	createdAt?: string;
	audio: MediaAudioSettings;
}

interface AudioPresetOverrides {
	loudness?: Partial<MediaAudioSettings["loudness"]>;
	denoise?: Partial<MediaAudioSettings["denoise"]>;
	voiceEnhance?: Partial<MediaAudioSettings["voiceEnhance"]>;
	pitch?: Partial<MediaAudioSettings["pitch"]>;
	equalizer?: Partial<MediaAudioSettings["equalizer"]>;
	compressor?: Partial<MediaAudioSettings["compressor"]>;
	limiter?: Partial<MediaAudioSettings["limiter"]>;
	reverb?: Partial<MediaAudioSettings["reverb"]>;
	echo?: Partial<MediaAudioSettings["echo"]>;
	telephone?: Partial<MediaAudioSettings["telephone"]>;
}

function buildPresetSettings({
	overrides,
}: {
	overrides: AudioPresetOverrides;
}): MediaAudioSettings {
	const base = createDefaultMediaAudioSettings();
	return {
		...base,
		loudness: { ...base.loudness, ...overrides.loudness },
		denoise: { ...base.denoise, ...overrides.denoise },
		voiceEnhance: { ...base.voiceEnhance, ...overrides.voiceEnhance },
		pitch: { ...base.pitch, ...overrides.pitch },
		equalizer: { ...base.equalizer, ...overrides.equalizer },
		compressor: { ...base.compressor, ...overrides.compressor },
		limiter: { ...base.limiter, ...overrides.limiter },
		reverb: { ...base.reverb, ...overrides.reverb },
		echo: { ...base.echo, ...overrides.echo },
		telephone: { ...base.telephone, ...overrides.telephone },
	};
}

function builtInPreset({
	id,
	name,
	category,
	overrides,
}: {
	id: string;
	name: string;
	category: Exclude<AudioPresetCategory, "custom">;
	overrides: AudioPresetOverrides;
}): AudioPreset {
	return {
		id: `audio-preset-${id}`,
		name,
		category,
		builtIn: true,
		audio: buildPresetSettings({ overrides }),
	};
}

export const BUILT_IN_AUDIO_PRESETS: AudioPreset[] = [
	builtInPreset({
		id: "clean-voice",
		name: "Clean Voice",
		category: "voice",
		overrides: {
			denoise: { enabled: true, amount: 18, noiseFloorDb: -48 },
			voiceEnhance: {
				enabled: true,
				clarity: 25,
				warmth: 8,
				presence: 18,
			},
			equalizer: {
				enabled: true,
				lowGainDb: -2,
				midGainDb: 2,
				highGainDb: 1,
			},
			compressor: { enabled: true, thresholdDb: -20, ratio: 3 },
			limiter: { enabled: true, ceilingDb: -1 },
		},
	}),
	builtInPreset({
		id: "podcast",
		name: "Podcast",
		category: "voice",
		overrides: {
			loudness: { enabled: true, targetLufs: -16, truePeakDb: -1.5 },
			voiceEnhance: {
				enabled: true,
				clarity: 18,
				warmth: 14,
				presence: 12,
			},
			equalizer: {
				enabled: true,
				lowGainDb: -1,
				midGainDb: 2.5,
				highGainDb: 1.5,
			},
			compressor: {
				enabled: true,
				thresholdDb: -21,
				ratio: 3.5,
				attackMs: 8,
				releaseMs: 140,
				makeupGainDb: 2,
			},
			limiter: { enabled: true, ceilingDb: -1 },
		},
	}),
	builtInPreset({
		id: "warm-narration",
		name: "Warm Narration",
		category: "voice",
		overrides: {
			voiceEnhance: {
				enabled: true,
				clarity: 10,
				warmth: 35,
				presence: 8,
			},
			equalizer: {
				enabled: true,
				lowGainDb: 2,
				midGainDb: 1,
				highGainDb: -1,
			},
			compressor: { enabled: true, thresholdDb: -18, ratio: 2.5 },
		},
	}),
	builtInPreset({
		id: "music-polish",
		name: "Music Polish",
		category: "music",
		overrides: {
			equalizer: {
				enabled: true,
				lowGainDb: 1.5,
				midGainDb: -1,
				highGainDb: 2,
			},
			compressor: {
				enabled: true,
				thresholdDb: -14,
				ratio: 2,
				attackMs: 25,
				releaseMs: 180,
				makeupGainDb: 1,
			},
			limiter: { enabled: true, ceilingDb: -0.8 },
		},
	}),
	builtInPreset({
		id: "telephone",
		name: "Telephone",
		category: "effect",
		overrides: {
			telephone: { enabled: true, mix: 100 },
			compressor: { enabled: true, thresholdDb: -16, ratio: 4 },
		},
	}),
	builtInPreset({
		id: "large-room",
		name: "Large Room",
		category: "effect",
		overrides: {
			reverb: { enabled: true, mix: 28, roomSize: 78, damping: 42 },
			echo: { enabled: true, mix: 8, delayMs: 180, feedback: 16 },
		},
	}),
];

function presetSnapshot({
	settings,
}: {
	settings: MediaAudioSettings;
}): MediaAudioSettings {
	return {
		...structuredClone(settings),
		loudness: {
			enabled: settings.loudness.enabled,
			targetLufs: settings.loudness.targetLufs,
			truePeakDb: settings.loudness.truePeakDb,
			loudnessRange: settings.loudness.loudnessRange,
			analysisStatus: "idle",
		},
		denoise: {
			enabled: settings.denoise.enabled,
			amount: settings.denoise.amount,
			noiseFloorDb: settings.denoise.noiseFloorDb,
			mode: settings.denoise.mode,
			status: "idle",
		},
		separation: { enabled: false, status: "idle" },
		voiceConversion: { enabled: false, status: "idle" },
		lyrics: { status: "idle", text: "", words: [] },
		keyframes: {},
	};
}

export function createAudioPreset({
	settings,
	name,
}: {
	settings: MediaAudioSettings;
	name?: string;
}): AudioPreset {
	const createdAt = new Date().toISOString();
	return {
		id: `audio-preset-custom-${generateUUID()}`,
		name:
			name?.trim() || `Audio preset ${new Date(createdAt).toLocaleString()}`,
		category: "custom",
		builtIn: false,
		createdAt,
		audio: presetSnapshot({ settings }),
	};
}

export function applyAudioPreset({
	settings,
	preset,
}: {
	settings: MediaAudioSettings;
	preset: AudioPreset;
}): MediaAudioSettings {
	const presetSettings = normalizeMediaAudioSettings({
		element: {
			audio: preset.audio,
			volume: 1,
			audioFadeIn: 0,
			audioFadeOut: 0,
			audioNormalize: false,
			audioDenoise: 0,
			audioPan: 0,
		},
	});
	const hasDenoiseResult = Boolean(settings.denoise.processedMediaId);
	return {
		...presetSettings,
		volumeDb: settings.volumeDb,
		fadeIn: settings.fadeIn,
		fadeOut: settings.fadeOut,
		panEnabled: settings.panEnabled,
		pan: settings.pan,
		loudness: {
			...presetSettings.loudness,
			measuredLufs: settings.loudness.measuredLufs,
			measuredTruePeakDb: settings.loudness.measuredTruePeakDb,
			analysisStatus: settings.loudness.measuredLufs ? "ready" : "idle",
		},
		denoise: {
			...presetSettings.denoise,
			processedMediaId: settings.denoise.processedMediaId,
			status: hasDenoiseResult ? "ready" : "idle",
		},
		separation: structuredClone(settings.separation),
		voiceConversion: structuredClone(settings.voiceConversion),
		lyrics: {
			...settings.lyrics,
			words: settings.lyrics.words.map((word) => ({ ...word })),
		},
		keyframes: structuredClone(settings.keyframes ?? {}),
	};
}

export function loadCustomAudioPresets(): AudioPreset[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(AUDIO_PRESET_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored.filter(
			(candidate): candidate is AudioPreset =>
				typeof candidate === "object" &&
				candidate !== null &&
				typeof (candidate as Partial<AudioPreset>).id === "string" &&
				typeof (candidate as Partial<AudioPreset>).name === "string" &&
				(candidate as Partial<AudioPreset>).builtIn === false &&
				typeof (candidate as Partial<AudioPreset>).audio === "object"
		);
	} catch {
		return [];
	}
}

export function persistCustomAudioPresets({
	presets,
}: {
	presets: AudioPreset[];
}) {
	localStorage.setItem(AUDIO_PRESET_STORAGE_KEY, JSON.stringify(presets));
}
