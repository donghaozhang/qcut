import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";

const MIN_RATE = 0.1;
const MAX_RATE = 8;

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
	return Math.min(MAX_RATE, Math.max(MIN_RATE, rate ?? 1));
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
			Math.max(0, Math.round(sourceTime * Math.max(1, fps)))
		)
	);
}

export function buildMediaTimingProfile(
	element: MediaElement,
	fps = 30
): MediaTimingPoint[] {
	const sourceDuration = getMediaSourceDuration(element);
	const sampleRate = Math.max(1, fps);
	const points: MediaTimingPoint[] = [{ sourceTime: 0, timelineTime: 0 }];
	let sourceTime = 0;
	let timelineTime = 0;
	while (sourceTime < sourceDuration - 1e-9) {
		const step = Math.min(1 / sampleRate, sourceDuration - sourceTime);
		const rate = resolveSpeedAtSourceTime({
			baseRate: element.playbackRate ?? 1,
			keyframes: element.speedKeyframes,
			sourceTime: sourceTime + step / 2,
			fps: sampleRate,
		});
		sourceTime += step;
		timelineTime += step / rate;
		points.push({ sourceTime, timelineTime });
	}
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
	const profile = buildMediaTimingProfile(element, fps);
	return (
		(profile[profile.length - 1]?.timelineTime ?? 0) +
		Math.max(0, element.freezeFrameDuration ?? 0)
	);
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
