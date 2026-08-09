import { getTimelineElementDuration } from "@/lib/timeline";
import {
	getVideoMediaIds,
	isVideoTransitionPair,
} from "@/lib/transitions/video-transition-eligibility";
import type { MediaItem } from "@/stores/media/media-store-types";
import { resolveClipTransition, type TimelineTrack } from "@/types/timeline";
import type { VideoTransitionInput } from "../types";

export function extractVideoTransitions({
	tracks,
	mediaItems,
	fps,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	fps: number;
}): VideoTransitionInput[] {
	const videoMediaIds = getVideoMediaIds({ mediaItems });
	const transitions: VideoTransitionInput[] = [];
	const frameRate = Math.max(1, fps);

	for (const track of tracks) {
		if (track.hidden || track.type !== "media") continue;
		for (const transition of track.transitions ?? []) {
			const duration =
				Math.max(1, Math.round(transition.duration * frameRate)) / frameRate;
			const resolved = resolveClipTransition({
				track,
				transition: { ...transition, duration },
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps: frameRate }),
			});
			if (!resolved) continue;
			if (
				!isVideoTransitionPair({
					fromElement: resolved.fromElement,
					toElement: resolved.toElement,
					videoMediaIds,
				})
			) {
				throw new Error(
					`Transition ${transition.id} requires two video clips.`
				);
			}

			transitions.push({
				id: transition.id,
				trackId: track.id,
				fromElementId: transition.fromElementId,
				toElementId: transition.toElementId,
				presetId: transition.presetId,
				engine: transition.engine,
				packageHash: transition.packageHash,
				type: transition.type,
				direction: transition.direction,
				easing: transition.easing,
				duration: resolved.transition.duration,
				tuning: transition.tuning,
				maskShape: transition.maskShape,
			});
		}
	}

	return transitions;
}
