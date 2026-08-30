import type { TimelineTrack } from "@/types/timeline";
import type { TimelineColorLabel } from "@/lib/timeline/timeline-color-labels";
import { blockedByTrackLock } from "./timeline-lock-guard";
import type { SelectedElement } from "./types";
import type {
	OperationDeps,
	StoreGet,
	StoreSet,
} from "./timeline-store-operations";

function selectionKey({ trackId, elementId }: SelectedElement): string {
	return `${trackId}:${elementId}`;
}

export function applyTimelineColorLabel({
	tracks,
	elements,
	colorLabel,
}: {
	tracks: TimelineTrack[];
	elements: SelectedElement[];
	colorLabel?: TimelineColorLabel;
}): { tracks: TimelineTrack[]; updatedCount: number } {
	const selectedKeys = new Set(elements.map(selectionKey));
	let updatedCount = 0;

	const nextTracks = tracks.map((track) => {
		let trackChanged = false;
		const nextElements = track.elements.map((element) => {
			if (
				!selectedKeys.has(
					selectionKey({ trackId: track.id, elementId: element.id })
				)
			) {
				return element;
			}
			if (element.colorLabel === colorLabel) return element;

			trackChanged = true;
			updatedCount += 1;
			return { ...element, colorLabel };
		});
		return trackChanged ? { ...track, elements: nextElements } : track;
	});

	return { tracks: nextTracks, updatedCount };
}

export function findTimelineElementsByColorLabel({
	tracks,
	colorLabel,
}: {
	tracks: TimelineTrack[];
	colorLabel: TimelineColorLabel;
}): SelectedElement[] {
	return tracks.flatMap((track) =>
		track.elements
			.filter((element) => element.colorLabel === colorLabel)
			.map((element) => ({ trackId: track.id, elementId: element.id }))
	);
}

export function createTimelineColorLabelOperations({
	get,
	set,
	deps,
}: {
	get: StoreGet;
	set: StoreSet;
	deps: OperationDeps;
}) {
	return {
		setColorLabelForElements: ({
			elements,
			colorLabel,
			pushHistory = true,
		}: {
			elements: SelectedElement[];
			colorLabel?: TimelineColorLabel;
			pushHistory?: boolean;
		}): number => {
			if (elements.length === 0) return 0;
			if (
				blockedByTrackLock({
					tracks: get()._tracks,
					operation: "Set Clip Color Label",
					trackIds: new Set(elements.map(({ trackId }) => trackId)),
				})
			) {
				return 0;
			}

			const result = applyTimelineColorLabel({
				tracks: get()._tracks,
				elements,
				colorLabel,
			});
			if (result.updatedCount === 0) return 0;

			if (pushHistory) get().pushHistory();
			deps.updateTracksAndSave(result.tracks);
			return result.updatedCount;
		},

		selectElementsByColorLabel: ({
			colorLabel,
		}: {
			colorLabel: TimelineColorLabel;
		}): number => {
			const selectedElements = findTimelineElementsByColorLabel({
				tracks: get()._tracks,
				colorLabel,
			});
			set({ selectedElements, selectedTransition: null });
			return selectedElements.length;
		},
	};
}
