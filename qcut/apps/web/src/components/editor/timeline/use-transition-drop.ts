import type { DragEvent, RefObject } from "react";
import { toast } from "sonner";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { getTimelineElementDuration } from "@/lib/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	findClosestMediaSeam,
	type ClipTransitionDirection,
	type ClipTransitionType,
	type TimelineTrack,
} from "@/types/timeline";

export const TRANSITION_DRAG_MIME = "application/qcut-transition";

interface TransitionDragPayload {
	kind: "qcut-transition-preset";
	id: string;
	type: ClipTransitionType;
	direction?: ClipTransitionDirection;
	defaultDuration: number;
}

function isTransitionType(value: unknown): value is ClipTransitionType {
	return (
		value === "dissolve" ||
		value === "fade-black" ||
		value === "slide" ||
		value === "wipe"
	);
}

function isDirection(value: unknown): value is ClipTransitionDirection {
	return (
		value === "left" ||
		value === "right" ||
		value === "up" ||
		value === "down"
	);
}

function parseTransitionPayload({
	data,
}: {
	data: string;
}): TransitionDragPayload | null {
	try {
		const parsed: unknown = JSON.parse(data);
		if (!parsed || typeof parsed !== "object") return null;
		const candidate = parsed as Record<string, unknown>;
		if (
			candidate.kind !== "qcut-transition-preset" ||
			typeof candidate.id !== "string" ||
			!isTransitionType(candidate.type) ||
			typeof candidate.defaultDuration !== "number" ||
			!Number.isFinite(candidate.defaultDuration) ||
			(candidate.direction !== undefined && !isDirection(candidate.direction))
		) {
			return null;
		}

		return {
			kind: "qcut-transition-preset",
			id: candidate.id,
			type: candidate.type,
			direction: candidate.direction,
			defaultDuration: candidate.defaultDuration,
		};
	} catch {
		return null;
	}
}

export function isTransitionDrag({
	event,
}: {
	event: DragEvent<HTMLDivElement>;
}): boolean {
	return Array.from(event.dataTransfer.types).includes(TRANSITION_DRAG_MIME);
}

export function useTransitionDrop({
	track,
	zoomLevel,
	timelineRef,
}: {
	track: TimelineTrack;
	zoomLevel: number;
	timelineRef: RefObject<HTMLDivElement | null>;
}) {
	const addTransition = useTimelineStore((state) => state.addTransition);
	const handleTransitionDragOver = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};
	const handleTransitionDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const payload = parseTransitionPayload({
			data: event.dataTransfer.getData(TRANSITION_DRAG_MIME),
		});
		const timeline = timelineRef.current;
		if (!payload || !timeline || track.type !== "media") {
			toast.error("Drop this transition on a media cut point.");
			return;
		}

		const bounds = timeline.getBoundingClientRect();
		const pixelsPerSecond =
			TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
		const time = Math.max(0, (event.clientX - bounds.left) / pixelsPerSecond);
		const seam = findClosestMediaSeam({
			track,
			time,
			maxDistance: Math.max(0.15, 18 / pixelsPerSecond),
			getElementDuration: ({ element }) =>
				getTimelineElementDuration({ element }),
		});
		if (!seam) {
			toast.error("Drop closer to the join between two touching clips.");
			return;
		}

		const transitionId = addTransition({
			trackId: track.id,
			fromElementId: seam.fromElement.id,
			toElementId: seam.toElement.id,
			presetId: payload.id,
			type: payload.type,
			direction: payload.direction,
			duration: payload.defaultDuration,
			easing: "easeInOut",
		});
		if (!transitionId) {
			toast.error("This cut does not have enough room for a transition.");
			return;
		}
		toast.success("Transition applied.");
	};

	return { handleTransitionDragOver, handleTransitionDrop };
}
