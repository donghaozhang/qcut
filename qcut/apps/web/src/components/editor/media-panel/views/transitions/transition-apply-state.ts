import type { SelectedElement } from "@/stores/timeline/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { resolveClipTransition } from "@/types/timeline";
import { getTimelineElementDuration } from "@/lib/timeline";

export type TransitionApplyState =
	| {
			status: "ready";
			trackId: string;
			fromElementId: string;
			toElementId: string;
			fromMediaId: string;
			toMediaId: string;
			maxDuration: number;
			message: string;
	  }
	| {
			status: "disabled";
			message: string;
	  };

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
	const resolved = resolveClipTransition({
		track: from.track,
		transition: {
			id: "transition-selection-probe",
			fromElementId: from.element.id,
			toElementId: to.element.id,
			presetId: "dissolve",
			type: "dissolve",
			duration: 1,
			easing: "easeInOut",
		},
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element }),
	});

	if (!resolved) {
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
		fromMediaId: from.element.mediaId,
		toMediaId: to.element.mediaId,
		maxDuration: resolved.maxDuration,
		message: `Ready between ${from.element.name} and ${to.element.name}.`,
	};
}
