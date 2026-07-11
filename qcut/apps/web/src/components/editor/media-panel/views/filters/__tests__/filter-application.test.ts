import { describe, expect, it, vi } from "vitest";
import type { TimelineStore } from "@/stores/timeline/types";
import type { TimelineTrack } from "@/types/timeline";
import { updateSelectedMediaColors } from "../filter-application";

function timelineTracks(): TimelineTrack[] {
	return [
		{
			id: "media-track",
			name: "Media",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "image-1",
					type: "media",
					mediaId: "asset-1",
					name: "Image 1",
					duration: 3,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "video-2",
					type: "media",
					mediaId: "asset-2",
					name: "Video 2",
					duration: 3,
					startTime: 3,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
	];
}

describe("filter application", () => {
	it("updates every selected media clip with one undo checkpoint", () => {
		const pushHistory = vi.fn();
		const updateMediaElement = vi.fn();
		const updated = updateSelectedMediaColors({
			timeline: {
				tracks: timelineTracks(),
				selectedElements: [
					{ trackId: "media-track", elementId: "image-1" },
					{ trackId: "media-track", elementId: "video-2" },
				],
				pushHistory,
				updateMediaElement:
					updateMediaElement as TimelineStore["updateMediaElement"],
			},
			history: true,
			transform: ({ settings }) => ({
				...settings,
				filter: { presetId: "vivid", presetVersion: 1, intensity: 80 },
			}),
		});

		expect(updated).toBe(2);
		expect(pushHistory).toHaveBeenCalledTimes(1);
		expect(updateMediaElement).toHaveBeenCalledTimes(2);
		expect(updateMediaElement).toHaveBeenNthCalledWith(
			1,
			"media-track",
			"image-1",
			expect.objectContaining({
				color: expect.objectContaining({
					filter: { presetId: "vivid", presetVersion: 1, intensity: 80 },
				}),
			}),
			false
		);
	});

	it("does not create history when no media clip is selected", () => {
		const pushHistory = vi.fn();
		const updated = updateSelectedMediaColors({
			timeline: {
				tracks: timelineTracks(),
				selectedElements: [],
				pushHistory,
				updateMediaElement: vi.fn() as TimelineStore["updateMediaElement"],
			},
			history: true,
			transform: ({ settings }) => settings,
		});

		expect(updated).toBe(0);
		expect(pushHistory).not.toHaveBeenCalled();
	});
});
