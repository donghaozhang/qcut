import { useCallback } from "react";
import { TimelineTrack } from "@/types/timeline";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { useProjectStore } from "@/stores/project-store";

/**
 * Timeline snapping engine (QTL-006). Candidates cover element edges,
 * transition seams, the playhead, and project bookmarks; every drag/trim
 * path shares one pixel tolerance, and equal-distance ties resolve through
 * a deterministic priority order instead of iteration luck.
 */

export interface SnapPoint {
	time: number;
	type:
		| "element-start"
		| "element-end"
		| "transition-seam"
		| "playhead"
		| "bookmark";
	elementId?: string;
	trackId?: string;
}

export interface SnapResult {
	snappedTime: number;
	snapPoint: SnapPoint | null;
	snapDistance: number;
}

/** Tie-break ranking: lower wins at equal distance. Element edges first
 * (the most common editing intent), then seams, playhead, bookmarks. */
const SNAP_TYPE_PRIORITY: Record<SnapPoint["type"], number> = {
	"element-start": 0,
	"element-end": 0,
	"transition-seam": 1,
	playhead: 2,
	bookmark: 3,
};

export interface CollectSnapPointsInput {
	tracks: TimelineTrack[];
	playheadTime: number;
	bookmarks?: readonly number[];
	excludeElementId?: string;
	enableElementSnapping?: boolean;
	enablePlayheadSnapping?: boolean;
}

/** Pure candidate collection — parameterized tests target this directly. */
export function collectTimelineSnapPoints({
	tracks,
	playheadTime,
	bookmarks = [],
	excludeElementId,
	enableElementSnapping = true,
	enablePlayheadSnapping = true,
}: CollectSnapPointsInput): SnapPoint[] {
	const snapPoints: SnapPoint[] = [];

	if (enableElementSnapping) {
		for (const track of tracks) {
			const elementById = new Map(
				track.elements.map((element) => [element.id, element])
			);
			for (const element of track.elements) {
				if (element.id === excludeElementId) continue;

				snapPoints.push(
					{
						time: element.startTime,
						type: "element-start",
						elementId: element.id,
						trackId: track.id,
					},
					{
						time: getTimelineElementEndTime({ element }),
						type: "element-end",
						elementId: element.id,
						trackId: track.id,
					}
				);
			}

			// Transition seams: the boundary the transition is centered on.
			for (const transition of track.transitions ?? []) {
				const toElement = elementById.get(transition.toElementId);
				if (!toElement) continue;
				if (
					transition.fromElementId === excludeElementId ||
					transition.toElementId === excludeElementId
				) {
					continue;
				}
				snapPoints.push({
					time: toElement.startTime,
					type: "transition-seam",
					trackId: track.id,
				});
			}
		}
	}

	if (enablePlayheadSnapping) {
		snapPoints.push({ time: playheadTime, type: "playhead" });
	}

	for (const bookmark of bookmarks) {
		snapPoints.push({ time: bookmark, type: "bookmark" });
	}

	return snapPoints;
}

export interface ResolveSnapInput {
	targetTime: number;
	snapPoints: readonly SnapPoint[];
	zoomLevel: number;
	snapThresholdPx?: number;
}

/**
 * Pure nearest-candidate resolution. Distance decides; at equal distance the
 * type priority decides; at equal priority the earlier time wins.
 */
export function resolveTimelineSnap({
	targetTime,
	snapPoints,
	zoomLevel,
	snapThresholdPx = TIMELINE_CONSTANTS.SNAP_THRESHOLD_PX,
}: ResolveSnapInput): SnapResult {
	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const thresholdInSeconds = snapThresholdPx / pixelsPerSecond;

	let closest: SnapPoint | null = null;
	let closestDistance = Infinity;

	for (const snapPoint of snapPoints) {
		const distance = Math.abs(targetTime - snapPoint.time);
		if (distance >= thresholdInSeconds) continue;
		if (
			closest === null ||
			distance < closestDistance ||
			(distance === closestDistance &&
				(SNAP_TYPE_PRIORITY[snapPoint.type] <
					SNAP_TYPE_PRIORITY[closest.type] ||
					(SNAP_TYPE_PRIORITY[snapPoint.type] ===
						SNAP_TYPE_PRIORITY[closest.type] &&
						snapPoint.time < closest.time)))
		) {
			closest = snapPoint;
			closestDistance = distance;
		}
	}

	return {
		snappedTime: closest ? closest.time : targetTime,
		snapPoint: closest,
		snapDistance: closestDistance,
	};
}

export interface UseTimelineSnappingOptions {
	snapThreshold?: number; // Distance in pixels to trigger snapping
	enableElementSnapping?: boolean;
	enablePlayheadSnapping?: boolean;
}

export function useTimelineSnapping({
	snapThreshold = TIMELINE_CONSTANTS.SNAP_THRESHOLD_PX,
	enableElementSnapping = true,
	enablePlayheadSnapping = true,
}: UseTimelineSnappingOptions = {}) {
	const bookmarks = useProjectStore((state) => state.activeProject?.bookmarks);

	const findSnapPoints = useCallback(
		(
			tracks: TimelineTrack[],
			_currentTime: number,
			playheadTime: number,
			_zoomLevel: number,
			excludeElementId?: string
		): SnapPoint[] =>
			collectTimelineSnapPoints({
				tracks,
				playheadTime,
				bookmarks: bookmarks ?? [],
				excludeElementId,
				enableElementSnapping,
				enablePlayheadSnapping,
			}),
		[enableElementSnapping, enablePlayheadSnapping, bookmarks]
	);

	const snapToNearestPoint = useCallback(
		(
			targetTime: number,
			snapPoints: SnapPoint[],
			zoomLevel: number
		): SnapResult =>
			resolveTimelineSnap({
				targetTime,
				snapPoints,
				zoomLevel,
				snapThresholdPx: snapThreshold,
			}),
		[snapThreshold]
	);

	const snapElementPosition = useCallback(
		(
			targetTime: number,
			tracks: TimelineTrack[],
			playheadTime: number,
			zoomLevel: number,
			excludeElementId?: string
		): SnapResult => {
			const snapPoints = findSnapPoints(
				tracks,
				targetTime,
				playheadTime,
				zoomLevel,
				excludeElementId
			);

			return snapToNearestPoint(targetTime, snapPoints, zoomLevel);
		},
		[findSnapPoints, snapToNearestPoint]
	);

	const snapElementEdge = useCallback(
		(
			targetTime: number,
			elementDuration: number,
			tracks: TimelineTrack[],
			playheadTime: number,
			zoomLevel: number,
			excludeElementId?: string,
			snapToStart = true // true for start edge, false for end edge
		): SnapResult => {
			const snapPoints = findSnapPoints(
				tracks,
				targetTime,
				playheadTime,
				zoomLevel,
				excludeElementId
			);

			// For end edge snapping, we need to account for element duration
			const effectiveTargetTime = snapToStart
				? targetTime
				: targetTime + elementDuration;
			const snapResult = snapToNearestPoint(
				effectiveTargetTime,
				snapPoints,
				zoomLevel
			);

			// Adjust the snapped time back for end edge
			if (!snapToStart && snapResult.snapPoint) {
				snapResult.snappedTime = snapResult.snappedTime - elementDuration;
			}

			return snapResult;
		},
		[findSnapPoints, snapToNearestPoint]
	);

	return {
		snapElementPosition,
		snapElementEdge,
		findSnapPoints,
		snapToNearestPoint,
	};
}
