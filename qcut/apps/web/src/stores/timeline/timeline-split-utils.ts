import {
	type MediaTimingUpdates,
	splitMediaTiming,
} from "@/lib/video/video-speed-edit";
import { getStickerSplitKeyframeUpdates } from "@/lib/stickers/sticker-keyframe-slice";
import type { StickerElement, TimelineElement } from "@/types/timeline";

export interface TimelineSplitTrimValues {
	leftTrimStart: number;
	leftTrimEnd: number;
	rightTrimStart: number;
	rightTrimEnd: number;
}

export interface TimelineSplitUpdates {
	left: Pick<TimelineElement, "trimStart" | "trimEnd"> &
		MediaTimingUpdates &
		Partial<Pick<StickerElement, "keyframes">>;
	right: Pick<TimelineElement, "trimStart" | "trimEnd"> &
		MediaTimingUpdates &
		Partial<Pick<StickerElement, "keyframes">>;
}

export function getTimelineSplitUpdates({
	element,
	splitTime,
	fps,
}: {
	element: TimelineElement;
	splitTime: number;
	fps: number;
}): TimelineSplitUpdates {
	const timelineOffset = splitTime - element.startTime;
	const sourceDuration = Math.max(
		0,
		element.duration - element.trimStart - element.trimEnd
	);
	const stickerKeyframeUpdates = getStickerSplitKeyframeUpdates({
		element,
		splitTime,
		fps,
	});
	if (element.type === "media") {
		const mediaSplit = splitMediaTiming({
			element,
			localTimelineTime: timelineOffset,
			fps,
		}) as TimelineSplitUpdates;
		return {
			left: { ...mediaSplit.left, ...stickerKeyframeUpdates.left },
			right: { ...mediaSplit.right, ...stickerKeyframeUpdates.right },
		};
	}

	return {
		left: {
			trimStart: element.trimStart,
			trimEnd: element.trimEnd + sourceDuration - timelineOffset,
			...stickerKeyframeUpdates.left,
		},
		right: {
			trimStart: element.trimStart + timelineOffset,
			trimEnd: element.trimEnd,
			...stickerKeyframeUpdates.right,
		},
	};
}

export function getTimelineSplitTrimValues({
	element,
	splitTime,
	fps,
}: {
	element: TimelineElement;
	splitTime: number;
	fps: number;
}): TimelineSplitTrimValues {
	const updates = getTimelineSplitUpdates({ element, splitTime, fps });
	return {
		leftTrimStart: updates.left.trimStart,
		leftTrimEnd: updates.left.trimEnd,
		rightTrimStart: updates.right.trimStart,
		rightTrimEnd: updates.right.trimEnd,
	};
}
