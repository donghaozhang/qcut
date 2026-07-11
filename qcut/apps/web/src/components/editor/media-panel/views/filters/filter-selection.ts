import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { SelectedElement } from "@/stores/timeline/types";

export interface SelectedMediaTarget {
	trackId: string;
	element: MediaElement;
}

export function getSelectedMediaTargets({
	selectedElements,
	tracks,
}: {
	selectedElements: SelectedElement[];
	tracks: TimelineTrack[];
}): SelectedMediaTarget[] {
	const selectedIds = new Set(
		selectedElements.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
	);
	return tracks.flatMap((track) =>
		track.elements.flatMap((element) =>
			element.type === "media" && selectedIds.has(`${track.id}:${element.id}`)
				? [{ trackId: track.id, element }]
				: []
		)
	);
}
