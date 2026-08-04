import type { MediaElement } from "@/types/timeline";
import {
	clampPlaybackRate,
	getMediaTimelineDuration,
} from "@/lib/video/video-timing";

const MINIMUM_CLIP_DURATION_SECONDS = 0.1;
const SEAM_TOLERANCE_SECONDS = 0.001;

export interface MediaPrecisionUpdate {
	id: string;
	startTime: number;
	trimStart: number;
	trimEnd: number;
}

export interface MediaPrecisionResult {
	appliedTimelineDelta: number;
	updates: MediaPrecisionUpdate[];
}

export function isPrecisionMediaTimingSupported({
	element,
}: {
	element: MediaElement;
}) {
	return (
		(element.speedKeyframes?.length ?? 0) === 0 &&
		Math.max(0, element.freezeFrameDuration ?? 0) === 0
	);
}

function setTimelineEdgeTrim({
	edge,
	element,
	value,
}: {
	edge: "left" | "right";
	element: MediaElement;
	value: number;
}): Pick<MediaPrecisionUpdate, "trimStart" | "trimEnd"> {
	const edgeUsesTrimStart = element.reverse
		? edge === "right"
		: edge === "left";
	return edgeUsesTrimStart
		? { trimStart: value, trimEnd: element.trimEnd }
		: { trimStart: element.trimStart, trimEnd: value };
}

function timelineEdgeTrim({
	edge,
	element,
}: {
	edge: "left" | "right";
	element: MediaElement;
}) {
	const edgeUsesTrimStart = element.reverse
		? edge === "right"
		: edge === "left";
	return edgeUsesTrimStart ? element.trimStart : element.trimEnd;
}

export function calculateSlipEdit({
	element,
	timelineDelta,
}: {
	element: MediaElement;
	timelineDelta: number;
}): MediaPrecisionResult | null {
	if (
		!Number.isFinite(timelineDelta) ||
		!isPrecisionMediaTimingSupported({ element })
	) {
		return null;
	}
	const rate = clampPlaybackRate(element.playbackRate);
	const sourceDirection = element.reverse ? -1 : 1;
	const requestedSourceDelta = timelineDelta * rate * sourceDirection;
	const appliedSourceDelta = Math.min(
		element.trimEnd,
		Math.max(-element.trimStart, requestedSourceDelta)
	);
	if (Math.abs(appliedSourceDelta) < Number.EPSILON) return null;

	return {
		appliedTimelineDelta: appliedSourceDelta / rate / sourceDirection,
		updates: [
			{
				id: element.id,
				startTime: element.startTime,
				trimStart: element.trimStart + appliedSourceDelta,
				trimEnd: element.trimEnd - appliedSourceDelta,
			},
		],
	};
}

/**
 * Slide edit (QTL-007): move the element while keeping its duration and
 * trims; the left neighbor's out-point and the right neighbor's in-point
 * absorb the movement. Both neighbors must be seam-adjacent.
 */
export function calculateSlideEdit({
	element,
	leftNeighbor,
	rightNeighbor,
	timelineDelta,
}: {
	element: MediaElement;
	leftNeighbor: MediaElement;
	rightNeighbor: MediaElement;
	timelineDelta: number;
}): MediaPrecisionResult | null {
	if (
		!Number.isFinite(timelineDelta) ||
		!isPrecisionMediaTimingSupported({ element }) ||
		!isPrecisionMediaTimingSupported({ element: leftNeighbor }) ||
		!isPrecisionMediaTimingSupported({ element: rightNeighbor })
	) {
		return null;
	}

	const leftDuration = getMediaTimelineDuration(leftNeighbor);
	const middleDuration = getMediaTimelineDuration(element);
	const rightDuration = getMediaTimelineDuration(rightNeighbor);
	if (
		Math.abs(leftNeighbor.startTime + leftDuration - element.startTime) >
			SEAM_TOLERANCE_SECONDS ||
		Math.abs(element.startTime + middleDuration - rightNeighbor.startTime) >
			SEAM_TOLERANCE_SECONDS
	) {
		return null;
	}

	const leftRate = clampPlaybackRate(leftNeighbor.playbackRate);
	const rightRate = clampPlaybackRate(rightNeighbor.playbackRate);
	const leftRightTrim = timelineEdgeTrim({
		edge: "right",
		element: leftNeighbor,
	});
	const rightLeftTrim = timelineEdgeTrim({
		edge: "left",
		element: rightNeighbor,
	});

	// Sliding right lengthens the left neighbor (needs its right handle) and
	// shortens the right neighbor (kept above the minimum); sliding left is
	// the mirror image.
	const maximumPositiveDelta = Math.min(
		leftRightTrim / leftRate,
		Math.max(0, rightDuration - MINIMUM_CLIP_DURATION_SECONDS)
	);
	const maximumNegativeMagnitude = Math.min(
		Math.max(0, leftDuration - MINIMUM_CLIP_DURATION_SECONDS),
		rightLeftTrim / rightRate
	);
	const appliedTimelineDelta = Math.min(
		maximumPositiveDelta,
		Math.max(-maximumNegativeMagnitude, timelineDelta)
	);
	if (Math.abs(appliedTimelineDelta) < Number.EPSILON) return null;

	const leftTrim = setTimelineEdgeTrim({
		edge: "right",
		element: leftNeighbor,
		value: leftRightTrim - appliedTimelineDelta * leftRate,
	});
	const rightTrim = setTimelineEdgeTrim({
		edge: "left",
		element: rightNeighbor,
		value: rightLeftTrim + appliedTimelineDelta * rightRate,
	});
	return {
		appliedTimelineDelta,
		updates: [
			{
				id: leftNeighbor.id,
				startTime: leftNeighbor.startTime,
				...leftTrim,
			},
			{
				id: element.id,
				startTime: element.startTime + appliedTimelineDelta,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
			},
			{
				id: rightNeighbor.id,
				startTime: rightNeighbor.startTime + appliedTimelineDelta,
				...rightTrim,
			},
		],
	};
}

export interface RippleTrimResult {
	appliedDurationDelta: number;
	updates: MediaPrecisionUpdate[];
}

/**
 * Ripple trim (QTL-007): change the element's duration at one edge while
 * its start time stays anchored; the caller shifts everything downstream by
 * the applied delta. Positive lengthens (consumes the edge handle),
 * negative shortens (down to the minimum clip duration).
 */
export function calculateRippleTrim({
	durationDelta,
	edge,
	element,
}: {
	durationDelta: number;
	edge: "left" | "right";
	element: MediaElement;
}): RippleTrimResult | null {
	if (
		!Number.isFinite(durationDelta) ||
		!isPrecisionMediaTimingSupported({ element })
	) {
		return null;
	}
	const rate = clampPlaybackRate(element.playbackRate);
	const edgeTrim = timelineEdgeTrim({ edge, element });
	const maximumExtend = edgeTrim / rate;
	const maximumShorten = Math.max(
		0,
		getMediaTimelineDuration(element) - MINIMUM_CLIP_DURATION_SECONDS
	);
	const appliedDurationDelta = Math.min(
		maximumExtend,
		Math.max(-maximumShorten, durationDelta)
	);
	if (Math.abs(appliedDurationDelta) < Number.EPSILON) return null;

	const trim = setTimelineEdgeTrim({
		edge,
		element,
		value: edgeTrim - appliedDurationDelta * rate,
	});
	return {
		appliedDurationDelta,
		updates: [{ id: element.id, startTime: element.startTime, ...trim }],
	};
}

export function calculateRollEdit({
	fromElement,
	timelineDelta,
	toElement,
}: {
	fromElement: MediaElement;
	timelineDelta: number;
	toElement: MediaElement;
}): MediaPrecisionResult | null {
	if (
		!Number.isFinite(timelineDelta) ||
		!isPrecisionMediaTimingSupported({ element: fromElement }) ||
		!isPrecisionMediaTimingSupported({ element: toElement })
	) {
		return null;
	}
	const fromDuration = getMediaTimelineDuration(fromElement);
	const toDuration = getMediaTimelineDuration(toElement);
	const seamTime = fromElement.startTime + fromDuration;
	if (Math.abs(seamTime - toElement.startTime) > SEAM_TOLERANCE_SECONDS) {
		return null;
	}

	const fromRate = clampPlaybackRate(fromElement.playbackRate);
	const toRate = clampPlaybackRate(toElement.playbackRate);
	const fromRightTrim = timelineEdgeTrim({
		edge: "right",
		element: fromElement,
	});
	const toLeftTrim = timelineEdgeTrim({ edge: "left", element: toElement });
	const maximumPositiveDelta = Math.min(
		fromRightTrim / fromRate,
		Math.max(0, toDuration - MINIMUM_CLIP_DURATION_SECONDS)
	);
	const maximumNegativeMagnitude = Math.min(
		Math.max(0, fromDuration - MINIMUM_CLIP_DURATION_SECONDS),
		toLeftTrim / toRate
	);
	const appliedTimelineDelta = Math.min(
		maximumPositiveDelta,
		Math.max(-maximumNegativeMagnitude, timelineDelta)
	);
	if (Math.abs(appliedTimelineDelta) < Number.EPSILON) return null;

	const fromTrim = setTimelineEdgeTrim({
		edge: "right",
		element: fromElement,
		value: fromRightTrim - appliedTimelineDelta * fromRate,
	});
	const toTrim = setTimelineEdgeTrim({
		edge: "left",
		element: toElement,
		value: toLeftTrim + appliedTimelineDelta * toRate,
	});
	return {
		appliedTimelineDelta,
		updates: [
			{
				id: fromElement.id,
				startTime: fromElement.startTime,
				...fromTrim,
			},
			{
				id: toElement.id,
				startTime: toElement.startTime + appliedTimelineDelta,
				...toTrim,
			},
		],
	};
}
