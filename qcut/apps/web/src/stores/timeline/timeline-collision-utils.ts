import {
	assignNewStickerInstanceId,
	createStickerInstanceId,
} from "@/lib/stickers/sticker-instance";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { generateUUID } from "@/lib/utils";
import type { TimelineElement } from "@/types/timeline";
import {
	classifyRangeCollision,
	type TimeRange,
} from "@qcut/editor-core/timeline";
import { getElementNameWithSuffix } from "./index";
import { getTimelineSplitUpdates } from "./timeline-split-utils";

/**
 * Applies collision plans to one track's element list (QTL-002). This is the
 * single place that turns the pure interval plans from
 * `@qcut/editor-core/timeline/collision-policy` into real element edits, so
 * add-with-overwrite, deleteTimeRange, and ripple range deletion all share
 * one implementation of the trim/split math.
 */

export interface OverwriteRangeResult {
	elements: TimelineElement[];
	deletedElements: number;
	splitElements: number;
}

/**
 * Clear [range.startTime, range.endTime) from the element list without
 * moving anything outside the range. Split parts keep their names — this
 * mirrors the long-standing deleteTimeRange behavior.
 */
export function overwriteRangeInElements({
	elements,
	range,
	fps,
}: {
	elements: readonly TimelineElement[];
	range: TimeRange;
	fps: number;
}): OverwriteRangeResult {
	const nextElements: TimelineElement[] = [];
	let deletedElements = 0;
	let splitElements = 0;

	for (const element of elements) {
		const kind = classifyRangeCollision({
			item: {
				startTime: element.startTime,
				endTime: getTimelineElementEndTime({ element }),
			},
			range,
		});

		if (kind === "none") {
			nextElements.push(element);
			continue;
		}

		if (kind === "inside") {
			deletedElements++;
			continue;
		}

		if (kind === "ends-inside") {
			splitElements++;
			const splitUpdates = getTimelineSplitUpdates({
				element,
				splitTime: range.startTime,
				fps,
			});
			nextElements.push({ ...element, ...splitUpdates.left });
			continue;
		}

		if (kind === "starts-inside") {
			splitElements++;
			const splitUpdates = getTimelineSplitUpdates({
				element,
				splitTime: range.endTime,
				fps,
			});
			nextElements.push({
				...element,
				startTime: range.endTime,
				...splitUpdates.right,
			});
			continue;
		}

		// spans: keep both outer parts, the right one as a new element.
		splitElements++;
		const leftSplitUpdates = getTimelineSplitUpdates({
			element,
			splitTime: range.startTime,
			fps,
		});
		const rightSplitUpdates = getTimelineSplitUpdates({
			element,
			splitTime: range.endTime,
			fps,
		});
		nextElements.push({ ...element, ...leftSplitUpdates.left });
		nextElements.push(
			assignNewStickerInstanceId({
				element: {
					...element,
					id: generateUUID(),
					startTime: range.endTime,
					...rightSplitUpdates.right,
				},
				newStickerId: createStickerInstanceId(),
			})
		);
	}

	return { elements: nextElements, deletedElements, splitElements };
}

/**
 * Open a gap of `insertDuration` at `insertTime`: the element spanning the
 * point is split (named like a manual split), and everything at or after the
 * point shifts right.
 */
export function insertGapInElements({
	elements,
	insertTime,
	insertDuration,
	fps,
}: {
	elements: readonly TimelineElement[];
	insertTime: number;
	insertDuration: number;
	fps: number;
}): TimelineElement[] {
	const nextElements: TimelineElement[] = [];

	for (const element of elements) {
		if (element.startTime >= insertTime) {
			nextElements.push({
				...element,
				startTime: element.startTime + insertDuration,
			});
			continue;
		}

		const endTime = getTimelineElementEndTime({ element });
		if (endTime <= insertTime) {
			nextElements.push(element);
			continue;
		}

		const splitUpdates = getTimelineSplitUpdates({
			element,
			splitTime: insertTime,
			fps,
		});
		nextElements.push({
			...element,
			...splitUpdates.left,
			name: getElementNameWithSuffix(element.name, "left"),
		});
		nextElements.push(
			assignNewStickerInstanceId({
				element: {
					...element,
					id: generateUUID(),
					startTime: insertTime + insertDuration,
					...splitUpdates.right,
					name: getElementNameWithSuffix(element.name, "right"),
				},
				newStickerId: createStickerInstanceId(),
			})
		);
	}

	return nextElements;
}
