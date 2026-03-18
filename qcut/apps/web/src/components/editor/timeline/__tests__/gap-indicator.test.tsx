import "@/test/fix-radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GapIndicator } from "../gap-indicator";
import { useGapStore } from "@/stores/timeline/gap-store";

const mockPushHistory = vi.fn();
const mockRestoreTracks = vi.fn();

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

describe("GapIndicator", () => {
  const gap = {
    trackId: "track-1",
    startTime: 2,
    endTime: 5,
  };

  beforeEach(() => {
    mockPushHistory.mockReset();
    mockRestoreTracks.mockReset();
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
});
