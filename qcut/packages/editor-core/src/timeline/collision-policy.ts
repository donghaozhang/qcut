/**
 * Collision policy — pure interval math shared by every timeline placement
 * command (QTL-002). The store maps these plans onto real elements with its
 * split/trim math; UI, CLI, and AI all go through the same store commands,
 * so this module is the single source of overlap semantics.
 *
 * Modes:
 * - `reject`: the command fails when the target range is occupied.
 * - `insert`: the occupant spanning the insert point is split and everything
 *   at or after the point shifts right by the inserted duration.
 * - `overwrite`: the target range is cleared (remove / trim / split) while
 *   downstream elements keep their time positions.
 *
 * @module @qcut/editor-core/timeline/collision-policy
 */

export type CollisionMode = "reject" | "insert" | "overwrite";

export interface TimeRange {
	startTime: number;
	endTime: number;
}

export interface TimelineRangeItem extends TimeRange {
	id: string;
}

/** Half-open interval overlap: [a.start, a.end) ∩ [b.start, b.end) ≠ ∅. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
	return a.startTime < b.endTime && a.endTime > b.startTime;
}

/** Items whose occupied range intersects the target range. */
export function findRangeCollisions({
	items,
	range,
	excludeIds = [],
}: {
	items: readonly TimelineRangeItem[];
	range: TimeRange;
	excludeIds?: Iterable<string>;
}): TimelineRangeItem[] {
	const excluded = new Set(excludeIds);
	return items.filter(
		(item) => !excluded.has(item.id) && rangesOverlap(item, range)
	);
}

/**
 * How an item relates to a range, named from the item's perspective:
 * - `inside`: fully covered by the range (remove on overwrite)
 * - `ends-inside`: starts before the range, ends inside (keep its left part)
 * - `starts-inside`: starts inside the range, ends after (keep its right part)
 * - `spans`: strictly covers the range (split at both edges)
 */
export type RangeCollisionKind =
	| "none"
	| "inside"
	| "ends-inside"
	| "starts-inside"
	| "spans";

export function classifyRangeCollision({
	item,
	range,
}: {
	item: TimeRange;
	range: TimeRange;
}): RangeCollisionKind {
	if (!rangesOverlap(item, range)) return "none";
	const startsBefore = item.startTime < range.startTime;
	const endsAfter = item.endTime > range.endTime;
	if (startsBefore && endsAfter) return "spans";
	if (startsBefore) return "ends-inside";
	if (endsAfter) return "starts-inside";
	return "inside";
}

export interface OverwritePlan {
	/** Fully covered: delete. */
	removeIds: string[];
	/** Ends inside the range: split at range.startTime, keep the left part. */
	keepLeftIds: string[];
	/** Starts inside the range: split at range.endTime, keep the right part. */
	keepRightIds: string[];
	/** Spans the range: split at both edges, keep both outer parts. */
	splitIds: string[];
}

/** Plan clearing [range.startTime, range.endTime) without moving downstream. */
export function planOverwrite({
	items,
	range,
	excludeIds = [],
}: {
	items: readonly TimelineRangeItem[];
	range: TimeRange;
	excludeIds?: Iterable<string>;
}): OverwritePlan {
	const plan: OverwritePlan = {
		removeIds: [],
		keepLeftIds: [],
		keepRightIds: [],
		splitIds: [],
	};
	for (const item of findRangeCollisions({ items, range, excludeIds })) {
		const kind = classifyRangeCollision({ item, range });
		if (kind === "inside") plan.removeIds.push(item.id);
		else if (kind === "ends-inside") plan.keepLeftIds.push(item.id);
		else if (kind === "starts-inside") plan.keepRightIds.push(item.id);
		else if (kind === "spans") plan.splitIds.push(item.id);
	}
	return plan;
}

export interface InsertPlan {
	/** Starts at or after the insert point: shift right by the duration. */
	shiftIds: string[];
	/** Strictly spans the insert point: split there, right half shifts. */
	splitIds: string[];
}

/**
 * Plan opening a gap at insertTime. The caller applies the inserted duration
 * to shifted elements and to the right half of split elements.
 */
export function planInsertShift({
	items,
	insertTime,
	excludeIds = [],
}: {
	items: readonly TimelineRangeItem[];
	insertTime: number;
	excludeIds?: Iterable<string>;
}): InsertPlan {
	const excluded = new Set(excludeIds);
	const plan: InsertPlan = { shiftIds: [], splitIds: [] };
	for (const item of items) {
		if (excluded.has(item.id)) continue;
		if (item.startTime >= insertTime) {
			plan.shiftIds.push(item.id);
		} else if (item.endTime > insertTime) {
			plan.splitIds.push(item.id);
		}
	}
	return plan;
}
