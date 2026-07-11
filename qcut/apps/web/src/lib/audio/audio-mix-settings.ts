import type {
	AudioBusEffectsSettings,
	AudioCompressorSettings,
	AudioLimiterSettings,
	AudioMixBusSettings,
	AudioParametricEqualizerSettings,
	AudioRepairSettings,
	ProjectAudioMixSettings,
	TimelineTrackAudioSettings,
} from "@/types/timeline";

export const MASTER_AUDIO_BUS_ID = "master";

const DEFAULT_EQ_BANDS: AudioParametricEqualizerSettings["bands"] = [
	{
		id: "low",
		enabled: true,
		type: "low-shelf",
		frequencyHz: 120,
		gainDb: 0,
		q: 0.7,
	},
	{
		id: "body",
		enabled: true,
		type: "bell",
		frequencyHz: 800,
		gainDb: 0,
		q: 1,
	},
	{
		id: "presence",
		enabled: true,
		type: "bell",
		frequencyHz: 3_200,
		gainDb: 0,
		q: 1,
	},
	{
		id: "air",
		enabled: true,
		type: "high-shelf",
		frequencyHz: 10_000,
		gainDb: 0,
		q: 0.7,
	},
];

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function createDefaultCompressorSettings(): AudioCompressorSettings {
	return {
		enabled: false,
		thresholdDb: -18,
		ratio: 3,
		attackMs: 10,
		releaseMs: 120,
		makeupGainDb: 0,
	};
}

export function createDefaultLimiterSettings(): AudioLimiterSettings {
	return { enabled: false, ceilingDb: -1, releaseMs: 50 };
}

export function createDefaultParametricEqualizerSettings(): AudioParametricEqualizerSettings {
	return {
		enabled: false,
		lowCutHz: 20,
		highCutHz: 20_000,
		bands: DEFAULT_EQ_BANDS.map((band) => ({ ...band })),
	};
}

export function createDefaultAudioRepairSettings(): AudioRepairSettings {
	return {
		deEsser: { enabled: false, amount: 35, frequencyHz: 6_500 },
		deReverb: { enabled: false, amount: 30 },
		deHum: { enabled: false, frequencyHz: 50, harmonics: 4 },
		dePlosive: { enabled: false, amount: 35 },
		deClick: { enabled: false, amount: 25 },
		deClip: { enabled: false, amount: 30 },
		noiseGate: {
			enabled: false,
			thresholdDb: -42,
			attackMs: 5,
			releaseMs: 120,
		},
	};
}

export function createDefaultAudioBusEffectsSettings(): AudioBusEffectsSettings {
	return {
		parametricEqualizer: createDefaultParametricEqualizerSettings(),
		compressor: createDefaultCompressorSettings(),
		limiter: createDefaultLimiterSettings(),
	};
}

export function createDefaultTrackAudioSettings(): TimelineTrackAudioSettings {
	return {
		gainDb: 0,
		pan: 0,
		solo: false,
		busId: MASTER_AUDIO_BUS_ID,
		effects: createDefaultAudioBusEffectsSettings(),
		ducking: {
			enabled: false,
			sourceTrackIds: [],
			thresholdDb: -30,
			reductionDb: -12,
			attackMs: 80,
			releaseMs: 350,
		},
		autoCrossfade: {
			enabled: false,
			defaultDuration: 0.5,
			curve: "equal-power",
		},
	};
}

export function createDefaultAudioMixBus({
	id,
	name,
}: {
	id: string;
	name: string;
}): AudioMixBusSettings {
	return {
		id,
		name,
		gainDb: 0,
		pan: 0,
		muted: false,
		solo: false,
		effects: createDefaultAudioBusEffectsSettings(),
	};
}

export function createDefaultProjectAudioMixSettings(): ProjectAudioMixSettings {
	return {
		master: createDefaultAudioMixBus({
			id: MASTER_AUDIO_BUS_ID,
			name: "Master",
		}),
		buses: [],
	};
}

function normalizeParametricEqualizer({
	settings,
}: {
	settings?: Partial<AudioParametricEqualizerSettings>;
}): AudioParametricEqualizerSettings {
	const defaults = createDefaultParametricEqualizerSettings();
	const bands = Array.isArray(settings?.bands)
		? settings.bands.map((band, index) => ({
				id: band.id || `band-${index + 1}`,
				enabled: band.enabled !== false,
				type: band.type ?? "bell",
				frequencyHz: clamp({
					value: band.frequencyHz,
					min: 20,
					max: 20_000,
				}),
				gainDb: clamp({ value: band.gainDb, min: -24, max: 24 }),
				q: clamp({ value: band.q, min: 0.1, max: 18 }),
			}))
		: defaults.bands;
	return {
		enabled: settings?.enabled === true,
		lowCutHz: clamp({
			value: settings?.lowCutHz ?? defaults.lowCutHz,
			min: 20,
			max: 2_000,
		}),
		highCutHz: clamp({
			value: settings?.highCutHz ?? defaults.highCutHz,
			min: 2_000,
			max: 20_000,
		}),
		bands,
	};
}

function normalizeBusEffects({
	effects,
}: {
	effects?: Partial<AudioBusEffectsSettings>;
}): AudioBusEffectsSettings {
	const defaults = createDefaultAudioBusEffectsSettings();
	return {
		parametricEqualizer: normalizeParametricEqualizer({
			settings: effects?.parametricEqualizer,
		}),
		compressor: { ...defaults.compressor, ...effects?.compressor },
		limiter: { ...defaults.limiter, ...effects?.limiter },
	};
}

export function normalizeTrackAudioSettings({
	audio,
}: {
	audio?: Partial<TimelineTrackAudioSettings>;
}): TimelineTrackAudioSettings {
	const defaults = createDefaultTrackAudioSettings();
	return {
		gainDb: clamp({ value: audio?.gainDb ?? 0, min: -60, max: 12 }),
		pan: clamp({ value: audio?.pan ?? 0, min: -1, max: 1 }),
		solo: audio?.solo === true,
		busId: audio?.busId?.trim() || MASTER_AUDIO_BUS_ID,
		effects: normalizeBusEffects({ effects: audio?.effects }),
		ducking: {
			...defaults.ducking,
			...audio?.ducking,
			sourceTrackIds: Array.from(
				new Set(
					(audio?.ducking?.sourceTrackIds ?? []).filter(
						(trackId): trackId is string =>
							typeof trackId === "string" && trackId.length > 0
					)
				)
			),
		},
		autoCrossfade: {
			...defaults.autoCrossfade,
			...audio?.autoCrossfade,
			defaultDuration: clamp({
				value:
					audio?.autoCrossfade?.defaultDuration ??
					defaults.autoCrossfade.defaultDuration,
				min: 0.01,
				max: 10,
			}),
		},
	};
}

function normalizeAudioMixBus({
	bus,
	fallback,
}: {
	bus?: Partial<AudioMixBusSettings>;
	fallback: AudioMixBusSettings;
}): AudioMixBusSettings {
	return {
		id: bus?.id?.trim() || fallback.id,
		name: bus?.name?.trim() || fallback.name,
		gainDb: clamp({ value: bus?.gainDb ?? 0, min: -60, max: 12 }),
		pan: clamp({ value: bus?.pan ?? 0, min: -1, max: 1 }),
		muted: bus?.muted === true,
		solo: bus?.solo === true,
		effects: normalizeBusEffects({ effects: bus?.effects }),
	};
}

export function normalizeProjectAudioMixSettings({
	audioMix,
}: {
	audioMix?: Partial<ProjectAudioMixSettings>;
}): ProjectAudioMixSettings {
	const defaults = createDefaultProjectAudioMixSettings();
	const seenBusIds = new Set([MASTER_AUDIO_BUS_ID]);
	const buses: AudioMixBusSettings[] = [];
	for (const [index, candidate] of (audioMix?.buses ?? []).entries()) {
		const bus = normalizeAudioMixBus({
			bus: candidate,
			fallback: createDefaultAudioMixBus({
				id: `bus-${index + 1}`,
				name: `Bus ${index + 1}`,
			}),
		});
		if (seenBusIds.has(bus.id)) continue;
		seenBusIds.add(bus.id);
		buses.push(bus);
	}
	return {
		master: normalizeAudioMixBus({
			bus: audioMix?.master,
			fallback: defaults.master,
		}),
		buses,
	};
}

export { normalizeParametricEqualizer };
