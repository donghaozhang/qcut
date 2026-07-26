import type { TimelineBeat } from "@/lib/audio/timeline-beats";
import { generateUUID } from "@/lib/utils";
import { getMediaTimelineDuration, mapMediaTimelineTime } from "./video-timing";
import { MAX_PLAYBACK_RATE, MIN_PLAYBACK_RATE } from "./video-speed-constants";
import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";

export type BeatSyncShapeId = "pulse" | "dip" | "hold";

export interface BeatSyncShape {
	id: BeatSyncShapeId;
	/** Rate held between beats. */
	baseRate: number;
	/** Rate reached at each beat. */
	beatRate: number;
	/** Half-width of the transition around a beat, in seconds of source time. */
	windowSeconds: number;
}

export const BEAT_SYNC_SHAPES: Record<BeatSyncShapeId, BeatSyncShape> = {
	// Speeds up between beats and snaps back to normal on the beat.
	pulse: { id: "pulse", baseRate: 2, beatRate: 1, windowSeconds: 0.1 },
	// Drops into slow motion on every beat.
	dip: { id: "dip", baseRate: 1.6, beatRate: 0.4, windowSeconds: 0.12 },
	// Freezes the action on the beat, then races to the next one.
	hold: { id: "hold", baseRate: 3, beatRate: 0.2, windowSeconds: 0.16 },
};

function clampRate({ rate }: { rate: number }): number {
	return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate));
}

/**
 * Source frames of every timeline beat that falls inside a clip.
 *
 * Beats carry absolute timeline timestamps, so each one is converted back through
 * the clip's timing profile — under a speed curve the beats are not evenly spaced
 * in source space even when the music is.
 */
export function resolveElementBeatFrames({
	element,
	timelineBeats,
	fps = 30,
}: {
	element: MediaElement;
	timelineBeats: readonly TimelineBeat[];
	fps?: number;
}): number[] {
	const timelineDuration = getMediaTimelineDuration(element, fps);
	if (timelineDuration <= 0) return [];
	const frames = new Set<number>();
	for (const beat of timelineBeats) {
		const localTimelineTime = beat.timestamp - element.startTime;
		if (localTimelineTime <= 0 || localTimelineTime >= timelineDuration) {
			continue;
		}
		const { sourceTime } = mapMediaTimelineTime({
			element,
			localTimelineTime,
			fps,
		});
		frames.add(Math.round(sourceTime * fps));
	}
	return [...frames].sort((left, right) => left - right);
}

/**
 * Builds a speed curve that lands `shape.beatRate` on every beat and coasts at
 * `shape.baseRate` in between. Beats closer together than the shape's window are
 * dropped so the curve keeps a readable shape at high tempo.
 */
export function createBeatSyncKeyframes({
	beatFrames,
	durationInFrames,
	fps = 30,
	shape,
}: {
	beatFrames: readonly number[];
	durationInFrames: number;
	fps?: number;
	shape: BeatSyncShape;
}): MediaPropertyKeyframe[] {
	const safeDuration = Math.max(1, durationInFrames);
	const windowFrames = Math.max(1, Math.round(shape.windowSeconds * fps));
	const baseRate = clampRate({ rate: shape.baseRate });
	const beatRate = clampRate({ rate: shape.beatRate });

	const point = ({
		frame,
		value,
	}: {
		frame: number;
		value: number;
	}): MediaPropertyKeyframe => ({
		id: generateUUID(),
		frame: Math.min(safeDuration, Math.max(0, Math.round(frame))),
		value,
		easing: "easeInOut",
	});

	const keyframes: MediaPropertyKeyframe[] = [
		point({ frame: 0, value: baseRate }),
	];
	let lastFrame = 0;
	for (const beatFrame of beatFrames) {
		if (beatFrame <= windowFrames || beatFrame >= safeDuration - windowFrames) {
			continue;
		}
		// Needs room for the ramp down, the beat itself, and the ramp back up.
		if (beatFrame - lastFrame < windowFrames * 2) continue;
		keyframes.push(point({ frame: beatFrame - windowFrames, value: baseRate }));
		keyframes.push(point({ frame: beatFrame, value: beatRate }));
		keyframes.push(point({ frame: beatFrame + windowFrames, value: baseRate }));
		lastFrame = beatFrame + windowFrames;
	}
	keyframes.push(point({ frame: safeDuration, value: baseRate }));
	return keyframes;
}
