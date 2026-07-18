import { describe, expect, it, vi } from "vitest";
import type { TimelineStore } from "@/stores/timeline/types";
import { addAdjustmentLayer } from "../adjustment-layer";

function timeline({
	totalDuration,
	elementId = "adjustment-element",
}: {
	totalDuration: number;
	elementId?: string | null;
}) {
	return {
		addTrack: vi.fn(() => "adjustment-track"),
		addElementToTrack: vi.fn(() => elementId),
		getTotalDuration: vi.fn(() => totalDuration),
	};
}

describe("addAdjustmentLayer", () => {
	it("creates an adjustment layer from the playhead to the project end", () => {
		const timelineApi = timeline({ totalDuration: 20 });
		const created = addAdjustmentLayer({
			timeline: timelineApi as Pick<
				TimelineStore,
				"addTrack" | "addElementToTrack" | "getTotalDuration"
			>,
			currentTime: 8,
		});

		expect(created).toEqual({
			trackId: "adjustment-track",
			elementId: "adjustment-element",
		});
		expect(timelineApi.addTrack).toHaveBeenCalledWith("adjustment");
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

	it("uses the minimum duration when the playhead is past the project end", () => {
		const timelineApi = timeline({ totalDuration: 4 });
		addAdjustmentLayer({
			timeline: timelineApi as Pick<
				TimelineStore,
				"addTrack" | "addElementToTrack" | "getTotalDuration"
			>,
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
