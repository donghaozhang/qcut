import type {
	AudioBusEffectsSettings,
	AudioMixBusSettings,
	ProjectAudioMixSettings,
	TimelineTrack,
	TimelineTrackAudioSettings,
} from "@/types/timeline";
import { dbToGain } from "./audio-properties";
import {
	MASTER_AUDIO_BUS_ID,
	createDefaultAudioMixBus,
	createDefaultProjectAudioMixSettings,
	createDefaultTrackAudioSettings,
	normalizeProjectAudioMixSettings,
	normalizeTrackAudioSettings,
} from "./audio-mix-settings";
import {
	type AudioMeterReading,
	calculateAudioMeterReading,
} from "./audio-metering";

const MAX_BUS_EQ_BANDS = 8;

interface MeterTap {
	rawAnalyser: AnalyserNode;
	kWeightedAnalyser: AnalyserNode;
	rawSamples: Float32Array<ArrayBuffer>;
	kWeightedSamples: Float32Array<ArrayBuffer>;
}

interface ProcessingStrip {
	input: GainNode;
	lowCut: BiquadFilterNode;
	bands: BiquadFilterNode[];
	highCut: BiquadFilterNode;
	compressor: DynamicsCompressorNode;
	compressorMakeup: GainNode;
	baseGain: GainNode;
	duckGain: GainNode;
	panner: StereoPannerNode;
	limiter: DynamicsCompressorNode;
	meter: MeterTap;
	output: AnalyserNode;
}

interface TrackStrip extends ProcessingStrip {
	trackId: string;
	settings: TimelineTrackAudioSettings;
	muted: boolean;
	routedBusId: string;
	duckingReductionDb: number;
}

interface BusStrip extends ProcessingStrip {
	busId: string;
	settings: AudioMixBusSettings;
}

export interface AudioMixMeterSnapshot {
	master: AudioMeterReading;
	tracks: Record<string, AudioMeterReading>;
	buses: Record<string, AudioMeterReading>;
	duckingReductionDb: Record<string, number>;
}

let sharedContext: AudioContext | null = null;
let masterStrip: BusStrip | null = null;
const trackStrips = new Map<string, TrackStrip>();
const busStrips = new Map<string, BusStrip>();

function smooth({
	parameter,
	value,
	context,
	timeConstant = 0.012,
}: {
	parameter: AudioParam;
	value: number;
	context: AudioContext;
	timeConstant?: number;
}) {
	parameter.cancelScheduledValues(context.currentTime);
	parameter.setTargetAtTime(
		value,
		context.currentTime,
		Math.max(0.001, timeConstant)
	);
}

export function getAudioMixContext(): AudioContext | null {
	if (typeof window === "undefined" || !window.AudioContext) return null;
	sharedContext ??= new window.AudioContext({ latencyHint: "interactive" });
	return sharedContext;
}

function createMeterTap({
	context,
	input,
}: {
	context: AudioContext;
	input: AudioNode;
}): MeterTap {
	const rawAnalyser = context.createAnalyser();
	rawAnalyser.fftSize = 2_048;
	rawAnalyser.smoothingTimeConstant = 0.65;
	input.connect(rawAnalyser);

	const kShelf = context.createBiquadFilter();
	kShelf.type = "highshelf";
	kShelf.frequency.value = 1_681.97;
	kShelf.gain.value = 4;
	const kHighpass = context.createBiquadFilter();
	kHighpass.type = "highpass";
	kHighpass.frequency.value = 38.14;
	kHighpass.Q.value = 0.5;
	const kWeightedAnalyser = context.createAnalyser();
	kWeightedAnalyser.fftSize = 2_048;
	kWeightedAnalyser.smoothingTimeConstant = 0.65;
	const silentSink = context.createGain();
	silentSink.gain.value = 0;
	input.connect(kShelf);
	kShelf.connect(kHighpass);
	kHighpass.connect(kWeightedAnalyser);
	kWeightedAnalyser.connect(silentSink);
	silentSink.connect(context.destination);

	return {
		rawAnalyser,
		kWeightedAnalyser,
		rawSamples: createSampleBuffer({ length: rawAnalyser.fftSize }),
		kWeightedSamples: createSampleBuffer({
			length: kWeightedAnalyser.fftSize,
		}),
	};
}

function createSampleBuffer({
	length,
}: {
	length: number;
}): Float32Array<ArrayBuffer> {
	return new Float32Array(length) as Float32Array<ArrayBuffer>;
}

function createProcessingStrip({
	context,
}: {
	context: AudioContext;
}): ProcessingStrip {
	const input = context.createGain();
	const lowCut = context.createBiquadFilter();
	lowCut.type = "highpass";
	const bands = Array.from({ length: MAX_BUS_EQ_BANDS }, () =>
		context.createBiquadFilter()
	);
	const highCut = context.createBiquadFilter();
	highCut.type = "lowpass";
	const compressor = context.createDynamicsCompressor();
	const compressorMakeup = context.createGain();
	const baseGain = context.createGain();
	const duckGain = context.createGain();
	const panner = context.createStereoPanner();
	const limiter = context.createDynamicsCompressor();
	limiter.knee.value = 0;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.003;

	input.connect(lowCut);
	let previous: AudioNode = lowCut;
	for (const band of bands) {
		previous.connect(band);
		previous = band;
	}
	previous.connect(highCut);
	highCut.connect(compressor);
	compressor.connect(compressorMakeup);
	compressorMakeup.connect(baseGain);
	baseGain.connect(duckGain);
	duckGain.connect(panner);
	panner.connect(limiter);
	const meter = createMeterTap({ context, input: limiter });

	return {
		input,
		lowCut,
		bands,
		highCut,
		compressor,
		compressorMakeup,
		baseGain,
		duckGain,
		panner,
		limiter,
		meter,
		output: meter.rawAnalyser,
	};
}

function updateEffects({
	strip,
	effects,
	context,
}: {
	strip: ProcessingStrip;
	effects: AudioBusEffectsSettings;
	context: AudioContext;
}) {
	const equalizer = effects.parametricEqualizer;
	smooth({
		parameter: strip.lowCut.frequency,
		value: equalizer.enabled ? equalizer.lowCutHz : 20,
		context,
	});
	smooth({
		parameter: strip.highCut.frequency,
		value: equalizer.enabled ? equalizer.highCutHz : 20_000,
		context,
	});
	for (const [index, node] of strip.bands.entries()) {
		const band = equalizer.enabled ? equalizer.bands[index] : undefined;
		if (!band?.enabled) {
			node.type = "peaking";
			smooth({ parameter: node.gain, value: 0, context });
			continue;
		}
		node.type =
			band.type === "bell"
				? "peaking"
				: band.type === "low-shelf"
					? "lowshelf"
					: band.type === "high-shelf"
						? "highshelf"
						: "notch";
		smooth({ parameter: node.frequency, value: band.frequencyHz, context });
		smooth({ parameter: node.Q, value: band.q, context });
		smooth({
			parameter: node.gain,
			value: band.type === "notch" ? 0 : band.gainDb,
			context,
		});
	}

	const compressor = effects.compressor;
	smooth({
		parameter: strip.compressor.threshold,
		value: compressor.enabled ? compressor.thresholdDb : 0,
		context,
	});
	smooth({
		parameter: strip.compressor.ratio,
		value: compressor.enabled ? compressor.ratio : 1,
		context,
	});
	smooth({
		parameter: strip.compressor.attack,
		value: compressor.attackMs / 1_000,
		context,
	});
	smooth({
		parameter: strip.compressor.release,
		value: compressor.releaseMs / 1_000,
		context,
	});
	smooth({
		parameter: strip.compressorMakeup.gain,
		value: compressor.enabled ? dbToGain({ db: compressor.makeupGainDb }) : 1,
		context,
	});

	const limiter = effects.limiter;
	smooth({
		parameter: strip.limiter.threshold,
		value: limiter.enabled ? limiter.ceilingDb : 0,
		context,
	});
	smooth({
		parameter: strip.limiter.ratio,
		value: limiter.enabled ? 20 : 1,
		context,
	});
	smooth({
		parameter: strip.limiter.release,
		value: limiter.releaseMs / 1_000,
		context,
	});
}

function ensureMasterStrip({ context }: { context: AudioContext }): BusStrip {
	if (masterStrip) return masterStrip;
	const settings = createDefaultProjectAudioMixSettings().master;
	const strip = {
		...createProcessingStrip({ context }),
		busId: MASTER_AUDIO_BUS_ID,
		settings,
	};
	strip.output.connect(context.destination);
	masterStrip = strip;
	return strip;
}

function ensureBusStrip({
	context,
	busId,
}: {
	context: AudioContext;
	busId: string;
}): BusStrip {
	const existing = busStrips.get(busId);
	if (existing) return existing;
	const settings = createDefaultAudioMixBus({ id: busId, name: busId });
	const strip = { ...createProcessingStrip({ context }), busId, settings };
	strip.output.connect(ensureMasterStrip({ context }).input);
	busStrips.set(busId, strip);
	return strip;
}

function ensureTrackStrip({
	context,
	trackId,
}: {
	context: AudioContext;
	trackId: string;
}): TrackStrip {
	const existing = trackStrips.get(trackId);
	if (existing) return existing;
	const settings = createDefaultTrackAudioSettings();
	const strip: TrackStrip = {
		...createProcessingStrip({ context }),
		trackId,
		settings,
		muted: false,
		routedBusId: MASTER_AUDIO_BUS_ID,
		duckingReductionDb: 0,
	};
	strip.output.connect(ensureMasterStrip({ context }).input);
	trackStrips.set(trackId, strip);
	return strip;
}

function readStripMeter({
	strip,
}: {
	strip: ProcessingStrip;
}): AudioMeterReading {
	strip.meter.rawAnalyser.getFloatTimeDomainData(strip.meter.rawSamples);
	strip.meter.kWeightedAnalyser.getFloatTimeDomainData(
		strip.meter.kWeightedSamples
	);
	return calculateAudioMeterReading({
		samples: strip.meter.rawSamples,
		kWeightedSamples: strip.meter.kWeightedSamples,
		gainReductionDb: Math.min(
			strip.compressor.reduction,
			strip.limiter.reduction
		),
	});
}

function routeTrack({
	strip,
	busId,
	context,
}: {
	strip: TrackStrip;
	busId: string;
	context: AudioContext;
}) {
	if (strip.routedBusId === busId) return;
	strip.output.disconnect();
	const target =
		busId === MASTER_AUDIO_BUS_ID
			? ensureMasterStrip({ context })
			: ensureBusStrip({ context, busId });
	strip.output.connect(target.input);
	strip.routedBusId = busId;
}

function updateBusStrip({
	strip,
	settings,
	muted,
	context,
}: {
	strip: BusStrip;
	settings: AudioMixBusSettings;
	muted: boolean;
	context: AudioContext;
}) {
	strip.settings = settings;
	updateEffects({ strip, effects: settings.effects, context });
	smooth({
		parameter: strip.baseGain.gain,
		value: muted || settings.muted ? 0 : dbToGain({ db: settings.gainDb }),
		context,
	});
	smooth({ parameter: strip.panner.pan, value: settings.pan, context });
}

export function syncAudioMixEngine({
	tracks,
	audioMix,
}: {
	tracks: TimelineTrack[];
	audioMix?: ProjectAudioMixSettings;
}) {
	const context = getAudioMixContext();
	if (!context) return;
	const normalizedMix = normalizeProjectAudioMixSettings({ audioMix });
	const master = ensureMasterStrip({ context });
	updateBusStrip({
		strip: master,
		settings: normalizedMix.master,
		muted: false,
		context,
	});

	const activeBusIds = new Set(normalizedMix.buses.map((bus) => bus.id));
	const anyBusSolo = normalizedMix.buses.some((bus) => bus.solo);
	for (const bus of normalizedMix.buses) {
		const strip = ensureBusStrip({ context, busId: bus.id });
		updateBusStrip({
			strip,
			settings: bus,
			muted: anyBusSolo && !bus.solo,
			context,
		});
	}
	for (const [busId, strip] of busStrips) {
		if (activeBusIds.has(busId)) continue;
		strip.input.disconnect();
		strip.output.disconnect();
		busStrips.delete(busId);
	}

	const audioTracks = tracks.filter(
		(track) => track.type === "audio" || track.type === "media"
	);
	const anyTrackSolo = audioTracks.some((track) => track.audio?.solo === true);
	const activeTrackIds = new Set(audioTracks.map((track) => track.id));
	for (const track of audioTracks) {
		const settings = normalizeTrackAudioSettings({ audio: track.audio });
		const routedBus = normalizedMix.buses.find(
			(bus) => bus.id === settings.busId
		);
		const soloBusMuted = anyBusSolo && routedBus?.solo !== true;
		const muted =
			track.muted === true || (anyTrackSolo && !settings.solo) || soloBusMuted;
		const strip = ensureTrackStrip({ context, trackId: track.id });
		strip.settings = settings;
		strip.muted = muted;
		updateEffects({ strip, effects: settings.effects, context });
		smooth({
			parameter: strip.baseGain.gain,
			value: muted ? 0 : dbToGain({ db: settings.gainDb }),
			context,
		});
		smooth({ parameter: strip.panner.pan, value: settings.pan, context });
		routeTrack({
			strip,
			busId: routedBus?.id ?? MASTER_AUDIO_BUS_ID,
			context,
		});
	}
	for (const [trackId, strip] of trackStrips) {
		if (activeTrackIds.has(trackId)) continue;
		strip.input.disconnect();
		strip.output.disconnect();
		trackStrips.delete(trackId);
	}
}

function updateDucking({
	trackReadings,
	context,
}: {
	trackReadings: Record<string, AudioMeterReading>;
	context: AudioContext;
}) {
	for (const strip of trackStrips.values()) {
		const ducking = strip.settings.ducking;
		const shouldDuck =
			ducking.enabled &&
			ducking.sourceTrackIds.some(
				(sourceTrackId) =>
					(trackReadings[sourceTrackId]?.rmsDb ?? -120) >= ducking.thresholdDb
			);
		const reductionDb = shouldDuck ? Math.min(0, ducking.reductionDb) : 0;
		const timeConstant =
			(shouldDuck ? ducking.attackMs : ducking.releaseMs) / 1_000;
		strip.duckingReductionDb = reductionDb;
		smooth({
			parameter: strip.duckGain.gain,
			value: dbToGain({ db: reductionDb }),
			context,
			timeConstant,
		});
	}
}

export function readAudioMixMeters(): AudioMixMeterSnapshot | null {
	const context = getAudioMixContext();
	if (!context || !masterStrip) return null;
	const tracks: Record<string, AudioMeterReading> = {};
	const buses: Record<string, AudioMeterReading> = {};
	const duckingReductionDb: Record<string, number> = {};
	for (const [trackId, strip] of trackStrips) {
		tracks[trackId] = readStripMeter({ strip });
		duckingReductionDb[trackId] = strip.duckingReductionDb;
	}
	for (const [busId, strip] of busStrips) {
		buses[busId] = readStripMeter({ strip });
	}
	updateDucking({ trackReadings: tracks, context });
	return {
		master: readStripMeter({ strip: masterStrip }),
		tracks,
		buses,
		duckingReductionDb,
	};
}

export function getAudioTrackInput({
	trackId,
}: {
	trackId: string;
}): AudioNode | null {
	const context = getAudioMixContext();
	if (!context) return null;
	return ensureTrackStrip({ context, trackId }).input;
}

export async function resumeAudioMixEngine(): Promise<void> {
	const context = getAudioMixContext();
	if (context?.state === "suspended") await context.resume();
}
