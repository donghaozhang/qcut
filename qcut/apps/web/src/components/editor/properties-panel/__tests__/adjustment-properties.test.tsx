import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineStore } from "@/stores/timeline/types";
import type { AdjustmentElement } from "@/types/timeline";
import { AdjustmentProperties } from "../adjustment-properties";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

const adjustment: AdjustmentElement = {
	id: "adjustment-1",
	type: "adjustment",
	name: "调节1",
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	opacity: 1,
};

describe("AdjustmentProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		usePlaybackStore.setState({ currentTime: 1 });
		useProjectStore.setState({
			activeProject: { fps: 30 } as ReturnType<
				typeof useProjectStore.getState
			>["activeProject"],
		});
	});

	it("writes color settings to the selected adjustment layer", () => {
		const updateAdjustmentElement = vi.fn();
		useTimelineStore.setState({
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties element={adjustment} trackId="adjustment-track" />
		);
		fireEvent.click(screen.getByLabelText("启用调节"));

		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({ enabled: false }),
			}),
			true
		);
	});
});
