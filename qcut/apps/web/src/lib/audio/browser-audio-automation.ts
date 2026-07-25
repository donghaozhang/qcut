import type {
	MediaAudioSettings,
	MediaElement,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import {
	buildMediaTimingProfile,
	getMediaSourceDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import { calculateAudioPreviewState } from "./audio-preview-state";

const AUTOMATION_SAMPLES_PER_INTERVAL = 12;
export const MAX_BROWSER_AUDIO_AUTOMATION_POINTS = 512;

export interface BrowserAudioAutomationPoint {
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

function clampAutomationTime({
	time,
	duration,
}: {
	time: number;
	duration: number;
}): number {
	return Math.min(duration, Math.max(0, time));
}

function addAudioKeyframeTimes({
	times,
	keyframes,
	duration,
	fps,
}: {
	times: Set<number>;
	keyframes: MediaPropertyKeyframe[];
	duration: number;
	fps: number;
}) {
	const sorted = [...keyframes].sort((left, right) => left.frame - right.frame);
	for (const keyframe of sorted) {
		times.add(
			clampAutomationTime({
				time: keyframe.frame / fps,
				duration,
			})
		);
	}
	for (let index = 1; index < sorted.length; index++) {
		const start = sorted[index - 1].frame / fps;
		const end = sorted[index].frame / fps;
		for (let step = 1; step < AUTOMATION_SAMPLES_PER_INTERVAL; step++) {
			times.add(
				clampAutomationTime({
					time:
						start + ((end - start) * step) / AUTOMATION_SAMPLES_PER_INTERVAL,
					duration,
				})
			);
		}
	}
}

function addSpeedCurveTimes({
	times,
	element,
	duration,
	fps,
}: {
	times: Set<number>;
	element: MediaElement;
	duration: number;
	fps: number;
}) {
	if ((element.speedKeyframes?.length ?? 0) === 0) return;
	for (const point of buildMediaTimingProfile(element, fps)) {
		times.add(
			clampAutomationTime({
				time: point.timelineTime,
				duration,
			})
		);
	}
}

function selectEvenly({
	values,
	limit,
}: {
	values: number[];
	limit: number;
}): number[] {
	if (values.length <= limit) return values;
	if (limit <= 1) return values.slice(0, Math.max(0, limit));
	return Array.from({ length: limit }, (_, index) => {
		const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
		return values[sourceIndex];
	});
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
	const safeFps = Math.max(1, fps);
	const times = new Set<number>([0, duration]);
	const settings = element.audio;
	const fadeIn = settings?.fadeIn ?? element.audioFadeIn ?? 0;
	const fadeOut = settings?.fadeOut ?? element.audioFadeOut ?? 0;
	if (fadeIn > 0) {
		times.add(clampAutomationTime({ time: fadeIn, duration }));
	}
	if (fadeOut > 0) {
		times.add(clampAutomationTime({ time: duration - fadeOut, duration }));
	}
	for (const keyframes of Object.values(settings?.keyframes ?? {})) {
		if (!keyframes || keyframes.length === 0) continue;
		addAudioKeyframeTimes({
			times,
			keyframes,
			duration,
			fps: safeFps,
		});
	}
	addSpeedCurveTimes({ times, element, duration, fps: safeFps });
	return selectEvenly({
		values: [...times].sort((left, right) => left - right),
		limit: MAX_BROWSER_AUDIO_AUTOMATION_POINTS,
	});
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
