import type { SelectedElement } from "@/stores/timeline/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { resolveClipTransition } from "@/types/timeline";
import { getTimelineElementDuration } from "@/lib/timeline";
import { isVideoTransitionPair } from "@/lib/transitions/video-transition-eligibility";

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
	videoMediaIds,
}: {
	selectedElements: SelectedElement[];
	tracks: TimelineTrack[];
	videoMediaIds: ReadonlySet<string>;
}): TransitionApplyState {
	if (selectedElements.length !== 2) {
		return {
			status: "disabled",
			message: "请选择两段相邻的视频片段来添加转场。",
		};
	}

	const selectedMediaElements = findSelectedMediaElements({
		selectedElements,
		tracks,
	});

	if (selectedMediaElements.length !== 2) {
		return {
			status: "disabled",
			message: "转场只能添加在两段视频之间。",
		};
	}

	const [first, second] = selectedMediaElements;
	if (first.track.id !== second.track.id) {
		return {
			status: "disabled",
			message: "请选择同一视频轨道上的两段相邻片段。",
		};
	}

	const sorted = [...selectedMediaElements].sort(
		(a, b) => a.element.startTime - b.element.startTime
	);
	const [from, to] = sorted;
	if (
		!isVideoTransitionPair({
			fromElement: from.element,
			toElement: to.element,
			videoMediaIds,
		})
	) {
		return {
			status: "disabled",
			message: "转场需要两段视频片段。",
		};
	}
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
			message: "所选片段需要在同一个剪辑点首尾相接。",
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
		message: `可在 ${from.element.name} 与 ${to.element.name} 之间添加转场。`,
	};
}
