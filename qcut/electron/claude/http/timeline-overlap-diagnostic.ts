/**
 * Reports tracks whose elements overlap in time.
 *
 * A track is a single lane: the editor refuses to place two elements on the
 * same span. Projects saved before that rule existed can still hold stacked
 * elements, and repairing them by rewriting the project on load would change a
 * user's work without asking. So the overlaps are surfaced here instead, and
 * repair stays an explicit command.
 *
 * @module electron/claude/http/timeline-overlap-diagnostic
 */

import type { ClaudeTimeline } from "../../types/claude-api.js";

/**
 * Mirrors TRANSITION_SEAM_TOLERANCE_SECONDS from @qcut/editor-core/timeline,
 * which electron cannot import across rootDir (see the same pattern in
 * claude-http-search-routes.ts and subtitle-types.ts). The guard test keeps the
 * two in step.
 */
export const SEAM_TOLERANCE_SECONDS = 1 / 30 + 1e-6;

export interface TimelineOverlap {
	trackId: string | undefined;
	trackIndex: number;
	trackName: string;
	/** The element that starts later — the one sitting on top. */
	elementId: string;
	elementName: string;
	/** The element it lands on. */
	overlapsElementId: string;
	overlapsElementName: string;
	startTime: number;
	endTime: number;
	/** Seconds of shared span, so a 6-second stack reads differently to a nudge. */
	overlapSeconds: number;
}

/**
 * Every overlapping pair, ordered by track then time.
 *
 * This reads the `startTime`/`endTime` the renderer already resolved rather
 * than recomputing them: those are the numbers the caller sees in the same
 * response, and recomputing would risk disagreeing with them.
 */
export function findTimelineOverlaps({
	timeline,
}: {
	timeline: ClaudeTimeline;
}): TimelineOverlap[] {
	const overlaps: TimelineOverlap[] = [];

	for (const track of timeline.tracks ?? []) {
		const elements = [...(track.elements ?? [])].sort(
			(a, b) => a.startTime - b.startTime
		);

		for (let index = 1; index < elements.length; index++) {
			const element = elements[index];
			// Compare against every earlier element, not just the previous one: a
			// long clip can cover several that start after it.
			for (let earlier = 0; earlier < index; earlier++) {
				const previous = elements[earlier];
				const sharedEnd = Math.min(element.endTime, previous.endTime);
				const overlapSeconds = sharedEnd - element.startTime;
				if (overlapSeconds <= SEAM_TOLERANCE_SECONDS) continue;

				overlaps.push({
					trackId: track.id,
					trackIndex: track.index,
					trackName: track.name,
					elementId: element.id,
					elementName: elementLabel({ element }),
					overlapsElementId: previous.id,
					overlapsElementName: elementLabel({ element: previous }),
					startTime: element.startTime,
					endTime: element.endTime,
					overlapSeconds,
				});
			}
		}
	}

	return overlaps;
}

function elementLabel({
	element,
}: {
	element: { sourceName?: string; name?: string; id: string };
}): string {
	return element.sourceName ?? element.name ?? element.id;
}
