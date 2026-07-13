import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	groupTimelineElements,
	moveTimelineElementGroup,
	ungroupTimelineElements,
} from "../timeline-group-operations";

const tracks: TimelineTrack[] = [
	{
		id: "video",
		name: "Video",
		type: "media",
		elements: [
			{
				id: "video-1",
				name: "Video",
				type: "media",
				mediaId: "media-1",
				startTime: 2,
				duration: 3,
				trimStart: 0,
				trimEnd: 0,
			},
		],
	},
	{
		id: "captions",
		name: "Captions",
		type: "captions",
		elements: [
			{
				id: "caption-1",
				name: "Caption",
				type: "captions",
				text: "Hello",
				language: "en",
				source: "manual",
				startTime: 3,
				duration: 1,
				trimStart: 0,
				trimEnd: 0,
			},
		],
	},
];

describe("timeline groups", () => {
	it("groups selected elements across tracks", () => {
		const result = groupTimelineElements({
			tracks,
			selectedElements: [
				{ trackId: "video", elementId: "video-1" },
				{ trackId: "captions", elementId: "caption-1" },
			],
			groupId: "group-1",
		});

		expect(result.groupedCount).toBe(2);
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.map((item) => item.groupId)
		).toEqual(["group-1", "group-1"]);
	});

	it("moves every group member by the same delta and clamps at zero", () => {
		const grouped = groupTimelineElements({
			tracks,
			selectedElements: [
				{ trackId: "video", elementId: "video-1" },
				{ trackId: "captions", elementId: "caption-1" },
			],
			groupId: "group-1",
		}).tracks;
		const moved = moveTimelineElementGroup({
			tracks: grouped,
			trackId: "captions",
			elementId: "caption-1",
			startTime: -10,
		});

		expect(
			moved.flatMap((track) => track.elements).map((item) => item.startTime)
		).toEqual([0, 1]);
	});

	it("ungroups every member without changing other element data", () => {
		const grouped = groupTimelineElements({
			tracks,
			selectedElements: [
				{ trackId: "video", elementId: "video-1" },
				{ trackId: "captions", elementId: "caption-1" },
			],
			groupId: "group-1",
		}).tracks;
		const result = ungroupTimelineElements({
			tracks: grouped,
			groupId: "group-1",
		});

		expect(result.ungroupedCount).toBe(2);
		expect(
			result.tracks
				.flatMap((track) => track.elements)
				.every((item) => !item.groupId)
		).toBe(true);
	});
});
