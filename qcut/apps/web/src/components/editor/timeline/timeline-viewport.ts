import { getTimelineElementEndTime } from "@/lib/timeline";
import type { TimelineElement } from "@/types/timeline";

export interface TimelineVisibleRange {
	startTime: number;
	endTime: number;
}

export function getVisibleTimelineElements({
	elements,
	visibleRange,
	preserveElementIds = new Set<string>(),
}: {
	elements: TimelineElement[];
	visibleRange?: TimelineVisibleRange;
	preserveElementIds?: ReadonlySet<string>;
}): TimelineElement[] {
	if (!visibleRange) return elements;
	return elements.filter(
		(element) =>
			preserveElementIds.has(element.id) ||
			(element.startTime <= visibleRange.endTime &&
				getTimelineElementEndTime({ element }) >= visibleRange.startTime)
	);
}
