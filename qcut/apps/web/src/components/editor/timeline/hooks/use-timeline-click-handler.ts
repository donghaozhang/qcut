import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import {
	TIMELINE_CONSTANTS,
	snapTimeToFrame,
} from "@/constants/timeline-constants";

interface UseTimelineClickHandlerOptions {
	duration: number;
	zoomLevel: number;
	seek: (time: number) => void;
	clearSelectedElements: () => void;
	isSelecting: boolean;
	justFinishedSelecting: boolean;
	projectFps: number;
	playheadRef: RefObject<HTMLDivElement | null>;
	rulerScrollRef: RefObject<HTMLDivElement | null>;
	tracksScrollRef: RefObject<HTMLDivElement | null>;
}

/** Hook for timeline click-to-seek, distinguishing real clicks from drag ends. */
export function useTimelineClickHandler({
	duration,
	zoomLevel,
	seek,
	clearSelectedElements,
	isSelecting,
	justFinishedSelecting,
	projectFps,
	playheadRef,
	rulerScrollRef,
	tracksScrollRef,
}: UseTimelineClickHandlerOptions) {
	// Track mouse down/up for distinguishing clicks from drag/resize ends
	const mouseTrackingRef = useRef({
		isMouseDown: false,
		downX: 0,
		downY: 0,
		downTime: 0,
	});

	// Track mouse down to distinguish real clicks from drag/resize ends
	const handleTimelineMouseDown = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			const isTimelineBackground =
				!target.closest(".timeline-element") &&
				!playheadRef.current?.contains(target) &&
				!target.closest("[data-track-labels]");

			if (isTimelineBackground) {
				mouseTrackingRef.current = {
					isMouseDown: true,
					downX: e.clientX,
					downY: e.clientY,
					downTime: e.timeStamp,
				};
			}
		},
		[playheadRef]
	);

	// Timeline content click to seek handler
	const handleTimelineContentClick = useCallback(
		(e: React.MouseEvent) => {
			const { isMouseDown, downX, downY, downTime } = mouseTrackingRef.current;

			// Reset mouse tracking
			mouseTrackingRef.current = {
				isMouseDown: false,
				downX: 0,
				downY: 0,
				downTime: 0,
			};

			// Only process as click if we tracked a mouse down on timeline background
			if (!isMouseDown) {
				return;
			}

			// Check if mouse moved significantly (indicates drag, not click)
			const deltaX = Math.abs(e.clientX - downX);
			const deltaY = Math.abs(e.clientY - downY);
			const deltaTime = e.timeStamp - downTime;

			if (deltaX > 5 || deltaY > 5 || deltaTime > 500) {
				return;
			}

			// Don't seek if this was a selection box operation
			if (isSelecting || justFinishedSelecting) {
				return;
			}

			// Don't seek if clicking on timeline elements, but still deselect
			if ((e.target as HTMLElement).closest(".timeline-element")) {
				return;
			}

			// Don't seek if clicking on playhead
			if (playheadRef.current?.contains(e.target as Node)) {
				return;
			}

			// Don't seek if clicking on track labels
			if ((e.target as HTMLElement).closest("[data-track-labels]")) {
				clearSelectedElements();
				return;
			}

			// Clear selected elements when clicking empty timeline area
			clearSelectedElements();

			// Determine if we're clicking in ruler or tracks area
			const isRulerClick = (e.target as HTMLElement).closest(
				"[data-ruler-area]"
			);

			let mouseX: number;
			let scrollLeft = 0;

			if (isRulerClick) {
				const rulerContent = rulerScrollRef.current;
				if (!rulerContent) return;
				const rect = rulerContent.getBoundingClientRect();
				mouseX = e.clientX - rect.left;
				scrollLeft = rulerContent.scrollLeft;
			} else {
				const tracksContent = tracksScrollRef.current;
				if (!tracksContent) return;
				const rect = tracksContent.getBoundingClientRect();
				mouseX = e.clientX - rect.left;
				scrollLeft = tracksContent.scrollLeft;
			}

			const rawTime = Math.max(
				0,
				Math.min(
					duration,
					(mouseX + scrollLeft) /
						(TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel)
				)
			);

			const time = snapTimeToFrame(rawTime, projectFps);
			seek(time);
		},
		[
			duration,
			zoomLevel,
			seek,
			clearSelectedElements,
			isSelecting,
			justFinishedSelecting,
			projectFps,
			playheadRef,
			rulerScrollRef,
			tracksScrollRef,
		]
	);

	return { handleTimelineMouseDown, handleTimelineContentClick };
}
