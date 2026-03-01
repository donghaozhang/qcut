import {
	TIMELINE_CONSTANTS,
	calculateTimelineBuffer,
} from "@/constants/timeline-constants";
import type { RefObject } from "react";

interface UseTimelineDimensionsOptions {
	duration: number;
	currentTime: number;
	zoomLevel: number;
	containerRef: RefObject<HTMLDivElement | null>;
}

export function useTimelineDimensions({
	duration,
	currentTime,
	zoomLevel,
	containerRef,
}: UseTimelineDimensionsOptions) {
	const dynamicBuffer = calculateTimelineBuffer(duration || 0);
	const dynamicTimelineWidth = Math.max(
		(duration || 0) * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel,
		(currentTime + dynamicBuffer) *
			TIMELINE_CONSTANTS.PIXELS_PER_SECOND *
			zoomLevel,
		containerRef.current?.clientWidth || 1000
	);

	return { dynamicTimelineWidth };
}
