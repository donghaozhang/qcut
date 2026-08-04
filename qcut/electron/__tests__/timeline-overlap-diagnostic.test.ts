import { describe, expect, it } from "vitest";
import { TRANSITION_SEAM_TOLERANCE_SECONDS } from "@qcut/editor-core/timeline";
import type { ClaudeTimeline } from "../types/claude-api.js";
import {
	findTimelineOverlaps,
	SEAM_TOLERANCE_SECONDS,
} from "../claude/http/timeline-overlap-diagnostic.js";

function element({
	id,
	startTime,
	endTime,
	name,
}: {
	id: string;
	startTime: number;
	endTime: number;
	name?: string;
}) {
	return {
		id,
		trackIndex: 0,
		startTime,
		endTime,
		duration: endTime - startTime,
		type: "video",
		sourceName: name ?? id,
	};
}

function timelineWith({
	elements,
}: {
	elements: ReturnType<typeof element>[];
}): ClaudeTimeline {
	return {
		tracks: [
			{ id: "track-1", index: 0, name: "主轨道", type: "media", elements },
		],
	} as unknown as ClaudeTimeline;
}

describe("findTimelineOverlaps", () => {
	it("reports nothing for a track laid out end to end", () => {
		const timeline = timelineWith({
			elements: [
				element({ id: "a", startTime: 0, endTime: 10 }),
				element({ id: "b", startTime: 10, endTime: 16 }),
			],
		});
		expect(findTimelineOverlaps({ timeline })).toEqual([]);
	});

	it("reports the real stack the CLI used to create at t=0", () => {
		const timeline = timelineWith({
			elements: [
				element({ id: "a", startTime: 0, endTime: 10, name: "clip-a.mp4" }),
				element({ id: "b", startTime: 0, endTime: 6, name: "clip-b.mp4" }),
			],
		});

		const overlaps = findTimelineOverlaps({ timeline });
		expect(overlaps).toHaveLength(1);
		expect(overlaps[0]).toMatchObject({
			trackId: "track-1",
			trackName: "主轨道",
			elementName: "clip-b.mp4",
			overlapsElementName: "clip-a.mp4",
			overlapSeconds: 6,
		});
	});

	it("reports every pair when one long clip covers several", () => {
		// Comparing only against the previous element would miss b-vs-c here.
		const timeline = timelineWith({
			elements: [
				element({ id: "a", startTime: 0, endTime: 30 }),
				element({ id: "b", startTime: 5, endTime: 25 }),
				element({ id: "c", startTime: 10, endTime: 20 }),
			],
		});

		const pairs = findTimelineOverlaps({ timeline }).map(
			(overlap) => `${overlap.overlapsElementId}->${overlap.elementId}`
		);
		expect(pairs).toEqual(["a->b", "a->c", "b->c"]);
	});

	it("ignores a seam that is off by less than one frame", () => {
		const timeline = timelineWith({
			elements: [
				element({ id: "a", startTime: 0, endTime: 10 }),
				element({ id: "b", startTime: 10 - 1 / 60, endTime: 16 }),
			],
		});
		expect(findTimelineOverlaps({ timeline })).toEqual([]);
	});

	it("measures how much of the span is shared", () => {
		const timeline = timelineWith({
			elements: [
				element({ id: "a", startTime: 0, endTime: 10 }),
				element({ id: "b", startTime: 8, endTime: 20 }),
			],
		});
		expect(findTimelineOverlaps({ timeline })[0].overlapSeconds).toBeCloseTo(2);
	});

	it("handles a timeline with no tracks", () => {
		expect(
			findTimelineOverlaps({ timeline: {} as unknown as ClaudeTimeline })
		).toEqual([]);
	});
});

describe("the mirrored seam tolerance", () => {
	it("stays equal to the editor-core constant it copies", () => {
		// electron cannot import editor-core across rootDir, so the constant is
		// duplicated. This is the only thing keeping the copy honest.
		expect(SEAM_TOLERANCE_SECONDS).toBe(TRANSITION_SEAM_TOLERANCE_SECONDS);
	});
});
