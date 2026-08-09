import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import type { MediaElement } from "@/types/timeline";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";
import { blockedByTrackLock } from "./timeline-lock-guard";

const DURATION_EPSILON = 1e-7;

export type MediaTimingStoreUpdates = Partial<
	Pick<
		MediaElement,
		| "playbackRate"
		| "speedKeyframes"
		| "reverse"
		| "freezeFrameTime"
		| "freezeFrameDuration"
		| "preservePitch"
		| "frameInterpolation"
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

			// Timing changes propagate to linked audio tracks (same groupId), so
			// a locked linked track must fail the whole command to avoid desync.
			const linkedTrackIds = element.groupId
				? tracks
						.filter(
							(candidateTrack) =>
								candidateTrack.type === "audio" &&
								candidateTrack.elements.some(
									(candidate) =>
										candidate.type === "media" &&
										candidate.groupId === element.groupId &&
										candidate.mediaId === element.mediaId
								)
						)
						.map((candidateTrack) => candidateTrack.id)
				: [];
			if (
				blockedByTrackLock({
					tracks,
					operation: "Update Media Timing",
					trackIds: [trackId, ...linkedTrackIds],
				})
			) {
				return;
			}

			const updatedElement: MediaElement = { ...element, ...updates };

			if (pushHistory) get().pushHistory();
			updateTracksAndSave(
				tracks.map((candidateTrack) => {
					const timingTarget =
						candidateTrack.id === trackId
							? element
							: candidateTrack.type === "audio" && element.groupId
								? candidateTrack.elements.find(
										(candidate) =>
											candidate.type === "media" &&
											candidate.groupId === element.groupId &&
											candidate.mediaId === element.mediaId
									)
								: undefined;
					if (timingTarget?.type !== "media") return candidateTrack;

					const updatedTimingTarget: MediaElement =
						timingTarget.id === elementId
							? updatedElement
							: { ...timingTarget, ...updates };
					const oldDuration = getMediaTimelineDuration(timingTarget);
					const nextDuration = getMediaTimelineDuration(updatedTimingTarget);
					const durationDelta = nextDuration - oldDuration;
					const oldEndTime = timingTarget.startTime + oldDuration;

					return {
						...candidateTrack,
						elements: candidateTrack.elements.map((candidate) => {
							if (candidate.id === timingTarget.id) {
								return updatedTimingTarget;
							}
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
