import type { SelectedElement } from "@/stores/timeline/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

export type TransitionApplyState =
	| {
			status: "ready";
			trackId: string;
			fromElementId: string;
			toElementId: string;
			message: string;
	  }
	| {
			status: "disabled";
			message: string;
	  };

function getElementEndTime({ element }: { element: MediaElement }): number {
	return element.startTime + element.duration - element.trimEnd;
}

function findSelectedMediaElements({
	selectedElements,
	tracks,
}: {
	selectedElements: SelectedElement[];
	tracks: TimelineTrack[];
}): Array<{ track: TimelineTrack; element: MediaElement }> {
	const elements: Array<{ track: TimelineTrack; element: MediaElement }> = [];

	for (const selected of selectedElements) {
		const track = tracks.find((item) => item.id === selected.trackId);
		const element = track?.elements.find(
			(item) => item.id === selected.elementId
		);

		if (!track || !element || element.type !== "media") {
			return [];
		}

		elements.push({ track, element });
	}

	return elements;
}

export function getTransitionApplyState({
	selectedElements,
	tracks,
}: {
	selectedElements: SelectedElement[];
	tracks: TimelineTrack[];
}): TransitionApplyState {
	if (selectedElements.length !== 2) {
		return {
			status: "disabled",
			message: "Select two adjacent media clips to prepare a transition.",
		};
	}

	const selectedMediaElements = findSelectedMediaElements({
		selectedElements,
		tracks,
	});

	if (selectedMediaElements.length !== 2) {
		return {
			status: "disabled",
			message: "Transitions can be prepared only between media clips.",
		};
	}

	const [first, second] = selectedMediaElements;
	if (first.track.id !== second.track.id) {
		return {
			status: "disabled",
			message: "Select two adjacent clips on the same media track.",
		};
	}

	const sorted = [...selectedMediaElements].sort(
		(a, b) => a.element.startTime - b.element.startTime
	);
	const [from, to] = sorted;
	const seamGap = Math.abs(
		getElementEndTime({ element: from.element }) - to.element.startTime
	);

	if (seamGap > 0.03) {
		return {
			status: "disabled",
			message: "The selected clips need to touch at a cut point.",
		};
	}

	return {
		status: "ready",
		trackId: from.track.id,
		fromElementId: from.element.id,
		toElementId: to.element.id,
		message: `Ready between ${from.element.name} and ${to.element.name}.`,
	};
}
