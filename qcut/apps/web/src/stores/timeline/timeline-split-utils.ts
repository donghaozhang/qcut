import {
	getMediaSourceDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import type { TimelineElement } from "@/types/timeline";

export interface TimelineSplitTrimValues {
	leftTrimStart: number;
	leftTrimEnd: number;
	rightTrimStart: number;
	rightTrimEnd: number;
}

export function getTimelineSplitTrimValues({
	element,
	splitTime,
}: {
	element: TimelineElement;
	splitTime: number;
}): TimelineSplitTrimValues {
	const timelineOffset = splitTime - element.startTime;
	const sourceDuration = Math.max(
		0,
		element.duration - element.trimStart - element.trimEnd
	);
	if (element.type !== "media") {
		return {
			leftTrimStart: element.trimStart,
			leftTrimEnd: element.trimEnd + sourceDuration - timelineOffset,
			rightTrimStart: element.trimStart + timelineOffset,
			rightTrimEnd: element.trimEnd,
		};
	}

	const playbackTiming = mapMediaTimelineTime({
		element,
		localTimelineTime: timelineOffset,
	});
	const mediaSourceDuration = getMediaSourceDuration(element);
	const sourceProgress = Math.min(
		mediaSourceDuration,
		Math.max(
			0,
			element.reverse
				? mediaSourceDuration - playbackTiming.sourceTime
				: playbackTiming.sourceTime
		)
	);

	if (element.reverse) {
		return {
			leftTrimStart: element.trimStart + mediaSourceDuration - sourceProgress,
			leftTrimEnd: element.trimEnd,
			rightTrimStart: element.trimStart,
			rightTrimEnd: element.trimEnd + sourceProgress,
		};
	}

	return {
		leftTrimStart: element.trimStart,
		leftTrimEnd: element.trimEnd + mediaSourceDuration - sourceProgress,
		rightTrimStart: element.trimStart + sourceProgress,
		rightTrimEnd: element.trimEnd,
	};
}
