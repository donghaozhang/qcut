import type { MediaElement, TimelineElement } from "@/types/timeline";
import {
	calculateRippleTrim,
	calculateRollEdit,
	calculateSlideEdit,
	calculateSlipEdit,
	type MediaPrecisionUpdate,
} from "@/lib/timeline/precision-edit";
import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import { getTimelineElementDuration } from "@/lib/timeline";
import {
	deriveTimelineLinks,
	resolveRippleDomain,
} from "@qcut/editor-core/timeline";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

function sortedMediaElements({
	elements,
}: {
	elements: TimelineElement[];
}): MediaElement[] {
	return elements
		.filter(
			(candidate): candidate is MediaElement => candidate.type === "media"
		)
		.sort((left, right) => left.startTime - right.startTime);
}

function applyElementUpdates({
	elements,
	updates,
}: {
	elements: TimelineElement[];
	updates: MediaPrecisionUpdate[];
}) {
	const updatesById = new Map(updates.map((update) => [update.id, update]));
	return elements.map((element) => {
		const update = updatesById.get(element.id);
		return update ? { ...element, ...update } : element;
	});
}

export function createPrecisionEditOps(
	get: StoreGet,
	_set: StoreSet,
	deps: OperationDeps
) {
	return {
		slipElement: ({
			elementId,
			pushHistory = true,
			timelineDelta,
			trackId,
		}: {
			elementId: string;
			pushHistory?: boolean;
			timelineDelta: number;
			trackId: string;
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			const element = track?.elements.find(
				(candidate) => candidate.id === elementId
			);
			if (!track || track.locked || element?.type !== "media") return 0;
			const result = calculateSlipEdit({ element, timelineDelta });
			if (!result) return 0;
			if (pushHistory) get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								elements: applyElementUpdates({
									elements: candidate.elements,
									updates: result.updates,
								}),
							}
						: candidate
				)
			);
			return result.appliedTimelineDelta;
		},

		slideElement: ({
			elementId,
			pushHistory = true,
			timelineDelta,
			trackId,
		}: {
			elementId: string;
			pushHistory?: boolean;
			timelineDelta: number;
			trackId: string;
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			const element = track?.elements.find(
				(candidate) => candidate.id === elementId
			);
			if (!track || track.locked || element?.type !== "media") return 0;

			const mediaElements = sortedMediaElements({ elements: track.elements });
			const index = mediaElements.findIndex(
				(candidate) => candidate.id === elementId
			);
			const leftNeighbor = mediaElements[index - 1];
			const rightNeighbor = mediaElements[index + 1];
			if (!leftNeighbor || !rightNeighbor) return 0;

			const result = calculateSlideEdit({
				element,
				leftNeighbor,
				rightNeighbor,
				timelineDelta,
			});
			if (!result) return 0;
			if (pushHistory) get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								elements: applyElementUpdates({
									elements: candidate.elements,
									updates: result.updates,
								}),
							}
						: candidate
				)
			);
			return result.appliedTimelineDelta;
		},

		rippleTrimElement: ({
			durationDelta,
			edge,
			elementId,
			pushHistory = true,
			trackId,
		}: {
			durationDelta: number;
			edge: "left" | "right";
			elementId: string;
			pushHistory?: boolean;
			trackId: string;
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			const element = track?.elements.find(
				(candidate) => candidate.id === elementId
			);
			if (!track || track.locked || element?.type !== "media") return 0;

			// Downstream shifting is a ripple, so it follows the ripple domain
			// (QTL-003) and the linked-ripple toggle (QTL-005).
			const rippleDomain = resolveRippleDomain({
				tracks: get()._tracks,
				seedTrackIds: [trackId],
				links: get().linkedRippleEnabled
					? deriveTimelineLinks({ tracks: get()._tracks })
					: [],
			});
			if (rippleDomain.lockedDependencyTrackIds.length > 0) {
				handleError(
					new Error("Cannot ripple: a linked dependency track is locked"),
					{
						operation: "Ripple Trim Element",
						category: ErrorCategory.VALIDATION,
						severity: ErrorSeverity.MEDIUM,
						metadata: {
							lockedTrackIds: rippleDomain.lockedDependencyTrackIds,
						},
					}
				);
				return 0;
			}

			const result = calculateRippleTrim({ durationDelta, edge, element });
			if (!result) return 0;

			const oldEndTime =
				element.startTime + getTimelineElementDuration({ element });
			if (pushHistory) get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) => {
					const isTargetTrack = candidate.id === trackId;
					const inDomain = rippleDomain.domainTrackIds.has(candidate.id);
					if (!isTargetTrack && !inDomain) return candidate;

					let elements = isTargetTrack
						? applyElementUpdates({
								elements: candidate.elements,
								updates: result.updates,
							})
						: candidate.elements;
					if (inDomain) {
						elements = elements.map((current) =>
							current.id !== elementId && current.startTime >= oldEndTime
								? {
										...current,
										startTime: Math.max(
											0,
											current.startTime + result.appliedDurationDelta
										),
									}
								: current
						);
					}
					return { ...candidate, elements };
				})
			);
			return result.appliedDurationDelta;
		},

		rollEdit: ({
			fromElementId,
			pushHistory = true,
			timelineDelta,
			toElementId,
			trackId,
		}: {
			fromElementId: string;
			pushHistory?: boolean;
			timelineDelta: number;
			toElementId: string;
			trackId: string;
		}) => {
			const track = get()._tracks.find((candidate) => candidate.id === trackId);
			if (!track || track.locked) return 0;
			const fromElement = track.elements.find(
				(candidate) => candidate.id === fromElementId
			);
			const toElement = track.elements.find(
				(candidate) => candidate.id === toElementId
			);
			if (fromElement?.type !== "media" || toElement?.type !== "media") {
				return 0;
			}
			const result = calculateRollEdit({
				fromElement: fromElement as MediaElement,
				timelineDelta,
				toElement: toElement as MediaElement,
			});
			if (!result) return 0;
			if (pushHistory) get().pushHistory();
			deps.updateTracksAndSave(
				get()._tracks.map((candidate) =>
					candidate.id === trackId
						? {
								...candidate,
								elements: applyElementUpdates({
									elements: candidate.elements,
									updates: result.updates,
								}),
							}
						: candidate
				)
			);
			return result.appliedTimelineDelta;
		},
	};
}
