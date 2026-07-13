import { describe, expect, it } from "vitest";
import type { TimelineElement } from "@/types/timeline";
import { getVisibleTimelineElements } from "../timeline-viewport";

const elements: TimelineElement[] = [
	{
		id: "before",
		name: "Before",
		type: "media",
		mediaId: "before-media",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	},
	{
		id: "visible",
		name: "Visible",
		type: "media",
		mediaId: "visible-media",
		startTime: 8,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
	},
	{
		id: "after",
		name: "After",
		type: "media",
		mediaId: "after-media",
		startTime: 20,
		duration: 3,
		trimStart: 0,
		trimEnd: 0,
	},
];

describe("timeline viewport filtering", () => {
	it("keeps only clips intersecting the buffered visible range", () => {
		expect(
			getVisibleTimelineElements({
				elements,
				visibleRange: { startTime: 5, endTime: 15 },
			}).map((element) => element.id)
		).toEqual(["visible"]);
	});

	it("preserves a dragged or selected clip outside the viewport", () => {
		expect(
			getVisibleTimelineElements({
				elements,
				visibleRange: { startTime: 5, endTime: 15 },
				preserveElementIds: new Set(["after"]),
			}).map((element) => element.id)
		).toEqual(["visible", "after"]);
	});

	it("keeps a 300-clip and 500-caption project bounded while scrolling", () => {
		const mediaClips: TimelineElement[] = Array.from(
			{ length: 300 },
			(_, index) => ({
				id: `media-${index}`,
				name: `Media ${index}`,
				type: "media",
				mediaId: `source-${index}`,
				startTime: index * 2,
				duration: 1.8,
				trimStart: 0,
				trimEnd: 0,
			})
		);
		const captions: TimelineElement[] = Array.from(
			{ length: 500 },
			(_, index) => ({
				id: `caption-${index}`,
				name: `Caption ${index}`,
				type: "captions",
				text: `Caption ${index}`,
				language: "en",
				source: "transcription",
				startTime: index * 0.4,
				duration: 0.32,
				trimStart: 0,
				trimEnd: 0,
			})
		);
		const startedAt = performance.now();
		let renderedElements = 0;
		for (let index = 0; index < 200; index++) {
			const startTime = index * 2;
			const visibleRange = { startTime, endTime: startTime + 12 };
			renderedElements += getVisibleTimelineElements({
				elements: mediaClips,
				visibleRange,
				preserveElementIds: new Set(["media-299"]),
			}).length;
			renderedElements += getVisibleTimelineElements({
				elements: captions,
				visibleRange,
			}).length;
		}

		expect(renderedElements).toBeLessThan(8_500);
		expect(performance.now() - startedAt).toBeLessThan(250);
	});
});
