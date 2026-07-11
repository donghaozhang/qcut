import type { TimelineElement } from "@/types/timeline";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";

export function getTimelineElementDuration({
	element,
	fps = 30,
}: {
	element: TimelineElement;
	fps?: number;
}): number {
	if (element.type === "media") return getMediaTimelineDuration(element, fps);
	return Math.max(0, element.duration - element.trimStart - element.trimEnd);
}

export function getTimelineElementEndTime({
	element,
	fps = 30,
}: {
	element: TimelineElement;
	fps?: number;
}): number {
	return element.startTime + getTimelineElementDuration({ element, fps });
}

/**
 * Checks if any timeline elements overlap in time
 * Used to prevent invalid timeline states where elements occupy the same time range
 * @param elements - Array of timeline elements to check
 * @returns true if overlaps are detected, false otherwise
 */
export const checkElementOverlaps = (elements: TimelineElement[]): boolean => {
	// Sort elements by start time
	const sortedElements = [...elements].sort(
		(a, b) => a.startTime - b.startTime
	);

	for (let index = 0; index < sortedElements.length - 1; index++) {
		const current = sortedElements[index];
		const next = sortedElements[index + 1];
		const currentEnd = getTimelineElementEndTime({ element: current });

		// Check if current element overlaps with next element
		if (currentEnd > next.startTime) return true; // Overlap detected
	}

	return false; // No overlaps
};

/**
 * Resolves timeline element overlaps by adjusting element positions
 * Moves overlapping elements to prevent conflicts, maintaining chronological order
 * @param elements - Array of timeline elements that may have overlaps
 * @returns New array with resolved element positions (no overlaps)
 */
export const resolveElementOverlaps = (
	elements: TimelineElement[]
): TimelineElement[] => {
	// Sort elements by start time
	const sortedElements = [...elements].sort(
		(a, b) => a.startTime - b.startTime
	);
	const resolvedElements: TimelineElement[] = [];

	for (const sortedElement of sortedElements) {
		const current = { ...sortedElement };

		if (resolvedElements.length > 0) {
			const previous = resolvedElements[resolvedElements.length - 1];
			const previousEnd = getTimelineElementEndTime({ element: previous });

			// If current element would overlap with previous, push it after previous ends
			if (current.startTime < previousEnd) {
				current.startTime = previousEnd;
			}
		}

		resolvedElements.push(current);
	}

	return resolvedElements;
};
