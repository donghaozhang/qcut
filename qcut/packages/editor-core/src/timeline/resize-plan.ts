/**
 * Pure planning math for timeline resize gestures.
 *
 * Two concerns share the neighbor snapshot a resize takes on pointer-down:
 *
 * - Clamping (QTL-002): a trim handle must stop at the adjacent element's
 *   edge instead of sliding the clip on top of it. The store's raw trim
 *   setters deliberately stay dumb, so the gesture layer owns this guard.
 * - Main-track magnet (QTL-005): with the magnet on, the main track never
 *   keeps a hole and never overlaps — a right-edge (or in-point) trim moves
 *   every downstream element by the same delta instead of clamping.
 *
 * All times are in timeline seconds. Spans are half-open [start, end): clips
 * that merely touch are legal, matching collision-policy.ts.
 */

export interface TimelineSpan {
	id: string;
	startTime: number;
	endTime: number;
}

export interface ResizeNeighborBounds {
	/** End of the nearest element left of the resized one; null when first. */
	leftNeighborEndTime: number | null;
	/** Start of the nearest element right of it; null when last. */
	rightNeighborStartTime: number | null;
}

/** Nearest same-track neighbors of `elementId`, judged by span midpoints. */
export function resolveResizeNeighborBounds({
	spans,
	elementId,
}: {
	spans: readonly TimelineSpan[];
	elementId: string;
}): ResizeNeighborBounds {
	const target = spans.find((span) => span.id === elementId);
	if (!target) {
		return { leftNeighborEndTime: null, rightNeighborStartTime: null };
	}
	let leftNeighborEndTime: number | null = null;
	let rightNeighborStartTime: number | null = null;
	for (const span of spans) {
		if (span.id === elementId) continue;
		// Midpoint comparison keeps the answer stable even if a pre-existing
		// overlap has an element straddling the target's edge.
		const midpoint = (span.startTime + span.endTime) / 2;
		const targetMidpoint = (target.startTime + target.endTime) / 2;
		if (midpoint <= targetMidpoint) {
			if (leftNeighborEndTime === null || span.endTime > leftNeighborEndTime) {
				leftNeighborEndTime = span.endTime;
			}
		} else if (
			rightNeighborStartTime === null ||
			span.startTime < rightNeighborStartTime
		) {
			rightNeighborStartTime = span.startTime;
		}
	}
	return { leftNeighborEndTime, rightNeighborStartTime };
}

/**
 * Clamp a resize gesture's timeline delta so the resulting span cannot cross
 * a neighbor. `timelineDelta` is the raw pointer movement in seconds:
 * positive = handle dragged right. The left handle moves the span start;
 * the right handle moves the span end.
 */
export function clampResizeTimelineDelta({
	side,
	timelineDelta,
	startTime,
	endTime,
	bounds,
}: {
	side: "left" | "right";
	timelineDelta: number;
	startTime: number;
	endTime: number;
	bounds: ResizeNeighborBounds;
}): number {
	if (side === "left") {
		if (bounds.leftNeighborEndTime === null) return timelineDelta;
		// Start may move left at most onto the neighbor's end.
		return Math.max(timelineDelta, bounds.leftNeighborEndTime - startTime);
	}
	if (bounds.rightNeighborStartTime === null) return timelineDelta;
	// End may move right at most onto the neighbor's start.
	return Math.min(timelineDelta, bounds.rightNeighborStartTime - endTime);
}

export interface MagnetDownstreamSnapshot {
	id: string;
	startTime: number;
}

/**
 * Elements that ride along when the magnet reflows the main track: everything
 * starting at or after the resized element's initial end. Captured once on
 * pointer-down so repeated pointer-moves stay drift-free — every move lays
 * the set out from the same baseline instead of accumulating deltas.
 */
export function captureMagnetDownstream({
	spans,
	elementId,
	initialEndTime,
	epsilon = 1e-6,
}: {
	spans: readonly TimelineSpan[];
	elementId: string;
	initialEndTime: number;
	epsilon?: number;
}): MagnetDownstreamSnapshot[] {
	return spans
		.filter(
			(span) =>
				span.id !== elementId && span.startTime >= initialEndTime - epsilon
		)
		.map((span) => ({ id: span.id, startTime: span.startTime }));
}

/**
 * New start times for the downstream set after the resized element's end
 * moved by `endDelta` (negative = pull left, positive = push right). Start
 * times never go below zero; ordering within the set is preserved because
 * every member shifts by the same amount.
 */
export function planMagnetShiftedStartTimes({
	downstream,
	endDelta,
}: {
	downstream: readonly MagnetDownstreamSnapshot[];
	endDelta: number;
}): Record<string, number> {
	const startTimes: Record<string, number> = {};
	for (const snapshot of downstream) {
		startTimes[snapshot.id] = Math.max(0, snapshot.startTime + endDelta);
	}
	return startTimes;
}

/**
 * Whether any two spans in the set intersect (half-open, epsilon-tolerant).
 * The magnet commit preflights its final layout with this before writing:
 * on a track carrying a pre-existing overlap the arrange step would reject
 * the downstream shift, and committing the trim writes anyway would leave
 * an overlap or a hole behind.
 */
export function spansHaveOverlap({
	spans,
	epsilon = 1e-6,
}: {
	spans: readonly TimelineSpan[];
	epsilon?: number;
}): boolean {
	const sorted = [...spans].sort((a, b) => a.startTime - b.startTime);
	for (let index = 1; index < sorted.length; index++) {
		if (sorted[index].startTime < sorted[index - 1].endTime - epsilon) {
			return true;
		}
	}
	return false;
}
