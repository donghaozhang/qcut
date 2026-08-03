import { TRANSITION_SEAM_TOLERANCE_SECONDS } from "@qcut/editor-core/timeline";
import { getTimelineElementEndTime } from "@/lib/timeline";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

/**
 * A track is a single lane: at any instant it plays exactly one element.
 *
 * Clips that merely touch — one ending where the next begins — are the normal
 * result of a split, so the occupied range is half-open: [start, end). The
 * tolerance is the same one transitions use to decide two clips meet at a cut,
 * so a seam the editor already treats as a cut is never reported as a
 * collision. It deliberately applies to every track type: stacking is what the
 * CapCut draft validator rejects on export as OVERLAPPING_TRACK_SEGMENTS.
 */
const SEAM_TOLERANCE_SECONDS = TRANSITION_SEAM_TOLERANCE_SECONDS;

/**
 * The element already occupying [startTime, startTime + duration) on this
 * track, or null when the span is free. Returns the element itself so callers
 * can name the obstruction instead of only refusing.
 */
export function findOccupyingElement({
	track,
	startTime,
	duration,
	excludeElementId,
	fps = 30,
}: {
	track: TimelineTrack;
	startTime: number;
	duration: number;
	excludeElementId?: string;
	fps?: number;
}): TimelineElement | null {
	const endTime = startTime + duration;
	for (const element of track.elements) {
		if (element.id === excludeElementId) continue;
		const elementEnd = getTimelineElementEndTime({ element, fps });
		const startsBeforeItEnds = startTime < elementEnd - SEAM_TOLERANCE_SECONDS;
		const endsAfterItStarts =
			endTime > element.startTime + SEAM_TOLERANCE_SECONDS;
		if (startsBeforeItEnds && endsAfterItStarts) return element;
	}
	return null;
}

/**
 * The first pair of elements sharing a span, or null when the lane is clean.
 *
 * Sorting by start time makes an adjacent check sufficient: an element nested
 * inside another still starts after it and before it ends.
 */
export function findOverlappingPair({
	elements,
	fps = 30,
}: {
	elements: TimelineElement[];
	fps?: number;
}): [TimelineElement, TimelineElement] | null {
	const sorted = [...elements].sort((a, b) => a.startTime - b.startTime);
	for (let index = 1; index < sorted.length; index++) {
		const previous = sorted[index - 1];
		const current = sorted[index];
		const previousEnd = getTimelineElementEndTime({ element: previous, fps });
		if (current.startTime < previousEnd - SEAM_TOLERANCE_SECONDS) {
			return [previous, current];
		}
	}
	return null;
}

/**
 * The earliest time at or after `notBefore` where `duration` fits on this
 * track. Used to make a rejection actionable rather than a dead end.
 */
export function firstFreeStartTime({
	track,
	duration,
	notBefore = 0,
	excludeElementId,
	fps = 30,
}: {
	track: TimelineTrack;
	duration: number;
	notBefore?: number;
	excludeElementId?: string;
	fps?: number;
}): number {
	const occupied = track.elements
		.filter((element) => element.id !== excludeElementId)
		.map((element) => ({
			start: element.startTime,
			end: getTimelineElementEndTime({ element, fps }),
		}))
		.sort((a, b) => a.start - b.start);

	let candidate = notBefore;
	for (const span of occupied) {
		if (span.end <= candidate + SEAM_TOLERANCE_SECONDS) continue;
		if (candidate + duration <= span.start + SEAM_TOLERANCE_SECONDS) break;
		candidate = span.end;
	}
	return candidate;
}
