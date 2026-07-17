import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import type { TimelineTrack } from "@/types/timeline";

export interface AudioLoopSegment {
	startTime: number;
	trimEnd: number;
	fadeOut: number;
}

export type AudioBeatAlignment = "nearest" | "next";

const MAX_AUDIO_LOOP_SEGMENTS = 1_000;

export function snapTimeToAudioBeatGrid({
	time,
	bpm,
	alignment = "nearest",
}: {
	time: number;
	bpm: number;
	alignment?: AudioBeatAlignment;
}): number {
	if (!Number.isFinite(time)) return 0;
	const boundedTime = Math.max(0, time);
	if (!Number.isFinite(bpm) || bpm <= 0) return boundedTime;

	const beatDuration = 60 / bpm;
	const beatPosition = boundedTime / beatDuration;
	const beatIndex =
		alignment === "next"
			? Math.ceil(beatPosition - Number.EPSILON)
			: Math.round(beatPosition);
	return Number((beatIndex * beatDuration).toFixed(6));
}

function effectiveElementDuration({
	duration,
	trimStart = 0,
	trimEnd = 0,
}: {
	duration: number;
	trimStart?: number;
	trimEnd?: number;
}): number {
	return Math.max(0, duration - trimStart - trimEnd);
}

export function getVisualTimelineEnd({
	tracks,
	fps,
}: {
	tracks: readonly TimelineTrack[];
	fps?: number;
}): number {
	let timelineEnd = 0;
	for (const track of tracks) {
		if (track.type === "audio") continue;
		for (const element of track.elements) {
			// Media elements need the timeline-aware duration so speed-adjusted
			// clips report the length they actually occupy on the timeline.
			const elementDuration =
				element.type === "media"
					? getMediaTimelineDuration(element, fps)
					: effectiveElementDuration(element);
			const endTime = element.startTime + elementDuration;
			timelineEnd = Math.max(timelineEnd, endTime);
		}
	}
	return timelineEnd;
}

export function buildAudioLoopSegments({
	sourceDuration,
	targetStart = 0,
	targetEnd,
	finalFadeOut = 0.5,
}: {
	sourceDuration: number;
	targetStart?: number;
	targetEnd: number;
	finalFadeOut?: number;
}): AudioLoopSegment[] {
	if (
		!Number.isFinite(sourceDuration) ||
		sourceDuration <= 0 ||
		!Number.isFinite(targetStart) ||
		!Number.isFinite(targetEnd) ||
		targetEnd <= targetStart
	) {
		return [];
	}

	const requestedCount = Math.ceil((targetEnd - targetStart) / sourceDuration);
	if (requestedCount > MAX_AUDIO_LOOP_SEGMENTS) return [];

	const segments: AudioLoopSegment[] = [];
	for (let index = 0; index < requestedCount; index += 1) {
		const startTime = targetStart + index * sourceDuration;
		const effectiveDuration = Math.min(sourceDuration, targetEnd - startTime);
		const isFinal = index === requestedCount - 1;
		segments.push({
			startTime,
			trimEnd: Math.max(0, sourceDuration - effectiveDuration),
			fadeOut: isFinal
				? Math.min(Math.max(0, finalFadeOut), effectiveDuration / 2)
				: 0,
		});
	}
	return segments;
}

export function getAutomaticDuckingSourceTrackIds({
	tracks,
	targetTrackId,
}: {
	tracks: readonly TimelineTrack[];
	targetTrackId: string;
}): string[] {
	return tracks
		.filter(
			(track) =>
				track.id !== targetTrackId &&
				track.muted !== true &&
				track.elements.some((element) => element.type === "media")
		)
		.map((track) => track.id);
}
