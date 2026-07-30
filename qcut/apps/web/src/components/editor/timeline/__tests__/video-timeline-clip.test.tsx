import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const filmstripMocks = vi.hoisted(() => ({
	useFilmstripThumbnails: vi.fn(),
}));

vi.mock("@/hooks/timeline/use-filmstrip-thumbnails", () => ({
	useFilmstripThumbnails: filmstripMocks.useFilmstripThumbnails,
}));

vi.mock("../../audio-waveform", () => ({
	default: ({
		ariaLabel,
		sourceEnd,
		sourcePath,
		sourceStart,
	}: {
		ariaLabel?: string;
		sourceEnd?: number;
		sourcePath?: string;
		sourceStart?: number;
	}) => (
		<div
			data-testid="mock-video-audio-waveform"
			data-source-end={sourceEnd}
			data-source-path={sourcePath}
			data-source-start={sourceStart}
			aria-label={ariaLabel}
		/>
	),
}));

import { VideoTimelineClip } from "../video-timeline-clip";
import { getVideoClipLaneHeights } from "../video-timeline-clip-layout";

function renderVideoClip({
	thumbnailUrl = "blob:thumbnail",
}: {
	thumbnailUrl?: string;
} = {}) {
	return render(
		<VideoTimelineClip
			clipWidthPx={240}
			displayName="interview-camera-a.mp4"
			duration={12}
			mediaId="video-1"
			mediaDuration={12}
			mediaFile={
				new File(["video"], "interview-camera-a.mp4", {
					type: "video/mp4",
					lastModified: 456,
				})
			}
			mediaUrl="blob:video"
			sourcePath="/project/interview-camera-a.mp4"
			thumbnailStatus="ready"
			thumbnailUrl={thumbnailUrl}
			trackHeight={64}
			trimEnd={3}
			trimStart={2}
			zoomLevel={1}
		/>
	);
}

describe("VideoTimelineClip", () => {
	beforeEach(() => {
		filmstripMocks.useFilmstripThumbnails.mockReset();
		filmstripMocks.useFilmstripThumbnails.mockReturnValue({
			frames: [
				{ time: 3, url: "blob:frame-1" },
				{ time: 8, url: "blob:frame-2" },
			],
			isLoading: false,
			tileHeight: 34,
			tileWidth: 60,
		});
	});

	afterEach(() => vi.restoreAllMocks());

	it("renders filename, filmstrip, and a compressed video waveform lane", () => {
		renderVideoClip();

		expect(screen.getByTestId("timeline-video-name")).toHaveTextContent(
			"interview-camera-a.mp4"
		);
		expect(screen.getByTestId("timeline-video-name").style.height).toBe("16px");
		expect(screen.getByTestId("timeline-video-filmstrip").style.height).toBe(
			"34px"
		);
		expect(screen.getByTestId("timeline-video-filmstrip").style.top).toBe(
			"16px"
		);
		expect(screen.getByTestId("timeline-video-waveform").style.height).toBe(
			"14px"
		);
		expect(
			screen.getByTestId("timeline-video-waveform-centerline")
		).toBeInTheDocument();
		expect(screen.getByTestId("mock-video-audio-waveform")).toHaveAttribute(
			"data-source-start",
			"2"
		);
		expect(screen.getByTestId("mock-video-audio-waveform")).toHaveAttribute(
			"data-source-end",
			"9"
		);
		expect(screen.getByTestId("mock-video-audio-waveform")).toHaveAttribute(
			"data-source-path",
			"/project/interview-camera-a.mp4"
		);
		expect(
			screen.getByLabelText("Filmstrip thumbnails of interview-camera-a.mp4")
				.children
		).toHaveLength(2);
	});

	it("keeps all three lanes within compact and expanded track heights", () => {
		for (const trackHeight of [24, 64, 140]) {
			const lanes = getVideoClipLaneHeights({ trackHeight });
			expect(
				lanes.headerHeight + lanes.filmstripHeight + lanes.waveformHeight
			).toBe(trackHeight);
			expect(lanes.filmstripHeight).toBeGreaterThan(0);
		}
	});

	it("uses the rendered clip height instead of the nominal track height", async () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			bottom: 60,
			height: 60,
			left: 0,
			right: 240,
			top: 0,
			width: 240,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});

		renderVideoClip();

		await waitFor(() =>
			expect(screen.getByTestId("timeline-video-name").style.height).toBe(
				"15px"
			)
		);
		expect(screen.getByTestId("timeline-video-filmstrip").style.height).toBe(
			"32px"
		);
		expect(screen.getByTestId("timeline-video-waveform").style.height).toBe(
			"13px"
		);
	});

	it("uses the persisted thumbnail while detailed frames are unavailable", () => {
		filmstripMocks.useFilmstripThumbnails.mockReturnValue({
			frames: [],
			isLoading: true,
			tileHeight: 34,
			tileWidth: 60,
		});
		renderVideoClip();

		const thumbnail = screen.getByTestId("timeline-video-filmstrip")
			.firstChild as HTMLElement;
		expect(thumbnail.style.backgroundImage).toContain("blob:thumbnail");
	});
});
