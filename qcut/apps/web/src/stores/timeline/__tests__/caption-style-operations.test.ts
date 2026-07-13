import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import { applyCaptionStyleToTracks } from "../caption-style-operations";

function captionTrack({
	id,
	elementIds,
}: {
	id: string;
	elementIds: string[];
}) {
	return {
		id,
		name: id,
		type: "captions",
		elements: elementIds.map((elementId, index) => ({
			id: elementId,
			name: elementId,
			type: "captions",
			text: elementId,
			language: "en",
			confidence: 1,
			source: "manual",
			startTime: index,
			duration: 1,
			trimStart: 0,
			trimEnd: 0,
		})),
	} satisfies TimelineTrack;
}

describe("applyCaptionStyleToTracks", () => {
	const tracks = [
		captionTrack({ id: "captions-a", elementIds: ["a-1", "a-2"] }),
		captionTrack({ id: "captions-b", elementIds: ["b-1"] }),
	];

	it.each([
		["element", 1],
		["selection", 2],
		["track", 2],
		["project", 3],
	] as const)("applies the %s scope atomically", (scope, expectedCount) => {
		const result = applyCaptionStyleToTracks({
			tracks,
			selectedElements: [
				{ trackId: "captions-a", elementId: "a-1" },
				{ trackId: "captions-b", elementId: "b-1" },
			],
			trackId: "captions-a",
			elementId: "a-1",
			style: { fontSize: 72 },
			scope,
		});

		expect(result.updatedCount).toBe(expectedCount);
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.filter(
					(element) =>
						element.type === "captions" && element.style?.fontSize === 72
				)
		).toHaveLength(expectedCount);
	});

	it("preserves nested position values when applying a partial style", () => {
		const result = applyCaptionStyleToTracks({
			tracks,
			selectedElements: [],
			trackId: "captions-a",
			elementId: "a-1",
			style: {
				position: { align: "top", x: 24, y: 12 },
				fontColor: "#ff0000",
			},
			scope: "element",
		});
		const element = result.tracks[0]?.elements[0];

		expect(element?.type).toBe("captions");
		if (element?.type !== "captions") return;
		expect(element.style?.position).toEqual({ align: "top", x: 24, y: 12 });
		expect(element.style?.fontColor).toBe("#ff0000");
	});
});
