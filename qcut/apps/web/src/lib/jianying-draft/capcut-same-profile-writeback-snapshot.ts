import type { CapCut81WritebackTimingSnapshot } from "@qcut/editor-core/jianying-draft";
import { getTimelineElementDuration } from "@/lib/timeline";
import type { TimelineTrack } from "@/types/timeline";

export function buildTimelineDurationByElementId({
	fps,
	tracks,
}: {
	fps: number;
	tracks: readonly TimelineTrack[];
}): Record<string, number> {
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error("Timeline snapshot FPS must be a positive finite number.");
	}
	const durations: Record<string, number> = {};
	for (const track of tracks) {
		for (const element of track.elements) {
			durations[element.id] = getTimelineElementDuration({ element, fps });
		}
	}
	return durations;
}

export function createCapCut81WritebackTimingSnapshot({
	fps,
	tracks,
}: {
	fps: number;
	tracks: readonly TimelineTrack[];
}): CapCut81WritebackTimingSnapshot {
	const clonedTracks = structuredClone(tracks) as TimelineTrack[];
	return {
		tracks: clonedTracks,
		timelineDurationByElementId: buildTimelineDurationByElementId({
			fps,
			tracks: clonedTracks,
		}),
	};
}
