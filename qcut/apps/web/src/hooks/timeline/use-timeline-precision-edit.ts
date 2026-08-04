import { useEffect, useMemo, useRef, useState } from "react";
import type {
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { isPrecisionMediaTimingSupported } from "@/lib/timeline/precision-edit";
import { useTimelineEditModeStore } from "@/stores/timeline/timeline-edit-mode-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

const SEAM_TOLERANCE_SECONDS = 0.001;

interface RollPair {
	fromElementId: string;
	toElementId: string;
}

type PrecisionInteraction =
	| {
			kind: "slip";
			elementId: string;
			historyPushed: boolean;
			lastClientX: number;
			trackId: string;
	  }
	| {
			kind: "slide";
			elementId: string;
			historyPushed: boolean;
			lastClientX: number;
			trackId: string;
	  }
	| ({
			kind: "roll";
			historyPushed: boolean;
			lastClientX: number;
			trackId: string;
	  } & RollPair);

function findRollPair({
	element,
	side,
	track,
}: {
	element: MediaElement;
	side: "left" | "right";
	track: TimelineTrack;
}): RollPair | null {
	const elements = track.elements.filter(
		(candidate): candidate is MediaElement => candidate.type === "media"
	);
	elements.sort((left, right) => left.startTime - right.startTime);
	const index = elements.findIndex((candidate) => candidate.id === element.id);
	const fromElement = side === "left" ? elements[index - 1] : elements[index];
	const toElement = side === "left" ? elements[index] : elements[index + 1];
	if (!fromElement || !toElement) return null;
	if (
		Math.abs(
			getTimelineElementEndTime({ element: fromElement }) - toElement.startTime
		) > SEAM_TOLERANCE_SECONDS
	) {
		return null;
	}
	if (
		!isPrecisionMediaTimingSupported({ element: fromElement }) ||
		!isPrecisionMediaTimingSupported({ element: toElement })
	) {
		return null;
	}
	return { fromElementId: fromElement.id, toElementId: toElement.id };
}

export function useTimelinePrecisionEdit({
	element,
	mediaSupportsSlip,
	projectFps,
	track,
	zoomLevel,
}: {
	element: MediaElement | null;
	mediaSupportsSlip: boolean;
	projectFps: number;
	track: TimelineTrack;
	zoomLevel: number;
}) {
	const editMode = useTimelineEditModeStore((state) => state.editMode);
	const rollEdit = useTimelineStore((state) => state.rollEdit);
	const selectElement = useTimelineStore((state) => state.selectElement);
	const slipElement = useTimelineStore((state) => state.slipElement);
	const slideElement = useTimelineStore((state) => state.slideElement);
	const undo = useTimelineStore((state) => state.undo);
	const interactionRef = useRef<PrecisionInteraction | null>(null);
	const [isPrecisionEditing, setIsPrecisionEditing] = useState(false);
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const rollPairs = useMemo(
		() => ({
			left: element ? findRollPair({ element, side: "left", track }) : null,
			right: element ? findRollPair({ element, side: "right", track }) : null,
		}),
		[element, track]
	);
	const canSlip = Boolean(
		element &&
			mediaSupportsSlip &&
			!track.locked &&
			isPrecisionMediaTimingSupported({ element }) &&
			(element.trimStart > 0 || element.trimEnd > 0)
	);
	// A slide needs seam-adjacent neighbors on both sides (QTL-007).
	const canSlide = Boolean(
		element &&
			!track.locked &&
			isPrecisionMediaTimingSupported({ element }) &&
			rollPairs.left &&
			rollPairs.right
	);

	useEffect(() => {
		if (!isPrecisionEditing) return;
		const finish = () => {
			interactionRef.current = null;
			setIsPrecisionEditing(false);
		};
		const cancel = () => {
			if (interactionRef.current?.historyPushed) undo();
			finish();
		};
		const handlePointerMove = (event: PointerEvent) => {
			const interaction = interactionRef.current;
			if (!interaction) return;
			const timelineDelta =
				(event.clientX - interaction.lastClientX) / pixelsPerSecond;
			if (Math.abs(timelineDelta) < Number.EPSILON) return;
			const pushHistory = !interaction.historyPushed;
			const appliedTimelineDelta =
				interaction.kind === "slip"
					? slipElement({
							elementId: interaction.elementId,
							pushHistory,
							timelineDelta,
							trackId: interaction.trackId,
						})
					: interaction.kind === "slide"
						? slideElement({
								elementId: interaction.elementId,
								pushHistory,
								timelineDelta,
								trackId: interaction.trackId,
							})
						: rollEdit({
								fromElementId: interaction.fromElementId,
								pushHistory,
								timelineDelta,
								toElementId: interaction.toElementId,
								trackId: interaction.trackId,
							});
			if (Math.abs(appliedTimelineDelta) < Number.EPSILON) return;
			interaction.historyPushed = true;
			interaction.lastClientX += appliedTimelineDelta * pixelsPerSecond;
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			cancel();
		};
		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", finish);
		document.addEventListener("pointercancel", cancel);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", finish);
			document.removeEventListener("pointercancel", cancel);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		isPrecisionEditing,
		pixelsPerSecond,
		rollEdit,
		slideElement,
		slipElement,
		undo,
	]);

	const startInteraction = ({
		event,
		interaction,
	}: {
		event: ReactPointerEvent<HTMLElement>;
		interaction: PrecisionInteraction;
	}) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture?.(event.pointerId);
		interactionRef.current = interaction;
		setIsPrecisionEditing(true);
	};

	const handleSlipPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
		if (editMode !== "slip" || !element || !canSlip) return;
		selectElement(track.id, element.id, false);
		startInteraction({
			event,
			interaction: {
				elementId: element.id,
				historyPushed: false,
				kind: "slip",
				lastClientX: event.clientX,
				trackId: track.id,
			},
		});
	};

	const handleSlidePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
		if (editMode !== "slide" || !element || !canSlide) return;
		selectElement(track.id, element.id, false);
		startInteraction({
			event,
			interaction: {
				elementId: element.id,
				historyPushed: false,
				kind: "slide",
				lastClientX: event.clientX,
				trackId: track.id,
			},
		});
	};

	const handleRollPointerDown = ({
		event,
		side,
	}: {
		event: ReactPointerEvent<HTMLElement>;
		side: "left" | "right";
	}) => {
		const pair = rollPairs[side];
		if (editMode !== "roll" || !element || !pair || track.locked) return;
		selectElement(track.id, element.id, false);
		startInteraction({
			event,
			interaction: {
				...pair,
				historyPushed: false,
				kind: "roll",
				lastClientX: event.clientX,
				trackId: track.id,
			},
		});
	};

	const handleRollKeyDown = ({
		event,
		side,
	}: {
		event: ReactKeyboardEvent<HTMLElement>;
		side: "left" | "right";
	}) => {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
		const pair = rollPairs[side];
		if (editMode !== "roll" || !pair) return;
		event.preventDefault();
		event.stopPropagation();
		const frameStep = event.shiftKey ? 10 : 1;
		const direction = event.key === "ArrowRight" ? 1 : -1;
		rollEdit({
			...pair,
			pushHistory: true,
			timelineDelta: (direction * frameStep) / Math.max(1, projectFps),
			trackId: track.id,
		});
	};

	return {
		canRollLeft: Boolean(rollPairs.left && !track.locked),
		canRollRight: Boolean(rollPairs.right && !track.locked),
		canSlide,
		canSlip,
		editMode,
		handleRollKeyDown,
		handleRollPointerDown,
		handleSlidePointerDown,
		handleSlipPointerDown,
		isPrecisionEditing,
	};
}
