import { describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	addAdjustmentLayer,
	adjustmentTrackInsertionIndex,
} from "../adjustment-layer";

function track(type: TimelineTrack["type"]): Pick<TimelineTrack, "type"> {
	return { type };
}

function timeline({
	totalDuration,
	elementId = "adjustment-element",
	tracks = [track("media")],
}: {
	totalDuration: number;
	elementId?: string | null;
	tracks?: Pick<TimelineTrack, "type">[];
}) {
	return {
		tracks: tracks as TimelineTrack[],
		insertTrackAt: vi.fn(() => "adjustment-track"),
		addElementToTrack: vi.fn(() => elementId),
		getTotalDuration: vi.fn(() => totalDuration),
	};
}

describe("adjustmentTrackInsertionIndex", () => {
	it("targets the slot directly above the topmost media track", () => {
		// Adjustment layers only grade tracks below them, so they must sit
		// above the media stack — but below text/sticker overlays.
		const index = adjustmentTrackInsertionIndex({
			tracks: [
				track("text"),
				track("sticker"),
				track("media"),
				track("media"),
				track("audio"),
			],
		});

		expect(index).toBe(2);
	});

	it("appends when the timeline has no media track", () => {
		expect(
			adjustmentTrackInsertionIndex({
				tracks: [track("text"), track("audio")],
			})
		).toBe(2);
		expect(adjustmentTrackInsertionIndex({ tracks: [] })).toBe(0);
	});
});

describe("addAdjustmentLayer", () => {
	it("creates an adjustment layer from the playhead to the project end", () => {
		const timelineApi = timeline({ totalDuration: 20 });
		const created = addAdjustmentLayer({
			timeline: timelineApi,
			currentTime: 8,
		});

		expect(created).toEqual({
			trackId: "adjustment-track",
			elementId: "adjustment-element",
		});
		expect(timelineApi.insertTrackAt).toHaveBeenCalledWith("adjustment", 0);
		expect(timelineApi.addElementToTrack).toHaveBeenCalledWith(
			"adjustment-track",
			expect.objectContaining({
				type: "adjustment",
				name: "Adjustment Layer",
				startTime: 8,
				duration: 12,
			}),
			{ pushHistory: false, selectElement: true }
		);
	});

	it("inserts the new track above the topmost media track, not at the bottom", () => {
		// Regression: addTrack used to append at the bottom of the timeline,
		// where the layer wraps nothing and grades nothing.
		const timelineApi = timeline({
			totalDuration: 20,
			tracks: [track("sticker"), track("media"), track("audio")],
		});

		addAdjustmentLayer({ timeline: timelineApi, currentTime: 0 });

		expect(timelineApi.insertTrackAt).toHaveBeenCalledWith("adjustment", 1);
	});

	it("uses the minimum duration when the playhead is past the project end", () => {
		const timelineApi = timeline({ totalDuration: 4 });
		addAdjustmentLayer({
			timeline: timelineApi,
			currentTime: 10,
			name: "自定义调节",
		});

		expect(timelineApi.addElementToTrack).toHaveBeenCalledWith(
			"adjustment-track",
			expect.objectContaining({
				name: "自定义调节",
				startTime: 10,
				duration: 5,
			}),
			{ pushHistory: false, selectElement: true }
		);
	});
});
