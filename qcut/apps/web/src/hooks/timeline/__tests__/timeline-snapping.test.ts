import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import {
	collectTimelineSnapPoints,
	resolveTimelineSnap,
} from "../use-timeline-snapping";

/**
 * QTL-006: snap candidates cover element edges, transition seams, the
 * playhead, and bookmarks; ties resolve deterministically; the tolerance is
 * one pixel constant across zoom levels.
 */

function mediaElement({
	id,
	startTime,
	duration = 2,
}: {
	id: string;
	startTime: number;
	duration?: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
	};
}

function tracksWithSeam(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 2 }),
			],
			transitions: [
				{
					id: "t1",
					fromElementId: "a",
					toElementId: "b",
					presetId: "dissolve",
					type: "dissolve",
					duration: 0.5,
					easing: "easeInOut",
				},
			],
		},
	];
}

describe("timeline snapping", () => {
	it("collects element edges, seams, playhead, and bookmarks", () => {
		const snapPoints = collectTimelineSnapPoints({
			tracks: tracksWithSeam(),
			playheadTime: 7,
			bookmarks: [9],
		});
		const types = snapPoints.map((point) => [point.type, point.time]);
		expect(types).toContainEqual(["element-start", 0]);
		expect(types).toContainEqual(["element-end", 4]);
		expect(types).toContainEqual(["transition-seam", 2]);
		expect(types).toContainEqual(["playhead", 7]);
		expect(types).toContainEqual(["bookmark", 9]);
	});

	it("drops candidates tied to the dragged element, including its seams", () => {
		const snapPoints = collectTimelineSnapPoints({
			tracks: tracksWithSeam(),
			playheadTime: 7,
			excludeElementId: "b",
		});
		expect(snapPoints.some((point) => point.elementId === "b")).toBe(false);
		expect(snapPoints.some((point) => point.type === "transition-seam")).toBe(
			false
		);
	});

	it.each([
		0.25, 1, 4,
	])("applies the shared pixel tolerance at zoom %s", (zoomLevel) => {
		const thresholdSeconds =
			TIMELINE_CONSTANTS.SNAP_THRESHOLD_PX /
			(TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel);
		const snapPoints = [{ time: 10, type: "element-start" as const }];

		const inside = resolveTimelineSnap({
			targetTime: 10 + thresholdSeconds * 0.9,
			snapPoints,
			zoomLevel,
		});
		expect(inside.snapPoint).not.toBeNull();
		expect(inside.snappedTime).toBe(10);

		const outside = resolveTimelineSnap({
			targetTime: 10 + thresholdSeconds * 1.1,
			snapPoints,
			zoomLevel,
		});
		expect(outside.snapPoint).toBeNull();
		expect(outside.snappedTime).toBeCloseTo(10 + thresholdSeconds * 1.1);
	});

	it("breaks equal-distance ties by type priority, then earlier time", () => {
		// Playhead and element edge exactly equidistant: the edge wins.
		const equidistant = resolveTimelineSnap({
			targetTime: 5,
			snapPoints: [
				{ time: 5.05, type: "playhead" },
				{ time: 4.95, type: "element-end" },
			],
			zoomLevel: 1,
		});
		expect(equidistant.snapPoint?.type).toBe("element-end");

		// Same type and distance on both sides: the earlier time wins.
		const sameType = resolveTimelineSnap({
			targetTime: 5,
			snapPoints: [
				{ time: 5.05, type: "element-start" },
				{ time: 4.95, type: "element-start" },
			],
			zoomLevel: 1,
		});
		expect(sameType.snappedTime).toBe(4.95);

		// Bookmark loses to a seam at equal distance.
		const seamVsBookmark = resolveTimelineSnap({
			targetTime: 5,
			snapPoints: [
				{ time: 5.05, type: "bookmark" },
				{ time: 4.95, type: "transition-seam" },
			],
			zoomLevel: 1,
		});
		expect(seamVsBookmark.snapPoint?.type).toBe("transition-seam");
	});

	it("prefers the strictly closer candidate regardless of type", () => {
		const result = resolveTimelineSnap({
			targetTime: 5,
			snapPoints: [
				{ time: 5.01, type: "bookmark" },
				{ time: 5.05, type: "element-start" },
			],
			zoomLevel: 1,
		});
		expect(result.snapPoint?.type).toBe("bookmark");
	});
});
