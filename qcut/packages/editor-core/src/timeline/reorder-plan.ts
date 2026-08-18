import type { TimelineSpan } from "./resize-plan.js";

/**
 * Reorder-by-drag planning for the magnetic main track (QTL-005).
 *
 * On a magnetic main track a horizontal drag does not free-move the clip —
 * it picks a new slot in the sequence, the way Jianying's main track behaves
 * (docs/task/timeline-rules-vs-jianying, experiments E2/E2b): carry the clip
 * past a neighbour's midpoint and the two swap; release before the midpoint
 * and everything springs back. The result is always a packed, gap-free
 * layout, so committing a plan also heals any gaps left from the days before
 * the magnet was enabled.
 */

export interface MainTrackReorderPlan {
	/** Slot the dragged clip lands in, counted over the packed sequence. */
	targetIndex: number;
	/** Final start time for every element on the track, dragged one included. */
	startTimes: Record<string, number>;
}

export function planMainTrackReorder({
	spans,
	draggedId,
	draggedCenter,
}: {
	spans: readonly TimelineSpan[];
	draggedId: string;
	/** Center of the dragged clip at its current pointer position, seconds. */
	draggedCenter: number;
}): MainTrackReorderPlan | null {
	const dragged = spans.find((span) => span.id === draggedId);
	if (!dragged) return null;
	const draggedDuration = Math.max(0, dragged.endTime - dragged.startTime);

	const others = spans
		.filter((span) => span.id !== draggedId)
		.sort(
			(left, right) =>
				left.startTime - right.startTime || left.id.localeCompare(right.id)
		);

	// Slot selection runs over the packed layout WITH the dragged clip
	// removed: a clip earns the slot after a neighbour only once its center
	// crosses that neighbour's midpoint, which is what makes a small wiggle
	// spring back and a committed carry swap.
	let targetIndex = 0;
	let packedCursor = 0;
	for (const span of others) {
		const duration = Math.max(0, span.endTime - span.startTime);
		const midpoint = packedCursor + duration / 2;
		if (draggedCenter > midpoint) targetIndex += 1;
		packedCursor += duration;
	}

	const startTimes: Record<string, number> = {};
	let layoutCursor = 0;
	for (const [index, span] of others.entries()) {
		if (index === targetIndex) {
			startTimes[draggedId] = layoutCursor;
			layoutCursor += draggedDuration;
		}
		startTimes[span.id] = layoutCursor;
		layoutCursor += Math.max(0, span.endTime - span.startTime);
	}
	if (!(draggedId in startTimes)) {
		startTimes[draggedId] = layoutCursor;
	}
	return { targetIndex, startTimes };
}
