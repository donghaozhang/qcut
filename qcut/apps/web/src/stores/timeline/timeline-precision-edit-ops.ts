import type { MediaElement, TimelineElement } from "@/types/timeline";
import {
	calculateRollEdit,
	calculateSlipEdit,
	type MediaPrecisionUpdate,
} from "@/lib/timeline/precision-edit";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

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
