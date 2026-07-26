import { useEffect } from "react";
import {
	bindAction,
	type ActionWithNoArgs,
	unbindAction,
} from "@/constants/actions";
import {
	dispatchMediaKeyframeCommand,
	dispatchTimelineZoom,
} from "@/lib/editor-shortcut-events";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, TimelineElement } from "@/types/timeline";

interface SelectedElement {
	element: TimelineElement;
	elementId: string;
	trackId: string;
}

function getSingleSelection(): SelectedElement | null {
	const { selectedElements, tracks } = useTimelineStore.getState();
	if (selectedElements.length !== 1) return null;
	const selection = selectedElements[0];
	const element = tracks
		.find((track) => track.id === selection.trackId)
		?.elements.find((candidate) => candidate.id === selection.elementId);
	return element ? { ...selection, element } : null;
}

function getSelectedMedia():
	| (SelectedElement & { element: MediaElement })
	| null {
	const selection = getSingleSelection();
	return selection?.element.type === "media"
		? { ...selection, element: selection.element }
		: null;
}

function trimSelection({ side }: { side: "start" | "end" }) {
	const selection = getSingleSelection();
	if (!selection) return;
	const currentTime = usePlaybackStore.getState().currentTime;
	const endTime = getTimelineElementEndTime({ element: selection.element });
	if (currentTime <= selection.element.startTime || currentTime >= endTime) {
		return;
	}
	const timeline = useTimelineStore.getState();
	if (side === "start") {
		timeline.splitAndKeepRight(
			selection.trackId,
			selection.elementId,
			currentTime
		);
		return;
	}
	timeline.splitAndKeepLeft(
		selection.trackId,
		selection.elementId,
		currentTime
	);
}

function toggleReverse() {
	const selection = getSelectedMedia();
	if (!selection) return;
	useTimelineStore
		.getState()
		.updateMediaTiming(selection.trackId, selection.elementId, {
			reverse: !selection.element.reverse,
		});
}

function toggleMirror() {
	const selection = getSelectedMedia();
	if (!selection) return;
	useTimelineStore
		.getState()
		.updateMediaElement(selection.trackId, selection.elementId, {
			flipHorizontal: !selection.element.flipHorizontal,
		});
}

function rotateSelection() {
	const selection = getSingleSelection();
	if (!selection) return;
	const rotation = ((selection.element.rotation ?? 0) + 90) % 360;
	useTimelineStore
		.getState()
		.updateElementRotation(selection.elementId, rotation);
}

function openCropControls() {
	const selection = getSelectedMedia();
	if (!selection) return;
	window.dispatchEvent(
		new CustomEvent("qcut:open-media-properties-tab", {
			detail: {
				elementId: selection.elementId,
				tab: "basic",
				scrollTo: "crop",
			},
		})
	);
}

function requestKeyframeCommand({
	command,
}: {
	command: "add" | "ease-in" | "ease-out" | "linear" | "edit-value";
}) {
	const selection = getSelectedMedia();
	if (!selection) return;
	dispatchMediaKeyframeCommand({
		elementId: selection.elementId,
		command,
	});
}

export function useProfessionalEditorActions() {
	useEffect(() => {
		const handlers: Partial<Record<ActionWithNoArgs, () => void>> = {
			"trim-start-to-playhead": () => trimSelection({ side: "start" }),
			"trim-end-to-playhead": () => trimSelection({ side: "end" }),
			"zoom-timeline-in": () => dispatchTimelineZoom({ direction: "in" }),
			"zoom-timeline-out": () => dispatchTimelineZoom({ direction: "out" }),
			"add-keyframe": () => requestKeyframeCommand({ command: "add" }),
			"keyframe-ease-in": () => requestKeyframeCommand({ command: "ease-in" }),
			"keyframe-ease-out": () =>
				requestKeyframeCommand({ command: "ease-out" }),
			"keyframe-linear": () => requestKeyframeCommand({ command: "linear" }),
			"edit-keyframe-value": () =>
				requestKeyframeCommand({ command: "edit-value" }),
			"reverse-selected": toggleReverse,
			"mirror-selected": toggleMirror,
			"rotate-selected": rotateSelection,
			"crop-selected": openCropControls,
		};
		const entries = Object.entries(handlers) as Array<
			[ActionWithNoArgs, () => void]
		>;
		for (const [action, handler] of entries) bindAction(action, handler);
		return () => {
			for (const [action, handler] of entries) unbindAction(action, handler);
		};
	}, []);
}
