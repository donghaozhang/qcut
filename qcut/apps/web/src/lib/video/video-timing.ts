import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE } from "./video-speed-constants";
const CURVE_SAMPLES_PER_INTERVAL = 12;
const MAX_TIMING_PROFILE_SEGMENTS = 512;

interface CachedTimingProfile {
	signature: string;
	points: MediaTimingPoint[];
}

const timingProfileCache = new WeakMap<
	MediaElement,
	Map<number, CachedTimingProfile>
>();

export interface MediaTimingPoint {
	sourceTime: number;
	timelineTime: number;
}

export interface MediaPlaybackTiming {
	sourceTime: number;
	timelineDuration: number;
	playbackRate: number;
	isFrozen: boolean;
}

export function clampPlaybackRate(rate: number | undefined): number {
	if (!Number.isFinite(rate)) return 1;
	return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate ?? 1));
}

export function getMediaSourceDuration(element: MediaElement): number {
	return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

export function resolveSpeedAtSourceTime({
	baseRate,
	keyframes,
	sourceTime,
	fps,
}: {
	baseRate: number;
	keyframes?: MediaPropertyKeyframe[];
	sourceTime: number;
	fps: number;
}): number {
	if (!keyframes || keyframes.length === 0) return clampPlaybackRate(baseRate);
	return clampPlaybackRate(
		interpolateNumber(
			keyframes as Keyframe[],
			Math.max(0, sourceTime * Math.max(1, fps))
		)
	);
}

function getTimingSignature({
	element,
	fps,
}: {
	element: MediaElement;
	fps: number;
}): string {
	return [
		element.duration,
		element.trimStart,
		element.trimEnd,
		element.playbackRate ?? 1,
		fps,
		...(element.speedKeyframes ?? []).flatMap((keyframe) => [
			keyframe.frame,
			keyframe.value,
			keyframe.easing,
		]),
	].join("|");
}

function getCurveSampleTimes({
	element,
	sourceDuration,
	fps,
}: {
	element: MediaElement;
	sourceDuration: number;
	fps: number;
}): number[] {
	const keyframeTimes = (element.speedKeyframes ?? []).map((keyframe) =>
		Math.min(sourceDuration, Math.max(0, keyframe.frame / fps))
	);
	const boundaries = [...new Set([0, ...keyframeTimes, sourceDuration])].sort(
		(left, right) => left - right
	);
	const intervalCount = Math.max(1, boundaries.length - 1);
	const intervalBudget = Math.max(
		1,
		Math.floor(MAX_TIMING_PROFILE_SEGMENTS / intervalCount)
	);
	const samplesPerInterval = Math.min(
		CURVE_SAMPLES_PER_INTERVAL,
		intervalBudget
	);
	const times: number[] = [0];
	for (let index = 0; index < boundaries.length - 1; index++) {
		const start = boundaries[index];
		const end = boundaries[index + 1];
		for (let step = 1; step <= samplesPerInterval; step++) {
			times.push(start + ((end - start) * step) / samplesPerInterval);
		}
	}
	return times;
}

export function buildMediaTimingProfile(
	element: MediaElement,
	fps = 30
): MediaTimingPoint[] {
	const sourceDuration = getMediaSourceDuration(element);
	const sampleRate = Math.max(1, fps);
	const signature = getTimingSignature({ element, fps: sampleRate });
	const cached = timingProfileCache.get(element)?.get(sampleRate);
	if (cached?.signature === signature) return cached.points;

	const points: MediaTimingPoint[] = [{ sourceTime: 0, timelineTime: 0 }];
	let timelineTime = 0;
	const sampleTimes = getCurveSampleTimes({
		element,
		sourceDuration,
		fps: sampleRate,
	});
	for (let index = 1; index < sampleTimes.length; index++) {
		const sourceStart = sampleTimes[index - 1];
		const sourceEnd = sampleTimes[index];
		const step = sourceEnd - sourceStart;
		const rate = resolveSpeedAtSourceTime({
			baseRate: element.playbackRate ?? 1,
			keyframes: element.speedKeyframes,
			sourceTime: sourceStart + step / 2,
			fps: sampleRate,
		});
		timelineTime += step / rate;
		points.push({ sourceTime: sourceEnd, timelineTime });
	}
	const cacheForElement =
		timingProfileCache.get(element) ?? new Map<number, CachedTimingProfile>();
	cacheForElement.set(sampleRate, { signature, points });
	timingProfileCache.set(element, cacheForElement);
	return points;
}

function interpolateProfile(
	points: MediaTimingPoint[],
	value: number,
	input: keyof MediaTimingPoint,
	output: keyof MediaTimingPoint
): number {
	if (points.length === 0) return 0;
	if (value <= points[0][input]) return points[0][output];
	const last = points[points.length - 1];
	if (value >= last[input]) return last[output];
	let low = 0;
	let high = points.length - 1;
	while (low + 1 < high) {
		const middle = Math.floor((low + high) / 2);
		if (points[middle][input] <= value) low = middle;
		else high = middle;
	}
	const from = points[low];
	const to = points[high];
	const span = Math.max(1e-9, to[input] - from[input]);
	const progress = (value - from[input]) / span;
	return from[output] + (to[output] - from[output]) * progress;
}

export function getMediaTimelineDuration(
	element: MediaElement,
	fps = 30
): number {
	if ((element.speedKeyframes?.length ?? 0) === 0) {
		return (
			getMediaSourceDuration(element) /
				clampPlaybackRate(element.playbackRate) +
			Math.max(0, element.freezeFrameDuration ?? 0)
		);
	}
	const profile = buildMediaTimingProfile(element, fps);
	return (
		(profile[profile.length - 1]?.timelineTime ?? 0) +
		Math.max(0, element.freezeFrameDuration ?? 0)
	);
}

function mapConstantMediaTimelineTime({
	element,
	localTimelineTime,
}: {
	element: MediaElement;
	localTimelineTime: number;
}): MediaPlaybackTiming {
	const sourceDuration = getMediaSourceDuration(element);
	const playbackRate = clampPlaybackRate(element.playbackRate);
	const speedDuration = sourceDuration / playbackRate;
	const freezeSourceTime = Math.min(
		sourceDuration,
		Math.max(0, element.freezeFrameTime ?? sourceDuration)
	);
	const freezeStart = freezeSourceTime / playbackRate;
	const freezeDuration = Math.max(0, element.freezeFrameDuration ?? 0);
	const clampedTimelineTime = Math.min(
		speedDuration + freezeDuration,
		Math.max(0, localTimelineTime)
	);
	const isFrozen =
		freezeDuration > 0 &&
		clampedTimelineTime >= freezeStart &&
		clampedTimelineTime < freezeStart + freezeDuration;
	const speedTimelineTime = isFrozen
		? freezeStart
		: clampedTimelineTime > freezeStart
			? clampedTimelineTime - freezeDuration
			: clampedTimelineTime;
	let sourceTime = Math.min(sourceDuration, speedTimelineTime * playbackRate);
	if (isFrozen) sourceTime = freezeSourceTime;
	if (element.reverse) sourceTime = sourceDuration - sourceTime;
	return {
		sourceTime,
		timelineDuration: speedDuration + freezeDuration,
		playbackRate: isFrozen ? 0 : playbackRate,
		isFrozen,
	};
}

export function mapMediaTimelineTime({
	element,
	localTimelineTime,
	fps = 30,
}: {
	element: MediaElement;
	localTimelineTime: number;
	fps?: number;
}): MediaPlaybackTiming {
	if ((element.speedKeyframes?.length ?? 0) === 0) {
		return mapConstantMediaTimelineTime({ element, localTimelineTime });
	}
	const profile = buildMediaTimingProfile(element, fps);
	const sourceDuration = getMediaSourceDuration(element);
	const speedDuration = profile[profile.length - 1]?.timelineTime ?? 0;
	const freezeSourceTime = Math.min(
		sourceDuration,
		Math.max(0, element.freezeFrameTime ?? sourceDuration)
	);
	const freezeStart = interpolateProfile(
		profile,
		freezeSourceTime,
		"sourceTime",
		"timelineTime"
	);
	const freezeDuration = Math.max(0, element.freezeFrameDuration ?? 0);
	const clampedTimelineTime = Math.min(
		speedDuration + freezeDuration,
		Math.max(0, localTimelineTime)
	);
	const isFrozen =
		freezeDuration > 0 &&
		clampedTimelineTime >= freezeStart &&
		clampedTimelineTime < freezeStart + freezeDuration;
	const speedTimelineTime = isFrozen
		? freezeStart
		: clampedTimelineTime > freezeStart
			? clampedTimelineTime - freezeDuration
			: clampedTimelineTime;
	let sourceTime = interpolateProfile(
		profile,
		Math.min(speedDuration, speedTimelineTime),
		"timelineTime",
		"sourceTime"
	);
	if (isFrozen) sourceTime = freezeSourceTime;
	if (element.reverse) sourceTime = sourceDuration - sourceTime;
	return {
		sourceTime,
		timelineDuration: speedDuration + freezeDuration,
		playbackRate: isFrozen
			? 0
			: resolveSpeedAtSourceTime({
					baseRate: element.playbackRate ?? 1,
					keyframes: element.speedKeyframes,
					sourceTime: element.reverse
						? sourceDuration - sourceTime
						: sourceTime,
					fps,
				}),
		isFrozen,
	};
}

export function mapMediaSourceTime({
	element,
	sourceTime,
	fps = 30,
}: {
	element: MediaElement;
	sourceTime: number;
	fps?: number;
}): number {
	const sourceDuration = getMediaSourceDuration(element);
	const visibleSourceTime = Math.min(
		sourceDuration,
		Math.max(0, sourceTime - element.trimStart)
	);
	const playbackSourceTime = element.reverse
		? sourceDuration - visibleSourceTime
		: visibleSourceTime;
	const speedTimelineTime =
		(element.speedKeyframes?.length ?? 0) === 0
			? playbackSourceTime / clampPlaybackRate(element.playbackRate)
			: interpolateProfile(
					buildMediaTimingProfile(element, fps),
					playbackSourceTime,
					"sourceTime",
					"timelineTime"
				);
	const freezeSourceTime = Math.min(
		sourceDuration,
		Math.max(0, element.freezeFrameTime ?? sourceDuration)
	);
	const passedFreezeFrame = playbackSourceTime > freezeSourceTime;
	return (
		speedTimelineTime +
		(passedFreezeFrame ? Math.max(0, element.freezeFrameDuration ?? 0) : 0)
	);
}

export function getMediaSourcePlaybackTime({
	element,
	localTimelineTime,
	fps = 30,
}: {
	element: MediaElement;
	localTimelineTime: number;
	fps?: number;
}): number {
	return (
		element.trimStart +
		mapMediaTimelineTime({ element, localTimelineTime, fps }).sourceTime
	);
}
