import type { BeatDetectionResult } from "@qcut/editor-core";
import { getTimelineElementDuration } from "@/lib/timeline";
import type { TimelineTrack } from "@/types/timeline";

export interface TimelineBeat {
	elementId: string;
	isDownbeat: boolean;
	strength: number;
	timestamp: number;
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

			const duration = getTimelineElementDuration({ element, fps });
			const sourceStart = element.trimStart;
			const sourceEnd = sourceStart + duration;
			for (const beat of result.beats) {
				if (beat.timestamp < sourceStart || beat.timestamp > sourceEnd)
					continue;
				timelineBeats.push({
					elementId: element.id,
					isDownbeat: beat.isDownbeat,
					strength: beat.strength,
					timestamp: element.startTime + beat.timestamp - sourceStart,
				});
			}
		}
	}
	return timelineBeats.sort((left, right) => left.timestamp - right.timestamp);
}
