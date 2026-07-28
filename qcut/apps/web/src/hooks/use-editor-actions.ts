"use client";

import { useEffect } from "react";
import { useActionHandler } from "@/constants/actions";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "sonner";
import { getTimelineElementEndTime } from "@/lib/timeline";
import {
	createDuplicatedTimelineElement,
	createPastedTimelineElement,
	useTimelineClipboardStore,
} from "@/stores/timeline/timeline-clipboard-store";

/**
 * Custom hook that sets up editor action handlers for keyboard shortcuts and commands
 * Handles playback controls, timeline operations, element manipulation, and project actions
 * @returns void - This hook manages side effects and doesn't return values
 */
export function useEditorActions() {
	const {
		tracks,
		selectedElements,
		clearSelectedElements,
		setSelectedElements,
		removeElementFromTrack,
		splitElement,
		addElementToTrack,
		snappingEnabled,
		toggleSnapping,
		undo,
		redo,
	} = useTimelineStore();

	const { currentTime, duration, isPlaying, toggle, seek } = usePlaybackStore();
	const { activeProject } = useProjectStore();

	// Playback actions
	useActionHandler(
		"toggle-play",
		() => {
			toggle();
		},
		undefined
	);

	useActionHandler(
		"stop-playback",
		() => {
			if (isPlaying) {
				toggle();
			}
			seek(0);
		},
		undefined
	);

	useActionHandler(
		"seek-forward",
		(args) => {
			const seconds = args?.seconds ?? 1;
			seek(Math.min(duration, currentTime + seconds));
		},
		undefined
	);

	useActionHandler(
		"seek-backward",
		(args) => {
			const seconds = args?.seconds ?? 1;
			seek(Math.max(0, currentTime - seconds));
		},
		undefined
	);

	useActionHandler(
		"frame-step-forward",
		() => {
			const projectFps = activeProject?.fps || 30;
			seek(Math.min(duration, currentTime + 1 / projectFps));
		},
		undefined
	);

	useActionHandler(
		"frame-step-backward",
		() => {
			const projectFps = activeProject?.fps || 30;
			seek(Math.max(0, currentTime - 1 / projectFps));
		},
		undefined
	);

	useActionHandler(
		"jump-forward",
		(args) => {
			const seconds = args?.seconds ?? 5;
			seek(Math.min(duration, currentTime + seconds));
		},
		undefined
	);

	useActionHandler(
		"jump-backward",
		(args) => {
			const seconds = args?.seconds ?? 5;
			seek(Math.max(0, currentTime - seconds));
		},
		undefined
	);

	useActionHandler(
		"goto-start",
		() => {
			seek(0);
		},
		undefined
	);

	useActionHandler(
		"goto-end",
		() => {
			seek(duration);
		},
		undefined
	);

	// Timeline editing actions
	useActionHandler(
		"split-element",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one element to split");
				return;
			}

			const { trackId, elementId } = selectedElements[0];
			const track = tracks.find((t: any) => t.id === trackId);
			const element = track?.elements.find((el: any) => el.id === elementId);

			if (track && element) {
				const effectiveStart = element.startTime;
				const effectiveEnd = getTimelineElementEndTime({ element });

				if (currentTime > effectiveStart && currentTime < effectiveEnd) {
					splitElement(trackId, elementId, currentTime);
				} else {
					toast.error("Playhead must be within selected element");
				}
			}
		},
		undefined
	);

	useActionHandler(
		"delete-selected",
		() => {
			if (selectedElements.length === 0) {
				return;
			}
			selectedElements.forEach(
				({ trackId, elementId }: { trackId: string; elementId: string }) => {
					removeElementFromTrack(trackId, elementId);
				}
			);
			clearSelectedElements();
		},
		undefined
	);

	useActionHandler(
		"select-all",
		() => {
			const allElements = tracks.flatMap((track: any) =>
				track.elements.map((element: any) => ({
					trackId: track.id,
					elementId: element.id,
				}))
			);
			setSelectedElements(allElements);
		},
		undefined
	);

	useActionHandler(
		"duplicate-selected",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one element to duplicate");
				return;
			}

			const { trackId, elementId } = selectedElements[0];
			const track = tracks.find((t: any) => t.id === trackId);
			const element = track?.elements.find((el: any) => el.id === elementId);

			if (track && element) {
				addElementToTrack(
					trackId,
					createDuplicatedTimelineElement({
						entry: {
							trackId,
							trackType: track.type,
							element,
						},
						fps: activeProject?.fps ?? 30,
					})
				);
			}
		},
		undefined
	);

	useActionHandler(
		"copy-selected",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one element to copy");
				return;
			}
			const selection = selectedElements[0];
			const track = tracks.find(
				(candidate) => candidate.id === selection.trackId
			);
			const element = track?.elements.find(
				(candidate) => candidate.id === selection.elementId
			);
			if (!track || !element) return;
			useTimelineClipboardStore.getState().copyClip({
				trackId: track.id,
				trackType: track.type,
				element,
			});
			toast.success("Clip copied");
		},
		undefined
	);

	useActionHandler(
		"cut-selected",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one element to cut");
				return;
			}
			const selection = selectedElements[0];
			const track = tracks.find(
				(candidate) => candidate.id === selection.trackId
			);
			const element = track?.elements.find(
				(candidate) => candidate.id === selection.elementId
			);
			if (!track || !element) return;
			useTimelineClipboardStore.getState().copyClip({
				trackId: track.id,
				trackType: track.type,
				element,
			});
			removeElementFromTrack(track.id, element.id);
			clearSelectedElements();
			toast.success("Clip cut");
		},
		undefined
	);

	useActionHandler(
		"paste-clipboard",
		() => {
			const entry = useTimelineClipboardStore.getState().clip;
			if (!entry) {
				toast.error("Copy or cut a clip first");
				return;
			}
			const sourceTrack = tracks.find(
				(candidate) => candidate.id === entry.trackId
			);
			const targetTrack =
				sourceTrack?.type === entry.trackType
					? sourceTrack
					: tracks.find((candidate) => candidate.type === entry.trackType);
			if (!targetTrack) {
				toast.error("No compatible track is available for this clip");
				return;
			}
			const elementId = addElementToTrack(
				targetTrack.id,
				createPastedTimelineElement({ entry, startTime: currentTime })
			);
			if (!elementId) {
				toast.error("Failed to paste clip");
				return;
			}
			toast.success("Clip pasted at playhead");
		},
		undefined
	);

	useActionHandler(
		"copy-attributes-selected",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one media clip");
				return;
			}
			const selection = selectedElements[0];
			const element = tracks
				.find((track) => track.id === selection.trackId)
				?.elements.find((candidate) => candidate.id === selection.elementId);
			if (element?.type !== "media") {
				toast.error("Attributes can only be copied from media clips");
				return;
			}
			useTimelineClipboardStore.getState().copyMediaAttributes(element);
			toast.success("Clip attributes copied");
		},
		undefined
	);

	useActionHandler(
		"paste-attributes-selected",
		() => {
			if (selectedElements.length !== 1) {
				toast.error("Select exactly one media clip");
				return;
			}
			const attributes = useTimelineClipboardStore.getState().mediaAttributes;
			if (!attributes) {
				toast.error("Copy clip attributes first");
				return;
			}
			const selection = selectedElements[0];
			const element = tracks
				.find((track) => track.id === selection.trackId)
				?.elements.find((candidate) => candidate.id === selection.elementId);
			if (element?.type !== "media") {
				toast.error("Attributes can only be pasted onto media clips");
				return;
			}
			useTimelineStore
				.getState()
				.updateMediaElement(selection.trackId, selection.elementId, attributes);
			toast.success("Clip attributes pasted");
		},
		undefined
	);

	useActionHandler(
		"toggle-snapping",
		() => {
			toggleSnapping();
		},
		undefined
	);

	// History actions
	useActionHandler(
		"undo",
		() => {
			undo();
		},
		undefined
	);

	useActionHandler(
		"redo",
		() => {
			redo();
		},
		undefined
	);
}
