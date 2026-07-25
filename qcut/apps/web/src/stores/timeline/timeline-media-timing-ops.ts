import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import type { MediaElement } from "@/types/timeline";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

const DURATION_EPSILON = 1e-7;

export type MediaTimingStoreUpdates = Partial<
	Pick<
		MediaElement,
		| "playbackRate"
		| "speedKeyframes"
		| "reverse"
		| "freezeFrameTime"
		| "freezeFrameDuration"
	>
>;

export function createMediaTimingOps(
	get: StoreGet,
	_set: StoreSet,
	deps: OperationDeps
) {
	const { updateTracksAndSave } = deps;

	return {
		updateMediaTiming: (
			trackId: string,
			elementId: string,
			updates: MediaTimingStoreUpdates,
			pushHistory = true
		) => {
			const tracks = get()._tracks;
			const track = tracks.find((candidate) => candidate.id === trackId);
			const element = track?.elements.find(
				(candidate) => candidate.id === elementId
			);
			if (!track || element?.type !== "media") return;

			const updatedElement: MediaElement = { ...element, ...updates };
			const oldDuration = getMediaTimelineDuration(element);
			const nextDuration = getMediaTimelineDuration(updatedElement);
			const durationDelta = nextDuration - oldDuration;
			const oldEndTime = element.startTime + oldDuration;

			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				tracks.map((candidateTrack) => {
					if (candidateTrack.id !== trackId) return candidateTrack;

					return {
						...candidateTrack,
						elements: candidateTrack.elements.map((candidate) => {
							if (candidate.id === elementId) return updatedElement;
							if (
								Math.abs(durationDelta) <= DURATION_EPSILON ||
								candidate.startTime < oldEndTime - DURATION_EPSILON
							) {
								return candidate;
							}
							return {
								...candidate,
								startTime: Math.max(0, candidate.startTime + durationDelta),
							};
						}),
					};
				})
			);
		},
	};
}
