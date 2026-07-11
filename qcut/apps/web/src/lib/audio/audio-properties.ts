import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
	MediaElement,
} from "@/types/timeline";

export const MIN_AUDIO_VOLUME_DB = -60;
export const MAX_AUDIO_VOLUME_DB = 12;

export const DEFAULT_MEDIA_AUDIO_SETTINGS: MediaAudioSettings = {
	enabled: true,
	volumeDb: 0,
	fadeIn: 0,
	fadeOut: 0,
	panEnabled: false,
	pan: 0,
	loudness: {
		enabled: false,
		targetLufs: -16,
		truePeakDb: -1.5,
		loudnessRange: 11,
		analysisStatus: "idle",
	},
	denoise: {
		enabled: false,
		amount: 0,
		noiseFloorDb: -50,
		mode: "realtime",
		status: "idle",
	},
	voiceEnhance: {
		enabled: false,
		clarity: 0,
		warmth: 0,
		presence: 0,
	},
	pitch: {
		enabled: false,
		semitones: 0,
		preserveFormants: true,
	},
	equalizer: {
		enabled: false,
		lowGainDb: 0,
		midGainDb: 0,
		highGainDb: 0,
	},
	compressor: {
		enabled: false,
		thresholdDb: -18,
		ratio: 3,
		attackMs: 10,
		releaseMs: 120,
		makeupGainDb: 0,
	},
	limiter: {
		enabled: false,
		ceilingDb: -1,
		releaseMs: 50,
	},
	reverb: {
		enabled: false,
		mix: 20,
		roomSize: 40,
		damping: 50,
	},
	echo: {
		enabled: false,
		mix: 15,
		delayMs: 220,
		feedback: 25,
	},
	telephone: {
		enabled: false,
		mix: 100,
	},
	separation: {
		enabled: false,
		status: "idle",
	},
	voiceConversion: {
		enabled: false,
		status: "idle",
	},
	lyrics: {
		status: "idle",
		text: "",
		words: [],
	},
	keyframes: {},
};

export function createDefaultMediaAudioSettings(): MediaAudioSettings {
	return {
		...DEFAULT_MEDIA_AUDIO_SETTINGS,
		loudness: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness },
		denoise: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise },
		voiceEnhance: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceEnhance },
		pitch: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.pitch },
		equalizer: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer },
		compressor: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.compressor },
		limiter: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.limiter },
		reverb: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.reverb },
		echo: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.echo },
		telephone: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.telephone },
		separation: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.separation },
		voiceConversion: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceConversion },
		lyrics: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.lyrics,
			words: [],
		},
		keyframes: {},
	};
}

export function resetMediaAudioProcessing({
	settings,
}: {
	settings: MediaAudioSettings;
}): MediaAudioSettings {
	const next = createDefaultMediaAudioSettings();
	const hasDenoiseResult = Boolean(settings.denoise.processedMediaId);
	const hasSeparatedStems = Boolean(
		Object.keys(settings.separation.stemMediaIds ?? {}).length
	);
	const hasVoiceConversionResult = Boolean(
		settings.voiceConversion.sourceMediaId
	);
	return {
		...next,
		loudness: {
			...next.loudness,
			measuredLufs: settings.loudness.measuredLufs,
			measuredTruePeakDb: settings.loudness.measuredTruePeakDb,
			analysisStatus: settings.loudness.measuredLufs ? "ready" : "idle",
		},
		denoise: {
			...next.denoise,
			processedMediaId: settings.denoise.processedMediaId,
			status: hasDenoiseResult ? "ready" : "idle",
		},
		separation: {
			...next.separation,
			stemMediaIds: settings.separation.stemMediaIds,
			stemGains: settings.separation.stemGains,
			status: hasSeparatedStems ? "ready" : "idle",
		},
		voiceConversion: {
			...next.voiceConversion,
			sourceMediaId: settings.voiceConversion.sourceMediaId,
			provider: settings.voiceConversion.provider,
			model: settings.voiceConversion.model,
			status: hasVoiceConversionResult ? "ready" : "idle",
		},
		lyrics: {
			...settings.lyrics,
			words: settings.lyrics.words.map((word) => ({ ...word })),
		},
	};
}

export const AUDIO_KEYFRAME_DEFINITIONS: Record<
	AudioKeyframeProperty,
	{
		label: string;
		min: number;
		max: number;
		step: number;
		suffix: string;
	}
> = {
	volumeDb: { label: "Volume", min: -60, max: 12, step: 0.1, suffix: "dB" },
	fadeIn: { label: "Fade in", min: 0, max: 30, step: 0.1, suffix: "s" },
	fadeOut: { label: "Fade out", min: 0, max: 30, step: 0.1, suffix: "s" },
	pan: { label: "Stereo balance", min: -100, max: 100, step: 1, suffix: "%" },
	denoiseAmount: {
		label: "Noise reduction",
		min: 0,
		max: 100,
		step: 1,
		suffix: "%",
	},
	voiceClarity: { label: "Clarity", min: -100, max: 100, step: 1, suffix: "%" },
	voiceWarmth: { label: "Warmth", min: -100, max: 100, step: 1, suffix: "%" },
	voicePresence: {
		label: "Presence",
		min: -100,
		max: 100,
		step: 1,
		suffix: "%",
	},
	pitchSemitones: { label: "Pitch", min: -12, max: 12, step: 1, suffix: "st" },
	eqLowGainDb: { label: "Low EQ", min: -18, max: 18, step: 0.5, suffix: "dB" },
	eqMidGainDb: { label: "Mid EQ", min: -18, max: 18, step: 0.5, suffix: "dB" },
	eqHighGainDb: {
		label: "High EQ",
		min: -18,
		max: 18,
		step: 0.5,
		suffix: "dB",
	},
	compressorThresholdDb: {
		label: "Compressor threshold",
		min: -60,
		max: 0,
		step: 1,
		suffix: "dB",
	},
	compressorRatio: {
		label: "Compressor ratio",
		min: 1,
		max: 20,
		step: 0.5,
		suffix: ":1",
	},
	reverbMix: { label: "Reverb mix", min: 0, max: 100, step: 1, suffix: "%" },
	echoMix: { label: "Echo mix", min: 0, max: 100, step: 1, suffix: "%" },
};

function finiteOr({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}) {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

export function gainToDb({ gain }: { gain: number }): number {
	if (!Number.isFinite(gain) || gain <= 0) return MIN_AUDIO_VOLUME_DB;
	return clamp({
		value: 20 * Math.log10(gain),
		min: MIN_AUDIO_VOLUME_DB,
		max: MAX_AUDIO_VOLUME_DB,
	});
}

export function dbToGain({ db }: { db: number }): number {
	if (!Number.isFinite(db) || db <= MIN_AUDIO_VOLUME_DB) return 0;
	return (
		10 **
		(clamp({ value: db, min: MIN_AUDIO_VOLUME_DB, max: MAX_AUDIO_VOLUME_DB }) /
			20)
	);
}

export function normalizeMediaAudioSettings({
	element,
}: {
	element: Pick<
		MediaElement,
		| "audio"
		| "volume"
		| "audioFadeIn"
		| "audioFadeOut"
		| "audioNormalize"
		| "audioDenoise"
		| "audioPan"
	>;
}): MediaAudioSettings {
	const audio = element.audio;
	const legacyDenoise = clamp({
		value: finiteOr({ value: element.audioDenoise, fallback: 0 }),
		min: 0,
		max: 100,
	});
	return {
		...DEFAULT_MEDIA_AUDIO_SETTINGS,
		...audio,
		enabled: audio?.enabled ?? true,
		volumeDb: clamp({
			value: finiteOr({
				value: audio?.volumeDb,
				fallback: gainToDb({ gain: element.volume ?? 1 }),
			}),
			min: MIN_AUDIO_VOLUME_DB,
			max: MAX_AUDIO_VOLUME_DB,
		}),
		fadeIn: Math.max(
			0,
			finiteOr({ value: audio?.fadeIn, fallback: element.audioFadeIn ?? 0 })
		),
		fadeOut: Math.max(
			0,
			finiteOr({ value: audio?.fadeOut, fallback: element.audioFadeOut ?? 0 })
		),
		panEnabled:
			audio?.panEnabled ?? Math.abs(element.audioPan ?? 0) > Number.EPSILON,
		pan: clamp({
			value: finiteOr({ value: audio?.pan, fallback: element.audioPan ?? 0 }),
			min: -1,
			max: 1,
		}),
		loudness: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness,
			...audio?.loudness,
			enabled: audio?.loudness?.enabled ?? element.audioNormalize ?? false,
		},
		denoise: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise,
			...audio?.denoise,
			enabled: audio?.denoise?.enabled ?? legacyDenoise > 0,
			amount: clamp({
				value: finiteOr({
					value: audio?.denoise?.amount,
					fallback: legacyDenoise,
				}),
				min: 0,
				max: 100,
			}),
		},
		voiceEnhance: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceEnhance,
			...audio?.voiceEnhance,
		},
		pitch: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.pitch, ...audio?.pitch },
		equalizer: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer,
			...audio?.equalizer,
		},
		compressor: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.compressor,
			...audio?.compressor,
		},
		limiter: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.limiter, ...audio?.limiter },
		reverb: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.reverb, ...audio?.reverb },
		echo: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.echo, ...audio?.echo },
		telephone: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.telephone,
			...audio?.telephone,
		},
		separation: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.separation,
			...audio?.separation,
		},
		voiceConversion: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceConversion,
			...audio?.voiceConversion,
		},
		lyrics: {
			...DEFAULT_MEDIA_AUDIO_SETTINGS.lyrics,
			...audio?.lyrics,
			words: (audio?.lyrics?.words ?? []).map((word) => ({ ...word })),
		},
		keyframes: { ...audio?.keyframes },
	};
}

function hasKeyframes({
	settings,
	properties,
}: {
	settings: MediaAudioSettings;
	properties: AudioKeyframeProperty[];
}): boolean {
	return properties.some(
		(property) => (settings.keyframes?.[property]?.length ?? 0) > 0
	);
}

/** True when exporting the original audio stream unchanged would lose an edit. */
export function hasMediaAudioEdits({
	element,
}: {
	element: Pick<
		MediaElement,
		| "audio"
		| "volume"
		| "audioFadeIn"
		| "audioFadeOut"
		| "audioNormalize"
		| "audioDenoise"
		| "audioPan"
	>;
}): boolean {
	const settings = normalizeMediaAudioSettings({ element });
	if (!settings.enabled) return true;
	if (
		settings.volumeDb !== 0 ||
		settings.fadeIn > 0 ||
		settings.fadeOut > 0 ||
		hasKeyframes({
			settings,
			properties: ["volumeDb", "fadeIn", "fadeOut"],
		})
	) {
		return true;
	}
	if (
		settings.panEnabled &&
		(settings.pan !== 0 || hasKeyframes({ settings, properties: ["pan"] }))
	) {
		return true;
	}
	if (settings.loudness.enabled) return true;
	if (
		settings.denoise.enabled &&
		settings.denoise.mode === "ai" &&
		settings.denoise.status === "ready" &&
		settings.denoise.processedMediaId
	) {
		return true;
	}
	if (
		settings.denoise.enabled &&
		(settings.denoise.amount > 0 ||
			hasKeyframes({ settings, properties: ["denoiseAmount"] }))
	) {
		return true;
	}
	if (
		settings.voiceEnhance.enabled &&
		(settings.voiceEnhance.clarity !== 0 ||
			settings.voiceEnhance.warmth !== 0 ||
			settings.voiceEnhance.presence !== 0 ||
			hasKeyframes({
				settings,
				properties: ["voiceClarity", "voiceWarmth", "voicePresence"],
			}))
	) {
		return true;
	}
	if (
		settings.pitch.enabled &&
		(settings.pitch.semitones !== 0 ||
			hasKeyframes({ settings, properties: ["pitchSemitones"] }))
	) {
		return true;
	}
	if (
		settings.equalizer.enabled &&
		(settings.equalizer.lowGainDb !== 0 ||
			settings.equalizer.midGainDb !== 0 ||
			settings.equalizer.highGainDb !== 0 ||
			hasKeyframes({
				settings,
				properties: ["eqLowGainDb", "eqMidGainDb", "eqHighGainDb"],
			}))
	) {
		return true;
	}
	if (settings.compressor.enabled || settings.limiter.enabled) return true;
	if (
		settings.reverb.enabled &&
		(settings.reverb.mix > 0 ||
			hasKeyframes({ settings, properties: ["reverbMix"] }))
	) {
		return true;
	}
	if (
		settings.echo.enabled &&
		(settings.echo.mix > 0 ||
			hasKeyframes({ settings, properties: ["echoMix"] }))
	) {
		return true;
	}
	if (
		settings.separation.enabled &&
		settings.separation.status === "ready" &&
		Object.keys(settings.separation.stemMediaIds ?? {}).length > 0
	) {
		return true;
	}
	if (
		settings.voiceConversion.enabled &&
		settings.voiceConversion.status === "ready" &&
		settings.voiceConversion.sourceMediaId
	) {
		return true;
	}
	return settings.telephone.enabled && settings.telephone.mix > 0;
}

export function buildLegacyAudioFields({
	settings,
}: {
	settings: MediaAudioSettings;
}): Pick<
	MediaElement,
	| "volume"
	| "audioFadeIn"
	| "audioFadeOut"
	| "audioNormalize"
	| "audioDenoise"
	| "audioPan"
> {
	return {
		volume: dbToGain({
			db: settings.enabled ? settings.volumeDb : MIN_AUDIO_VOLUME_DB,
		}),
		audioFadeIn: settings.fadeIn,
		audioFadeOut: settings.fadeOut,
		audioNormalize: settings.loudness.enabled,
		audioDenoise: settings.denoise.enabled ? settings.denoise.amount : 0,
		audioPan: settings.panEnabled ? settings.pan : 0,
	};
}
