import {
	type MediaTimingUpdates,
	splitMediaTiming,
} from "@/lib/video/video-speed-edit";
import type { TimelineElement } from "@/types/timeline";

export interface TimelineSplitTrimValues {
	leftTrimStart: number;
	leftTrimEnd: number;
	rightTrimStart: number;
	rightTrimEnd: number;
}

export interface TimelineSplitUpdates {
	left: Pick<TimelineElement, "trimStart" | "trimEnd"> & MediaTimingUpdates;
	right: Pick<TimelineElement, "trimStart" | "trimEnd"> & MediaTimingUpdates;
}

export function getTimelineSplitUpdates({
	element,
	splitTime,
	fps = 30,
}: {
	element: TimelineElement;
	splitTime: number;
	fps?: number;
}): TimelineSplitUpdates {
	const timelineOffset = splitTime - element.startTime;
	const sourceDuration = Math.max(
		0,
		element.duration - element.trimStart - element.trimEnd
	);
	if (element.type === "media") {
		return splitMediaTiming({
			element,
			localTimelineTime: timelineOffset,
			fps,
		}) as TimelineSplitUpdates;
	}

	return {
		left: {
			trimStart: element.trimStart,
			trimEnd: element.trimEnd + sourceDuration - timelineOffset,
		},
		right: {
			trimStart: element.trimStart + timelineOffset,
			trimEnd: element.trimEnd,
		},
	};
}

export function getTimelineSplitTrimValues({
	element,
	splitTime,
}: {
	element: TimelineElement;
	splitTime: number;
}): TimelineSplitTrimValues {
	const updates = getTimelineSplitUpdates({ element, splitTime });
	return {
		leftTrimStart: updates.left.trimStart,
		leftTrimEnd: updates.left.trimEnd,
		rightTrimStart: updates.right.trimStart,
		rightTrimEnd: updates.right.trimEnd,
	};
}
