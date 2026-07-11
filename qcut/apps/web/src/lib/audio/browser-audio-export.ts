import type { FormantCorrectionNode } from "@soundtouchjs/formant-correction-worklet";
import formantProcessorUrl from "@soundtouchjs/formant-correction-worklet/processor?url";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	MediaAudioSettings,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	clampPlaybackRate,
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import { calculateAudioPreviewState } from "./audio-preview-state";
import {
	collectBrowserAudioExportClips,
	decodeBrowserAudioExportClips,
	type DecodedBrowserAudioExportClip,
} from "./browser-audio-export-clips";
import { reverseAudioBuffer } from "./audio-buffer-transform";

const MAX_AUTOMATION_RATE = 20;

interface BrowserAudioAutomationPoint {
	time: number;
	outputGain: number;
	pan: number;
	denoiseHighpass: number;
	denoiseLowpass: number;
	eqLow: number;
	eqMid: number;
	eqHigh: number;
	voiceWarmth: number;
	voiceClarity: number;
	voicePresence: number;
	pitchSemitones: number;
	formantStrength: number;
	compressorThreshold: number;
	compressorRatio: number;
	compressorMakeup: number;
	limiterThreshold: number;
	telephoneDry: number;
	telephoneWet: number;
	dryMix: number;
	reverbMix: number;
	echoMix: number;
	playbackRate: number;
}

function hasAudioKeyframes({
	settings,
}: {
	settings: MediaAudioSettings;
}): boolean {
	return Object.values(settings.keyframes ?? {}).some(
		(keyframes) => (keyframes?.length ?? 0) > 0
	);
}

function automationTimes({
	element,
	duration,
	fps,
}: {
	element: MediaElement;
	duration: number;
	fps: number;
}): number[] {
	const sampleRate = Math.min(MAX_AUTOMATION_RATE, Math.max(1, fps));
	const times = new Set<number>([0, duration]);
	const settings = element.audio;
	if (
		hasAudioKeyframes({
			settings:
				settings ??
				calculateAudioPreviewState({
					element,
					timelineTime: element.startTime,
					fps,
					duration,
					masterVolume: 1,
					muted: false,
					trackMuted: false,
					forceMuted: false,
				}).settings,
		}) ||
		(settings?.fadeIn ?? element.audioFadeIn ?? 0) > 0 ||
		(settings?.fadeOut ?? element.audioFadeOut ?? 0) > 0 ||
		(element.speedKeyframes?.length ?? 0) > 0 ||
		clampPlaybackRate(element.playbackRate) !== 1
	) {
		const sampleCount = Math.ceil(duration * sampleRate);
		for (let sample = 1; sample < sampleCount; sample += 1) {
			times.add(Math.min(duration, sample / sampleRate));
		}
	}
	for (const keyframes of Object.values(settings?.keyframes ?? {})) {
		for (const keyframe of keyframes ?? []) {
			times.add(
				Math.min(duration, Math.max(0, keyframe.frame / Math.max(1, fps)))
			);
		}
	}
	return [...times].sort((left, right) => left - right);
}

function pointFromState({
	element,
	time,
	duration,
	fps,
}: {
	element: MediaElement;
	time: number;
	duration: number;
	fps: number;
}): BrowserAudioAutomationPoint {
	const state = calculateAudioPreviewState({
		element,
		timelineTime: element.startTime + time,
		fps,
		duration,
		masterVolume: 1,
		muted: false,
		trackMuted: false,
		forceMuted: false,
	});
	const { settings } = state;
	const denoiseAmount = settings.denoise.enabled
		? settings.denoise.amount / 100
		: 0;
	const telephoneMix = settings.telephone.enabled
		? settings.telephone.mix / 100
		: 0;
	const reverbMix = settings.reverb.enabled ? settings.reverb.mix / 100 : 0;
	const echoMix = settings.echo.enabled ? settings.echo.mix / 100 : 0;
	const pitchEnabled =
		settings.pitch.enabled && Math.abs(settings.pitch.semitones) >= 0.01;
	return {
		time,
		outputGain: state.outputGain,
		pan: state.pan,
		denoiseHighpass: 20 + denoiseAmount * 120,
		denoiseLowpass: 22_000 - denoiseAmount * 12_000,
		eqLow: settings.equalizer.enabled ? settings.equalizer.lowGainDb : 0,
		eqMid: settings.equalizer.enabled ? settings.equalizer.midGainDb : 0,
		eqHigh: settings.equalizer.enabled ? settings.equalizer.highGainDb : 0,
		voiceWarmth: settings.voiceEnhance.enabled
			? settings.voiceEnhance.warmth * 0.08
			: 0,
		voiceClarity: settings.voiceEnhance.enabled
			? settings.voiceEnhance.clarity * 0.08
			: 0,
		voicePresence: settings.voiceEnhance.enabled
			? settings.voiceEnhance.presence * 0.08
			: 0,
		pitchSemitones: pitchEnabled ? settings.pitch.semitones : 0,
		formantStrength: pitchEnabled && settings.pitch.preserveFormants ? 1 : 0,
		compressorThreshold: settings.compressor.enabled
			? settings.compressor.thresholdDb
			: 0,
		compressorRatio: settings.compressor.enabled
			? settings.compressor.ratio
			: 1,
		compressorMakeup: settings.compressor.enabled
			? 10 ** (settings.compressor.makeupGainDb / 20)
			: 1,
		limiterThreshold: settings.limiter.enabled ? settings.limiter.ceilingDb : 0,
		telephoneDry: 1 - telephoneMix,
		telephoneWet: telephoneMix,
		dryMix: Math.max(0, 1 - Math.max(reverbMix, echoMix)),
		reverbMix,
		echoMix,
		playbackRate: mapMediaTimelineTime({
			element,
			localTimelineTime: time,
			fps,
		}).playbackRate,
	};
}

export function buildBrowserAudioAutomation({
	element,
	duration,
	fps,
}: {
	element: MediaElement;
	duration: number;
	fps: number;
}): BrowserAudioAutomationPoint[] {
	return automationTimes({ element, duration, fps }).map((time) =>
		pointFromState({ element, time, duration, fps })
	);
}

function scheduleParameter({
	parameter,
	points,
	startTime,
	value,
}: {
	parameter: AudioParam;
	points: BrowserAudioAutomationPoint[];
	startTime: number;
	value: (point: BrowserAudioAutomationPoint) => number;
}) {
	const first = points[0];
	if (!first) return;
	parameter.setValueAtTime(value(first), startTime + first.time);
	for (const point of points.slice(1)) {
		parameter.linearRampToValueAtTime(value(point), startTime + point.time);
	}
}

function createImpulse({
	context,
	roomSize,
	damping,
}: {
	context: OfflineAudioContext;
	roomSize: number;
	damping: number;
}): AudioBuffer {
	const duration = 0.25 + (roomSize / 100) * 2.75;
	const length = Math.max(1, Math.round(context.sampleRate * duration));
	const impulse = context.createBuffer(2, length, context.sampleRate);
	const decay = 1.5 + (damping / 100) * 5;
	let seed = 0x51f15e;
	for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
		const samples = impulse.getChannelData(channel);
		for (let index = 0; index < samples.length; index += 1) {
			seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
			const noise = (seed / 0xffff_ffff) * 2 - 1;
			const envelope = (1 - index / samples.length) ** decay;
			samples[index] = noise * envelope;
		}
	}
	return impulse;
}

function clipNeedsPitch({ element }: { element: MediaElement }): boolean {
	const settings = element.audio;
	return Boolean(
		clampPlaybackRate(element.playbackRate) !== 1 ||
			(element.speedKeyframes?.length ?? 0) > 0 ||
			(settings?.pitch.enabled &&
				(Math.abs(settings.pitch.semitones) >= 0.01 ||
					(settings.keyframes?.pitchSemitones?.length ?? 0) > 0))
	);
}

async function scheduleClip({
	context,
	clip,
	fps,
	pitchNodeConstructor,
}: {
	context: OfflineAudioContext;
	clip: DecodedBrowserAudioExportClip;
	fps: number;
	pitchNodeConstructor?: typeof FormantCorrectionNode;
}) {
	const { element, buffer } = clip;
	const startTime = Math.max(0, element.startTime);
	const duration = Math.max(
		0,
		Math.min(
			getMediaTimelineDuration(element, fps),
			context.length / context.sampleRate - startTime
		)
	);
	if (duration <= 0) return;

	const source = context.createBufferSource();
	const input = context.createGain();
	const denoiseHighpass = context.createBiquadFilter();
	const denoiseLowpass = context.createBiquadFilter();
	const eqLow = context.createBiquadFilter();
	const eqMid = context.createBiquadFilter();
	const eqHigh = context.createBiquadFilter();
	const warmth = context.createBiquadFilter();
	const clarity = context.createBiquadFilter();
	const presence = context.createBiquadFilter();
	const compressor = context.createDynamicsCompressor();
	const compressorMakeup = context.createGain();
	const limiter = context.createDynamicsCompressor();
	const telephoneDry = context.createGain();
	const telephoneHighpass = context.createBiquadFilter();
	const telephoneLowpass = context.createBiquadFilter();
	const telephoneWet = context.createGain();
	const effectsBus = context.createGain();
	const dryGain = context.createGain();
	const convolver = context.createConvolver();
	const reverbGain = context.createGain();
	const delay = context.createDelay(2);
	const echoGain = context.createGain();
	const feedbackGain = context.createGain();
	const panner = context.createStereoPanner();
	const output = context.createGain();

	denoiseHighpass.type = "highpass";
	denoiseLowpass.type = "lowpass";
	eqLow.type = "lowshelf";
	eqLow.frequency.value = 160;
	eqMid.type = "peaking";
	eqMid.frequency.value = 1_000;
	eqMid.Q.value = 0.8;
	eqHigh.type = "highshelf";
	eqHigh.frequency.value = 5_500;
	warmth.type = "lowshelf";
	warmth.frequency.value = 220;
	clarity.type = "peaking";
	clarity.frequency.value = 2_400;
	clarity.Q.value = 0.85;
	presence.type = "highshelf";
	presence.frequency.value = 4_800;
	telephoneHighpass.type = "highpass";
	telephoneHighpass.frequency.value = 320;
	telephoneLowpass.type = "lowpass";
	telephoneLowpass.frequency.value = 3_400;
	compressor.knee.value = 30;
	limiter.knee.value = 0;
	limiter.ratio.value = 20;
	limiter.attack.value = 0.003;

	source.buffer = element.reverse
		? reverseAudioBuffer({ context, buffer })
		: buffer;
	const playbackRate = clampPlaybackRate(element.playbackRate ?? 1);
	source.playbackRate.value = playbackRate;
	source.connect(input);
	input.connect(denoiseHighpass);
	denoiseHighpass.connect(denoiseLowpass);
	denoiseLowpass.connect(eqLow);
	eqLow.connect(eqMid);
	eqMid.connect(eqHigh);
	eqHigh.connect(warmth);
	warmth.connect(clarity);
	clarity.connect(presence);

	let pitchNode: FormantCorrectionNode | null = null;
	if (pitchNodeConstructor && clipNeedsPitch({ element })) {
		pitchNode = new pitchNodeConstructor({ context });
		pitchNode.playbackRate.value = playbackRate;
		presence.connect(pitchNode);
		pitchNode.connect(compressor);
	} else {
		presence.connect(compressor);
	}
	compressor.connect(compressorMakeup);
	compressorMakeup.connect(limiter);
	limiter.connect(telephoneDry);
	telephoneDry.connect(effectsBus);
	limiter.connect(telephoneHighpass);
	telephoneHighpass.connect(telephoneLowpass);
	telephoneLowpass.connect(telephoneWet);
	telephoneWet.connect(effectsBus);
	effectsBus.connect(dryGain);
	dryGain.connect(panner);
	effectsBus.connect(convolver);
	convolver.connect(reverbGain);
	reverbGain.connect(panner);
	effectsBus.connect(delay);
	delay.connect(echoGain);
	echoGain.connect(panner);
	delay.connect(feedbackGain);
	feedbackGain.connect(delay);
	panner.connect(output);
	output.connect(context.destination);

	const baseSettings = calculateAudioPreviewState({
		element,
		timelineTime: element.startTime,
		fps,
		duration,
		masterVolume: 1,
		muted: false,
		trackMuted: false,
		forceMuted: false,
	}).settings;
	compressor.attack.value = baseSettings.compressor.attackMs / 1_000;
	compressor.release.value = baseSettings.compressor.releaseMs / 1_000;
	limiter.release.value = baseSettings.limiter.releaseMs / 1_000;
	delay.delayTime.value = baseSettings.echo.delayMs / 1_000;
	feedbackGain.gain.value = baseSettings.echo.enabled
		? Math.min(0.85, baseSettings.echo.feedback / 100)
		: 0;
	convolver.buffer = createImpulse({
		context,
		roomSize: baseSettings.reverb.roomSize,
		damping: baseSettings.reverb.damping,
	});

	const points = buildBrowserAudioAutomation({ element, duration, fps });
	const schedules: Array<
		[AudioParam, (point: BrowserAudioAutomationPoint) => number]
	> = [
		[output.gain, (point) => point.outputGain],
		[panner.pan, (point) => point.pan],
		[denoiseHighpass.frequency, (point) => point.denoiseHighpass],
		[denoiseLowpass.frequency, (point) => point.denoiseLowpass],
		[eqLow.gain, (point) => point.eqLow],
		[eqMid.gain, (point) => point.eqMid],
		[eqHigh.gain, (point) => point.eqHigh],
		[warmth.gain, (point) => point.voiceWarmth],
		[clarity.gain, (point) => point.voiceClarity],
		[presence.gain, (point) => point.voicePresence],
		[compressor.threshold, (point) => point.compressorThreshold],
		[compressor.ratio, (point) => point.compressorRatio],
		[compressorMakeup.gain, (point) => point.compressorMakeup],
		[limiter.threshold, (point) => point.limiterThreshold],
		[telephoneDry.gain, (point) => point.telephoneDry],
		[telephoneWet.gain, (point) => point.telephoneWet],
		[dryGain.gain, (point) => point.dryMix],
		[reverbGain.gain, (point) => point.reverbMix],
		[echoGain.gain, (point) => point.echoMix],
	];
	for (const [parameter, value] of schedules) {
		scheduleParameter({ parameter, points, startTime, value });
	}
	scheduleParameter({
		parameter: source.playbackRate,
		points,
		startTime,
		value: (point) => point.playbackRate,
	});
	if (pitchNode) {
		scheduleParameter({
			parameter: pitchNode.playbackRate,
			points,
			startTime,
			value: (point) => point.playbackRate,
		});
		scheduleParameter({
			parameter: pitchNode.pitchSemitones,
			points,
			startTime,
			value: (point) => point.pitchSemitones,
		});
		scheduleParameter({
			parameter: pitchNode.formantStrength,
			points,
			startTime,
			value: (point) => point.formantStrength,
		});
	}

	const trimStart = element.reverse
		? Math.max(0, element.trimEnd || 0)
		: Math.max(0, element.trimStart || 0);
	const availableDuration = Math.max(0, buffer.duration - trimStart);
	const sourceDuration = Math.min(
		availableDuration,
		getMediaSourceDuration(element)
	);
	if (sourceDuration <= 0) return;
	source.start(startTime, trimStart, sourceDuration);
	source.stop(startTime + duration);
}

export async function renderBrowserTimelineAudio({
	tracks,
	mediaItems,
	totalDuration,
	fps,
	sampleRate = 48_000,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	totalDuration: number;
	fps: number;
	sampleRate?: number;
}): Promise<AudioBuffer | null> {
	const clips = collectBrowserAudioExportClips({ tracks, mediaItems });
	if (clips.length === 0 || totalDuration <= 0) return null;
	const context = new OfflineAudioContext(
		2,
		Math.max(1, Math.ceil(totalDuration * sampleRate)),
		sampleRate
	);
	const decodedClips = await decodeBrowserAudioExportClips({ context, clips });
	if (decodedClips.length === 0) {
		throw new Error("None of the timeline audio sources could be decoded");
	}
	const needsPitch = decodedClips.some((clip) =>
		clipNeedsPitch({ element: clip.element })
	);
	let pitchNodeConstructor: typeof FormantCorrectionNode | undefined;
	if (needsPitch) {
		const formantModule = await import(
			"@soundtouchjs/formant-correction-worklet"
		);
		pitchNodeConstructor = formantModule.FormantCorrectionNode;
		await pitchNodeConstructor.register(context, formantProcessorUrl);
	}
	await Promise.all(
		decodedClips.map((clip) =>
			scheduleClip({
				context,
				clip,
				fps,
				pitchNodeConstructor,
			})
		)
	);
	return context.startRendering();
}
