import type { BeatDetectionResult } from "@qcut/editor-core";
import { mapMediaSourceTime } from "@/lib/video/video-timing";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

export interface TimelineBeat {
	elementId: string;
	isDownbeat: boolean;
	strength: number;
	timestamp: number;
}

export function mapMediaBeatToTimeline({
	element,
	sourceTimestamp,
	fps = 30,
}: {
	element: MediaElement;
	sourceTimestamp: number;
	fps?: number;
}): number | null {
	const sourceStart = element.trimStart;
	const sourceEnd = element.duration - element.trimEnd;
	if (sourceTimestamp < sourceStart || sourceTimestamp > sourceEnd) return null;
	return (
		element.startTime +
		mapMediaSourceTime({
			element,
			sourceTime: sourceTimestamp,
			fps,
		})
	);
}

export function collectTimelineBeats({
	beatCache,
	fps = 30,
	tracks,
}: {
	beatCache: ReadonlyMap<string, BeatDetectionResult>;
	fps?: number;
	tracks: readonly TimelineTrack[];
}): TimelineBeat[] {
	const timelineBeats: TimelineBeat[] = [];
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type !== "media") continue;
			const result = beatCache.get(element.id);
			if (!result) continue;

			for (const beat of result.beats) {
				const timestamp = mapMediaBeatToTimeline({
					element,
					sourceTimestamp: beat.timestamp,
					fps,
				});
				if (timestamp === null) continue;
				timelineBeats.push({
					elementId: element.id,
					isDownbeat: beat.isDownbeat,
					strength: beat.strength,
					timestamp,
				});
			}
		}
	}
	return timelineBeats.sort((left, right) => left.timestamp - right.timestamp);
}
