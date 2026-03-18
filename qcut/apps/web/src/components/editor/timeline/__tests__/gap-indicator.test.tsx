import "@/test/fix-radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GapIndicator } from "../gap-indicator";
import { useGapStore } from "@/stores/timeline/gap-store";

const mockPushHistory = vi.fn();
const mockRestoreTracks = vi.fn();
const mockPausePlayback = vi.fn();
const mockPlaybackState = {
	isPlaying: false,
	pause: mockPausePlayback,
};

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => ({
			_tracks: [
				{
					id: "track-1",
					name: "Track 1",
					type: "media",
					elements: [
						{
							id: "el-1",
							type: "media",
							mediaId: "media-1",
							name: "Clip 1",
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
						},
						{
							id: "el-2",
							type: "media",
							mediaId: "media-2",
							name: "Clip 2",
							startTime: 5,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
						},
					],
				},
			],
			pushHistory: mockPushHistory,
			restoreTracks: mockRestoreTracks,
		})),
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: {
		getState: vi.fn(() => mockPlaybackState),
	},
}));

describe("GapIndicator", () => {
	const gap = {
		trackId: "track-1",
		startTime: 2,
		endTime: 5,
	};

	beforeEach(() => {
		mockPushHistory.mockReset();
		mockRestoreTracks.mockReset();
		mockPausePlayback.mockReset();
		mockPlaybackState.isPlaying = false;
		useGapStore.getState().resetGapState();
		useGapStore.setState({
			gapModel: "fal-ai/ltx-video/v0.2.3",
			gapCameraMotion: "none",
			generatingGap: null,
		});
	});

	it("opens the gap menu on left click", async () => {
		render(<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />);

		fireEvent.click(screen.getByTestId("gap-indicator"));

		await waitFor(() => {
			expect(screen.getByText("Fill with Video")).toBeInTheDocument();
		});

		expect(useGapStore.getState().selectedGap).toEqual(gap);
	});

	it("opens the gap menu on right click", async () => {
		render(<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />);

		fireEvent.contextMenu(screen.getByTestId("gap-indicator"));

		await waitFor(() => {
			expect(screen.getByText("Close gap")).toBeInTheDocument();
		});

		expect(useGapStore.getState().selectedGap).toEqual(gap);
	});

	it("pauses playback before opening the gap menu", async () => {
		mockPlaybackState.isPlaying = true;

		render(<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />);

		fireEvent.contextMenu(screen.getByTestId("gap-indicator"));

		await waitFor(() => {
			expect(screen.getByText("Fill with Video")).toBeInTheDocument();
		});

		expect(mockPausePlayback).toHaveBeenCalledTimes(1);
	});

	it("closes the selected gap from the menu", async () => {
		render(<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />);

		fireEvent.contextMenu(screen.getByTestId("gap-indicator"));

		await waitFor(() => {
			expect(screen.getByText("Close gap")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Close gap"));

		expect(mockPushHistory).toHaveBeenCalledTimes(1);
		expect(mockRestoreTracks).toHaveBeenCalledTimes(1);
		expect(useGapStore.getState().selectedGap).toBeNull();
	});

	it("keeps the selected gap when starting generation", async () => {
		render(<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />);

		fireEvent.click(screen.getByTestId("gap-indicator"));

		await waitFor(() => {
			expect(screen.getByText("Fill with Image")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Fill with Video"));

		await waitFor(() => {
			expect(useGapStore.getState().gapGenerateMode).toBe("text-to-video");
		});

		expect(useGapStore.getState().selectedGap).toEqual(gap);
	});

	it("keeps menu clicks from bubbling back into the timeline", async () => {
		const parentClick = vi.fn();
		const parentPointerDown = vi.fn();

		render(
			<div onClick={parentClick} onPointerDown={parentPointerDown}>
				<GapIndicator gap={gap} trackHeight={48} zoomLevel={1} />
			</div>
		);

		fireEvent.click(screen.getByTestId("gap-indicator"));

		const fillWithVideo = await screen.findByText("Fill with Video");

		parentClick.mockClear();
		parentPointerDown.mockClear();

		fireEvent.pointerDown(fillWithVideo);
		fireEvent.click(fillWithVideo);

		expect(parentPointerDown).not.toHaveBeenCalled();
		expect(parentClick).not.toHaveBeenCalled();
	});
});
