import { getTimelineElementDuration } from "@/lib/timeline";
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
	const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
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
			const fromMedia = mediaById.get(resolved.fromElement.mediaId);
			const toMedia = mediaById.get(resolved.toElement.mediaId);
			const fromIsVisualMedia =
				fromMedia?.type === "video" || fromMedia?.type === "image";
			const toIsVisualMedia =
				toMedia?.type === "video" || toMedia?.type === "image";
			if (!fromIsVisualMedia || !toIsVisualMedia) {
				throw new Error(
					`Transition ${transition.id} requires two visual media clips.`
				);
			}

			transitions.push({
				id: transition.id,
				trackId: track.id,
				fromElementId: transition.fromElementId,
				toElementId: transition.toElementId,
				presetId: transition.presetId,
				type: transition.type,
				direction: transition.direction,
				easing: transition.easing,
				duration: resolved.transition.duration,
				tuning: transition.tuning,
			});
		}
	}

	return transitions;
}
