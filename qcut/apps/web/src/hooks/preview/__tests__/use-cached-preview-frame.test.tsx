import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QCUT_VIDEO_FRAME_EVENT } from "@/lib/preview/preview-health-events";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useCachedPreviewFrame } from "../use-cached-preview-frame";

const tracks: TimelineTrack[] = [];
const mediaItems: MediaItem[] = [];
const activeProject: TProject | null = null;

type GetCachedFrame = (
	time: number,
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	activeProject: TProject | null
) => ImageData | null;

function createImageData(): ImageData {
	return {
		data: new Uint8ClampedArray(8),
		width: 2,
		height: 1,
		colorSpace: "srgb",
	} as ImageData;
}

function CacheHarness({
	cacheIdentity = "preview-quality:smooth:viewport:2x1",
	getCachedFrame,
	isPlaying = false,
}: {
	cacheIdentity?: string;
	getCachedFrame: GetCachedFrame;
	isPlaying?: boolean;
}) {
	const { canvasRef, cachedFrameTime, isCachedFrameVisible, lookupStatus } =
		useCachedPreviewFrame({
			activeProject,
			cacheIdentity,
			getCachedFrame,
			isPlaying,
			mediaItems,
			tracks,
		});

	return (
		<canvas
			ref={canvasRef}
			data-testid="cache-overlay"
			data-cache-time={cachedFrameTime ?? ""}
			data-lookup={lookupStatus}
			data-visible={isCachedFrameVisible}
		/>
	);
}

function seek({ time }: { time: number }) {
	window.dispatchEvent(
		new CustomEvent("playback-seek", {
			detail: { time },
		})
	);
}

function presentVideoFrame({ timelineTime }: { timelineTime: number }) {
	window.dispatchEvent(
		new CustomEvent(QCUT_VIDEO_FRAME_EVENT, {
			detail: {
				isActivePlaybackFrame: false,
				intervalMs: 16,
				mediaTime: timelineTime,
				presentedFrames: 1,
				timelineTime,
			},
		})
	);
}

describe("useCachedPreviewFrame", () => {
	const putImageData = vi.fn();

	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			(() => ({
				putImageData,
			})) as unknown as HTMLCanvasElement["getContext"]
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		putImageData.mockReset();
	});

	it("paints a cache hit and hides it after the matching video frame arrives", () => {
		const getCachedFrame = vi.fn<GetCachedFrame>(() => createImageData());
		render(<CacheHarness getCachedFrame={getCachedFrame} />);

		act(() => seek({ time: 2 }));

		const overlay = screen.getByTestId("cache-overlay");
		expect(overlay).toHaveAttribute("data-lookup", "hit");
		expect(overlay).toHaveAttribute("data-visible", "true");
		expect(overlay).toHaveAttribute("data-cache-time", "2");
		expect(overlay).toHaveAttribute("width", "2");
		expect(overlay).toHaveAttribute("height", "1");
		expect(putImageData).toHaveBeenCalledOnce();

		act(() => {
			presentVideoFrame({ timelineTime: 3 });
			vi.advanceTimersByTime(200);
		});
		expect(overlay).toHaveAttribute("data-visible", "true");

		act(() => {
			presentVideoFrame({ timelineTime: 2 });
			vi.advanceTimersByTime(200);
		});
		expect(overlay).toHaveAttribute("data-visible", "false");
	});

	it("records a miss without showing a stale overlay", () => {
		const getCachedFrame = vi.fn<GetCachedFrame>(() => null);
		render(<CacheHarness getCachedFrame={getCachedFrame} />);

		act(() => seek({ time: 4 }));

		const overlay = screen.getByTestId("cache-overlay");
		expect(overlay).toHaveAttribute("data-lookup", "miss");
		expect(overlay).toHaveAttribute("data-visible", "false");
		expect(putImageData).not.toHaveBeenCalled();
	});

	it("clears a visible cache frame when playback starts", () => {
		const getCachedFrame = vi.fn<GetCachedFrame>(() => createImageData());
		const { rerender } = render(
			<CacheHarness getCachedFrame={getCachedFrame} />
		);

		act(() => seek({ time: 1 }));
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"true"
		);

		rerender(<CacheHarness getCachedFrame={getCachedFrame} isPlaying={true} />);
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"false"
		);
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-lookup",
			"idle"
		);
	});

	it("clears a visible cache frame when the cache identity changes", () => {
		const getCachedFrame = vi.fn<GetCachedFrame>(() => createImageData());
		const { rerender } = render(
			<CacheHarness getCachedFrame={getCachedFrame} />
		);

		act(() => seek({ time: 1 }));
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"true"
		);

		rerender(
			<CacheHarness
				cacheIdentity="preview-quality:low:viewport:2x1"
				getCachedFrame={getCachedFrame}
			/>
		);
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"false"
		);
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-lookup",
			"idle"
		);
	});

	it("removes the cached frame when no matching video frame arrives", () => {
		const getCachedFrame = vi.fn<GetCachedFrame>(() => createImageData());
		render(<CacheHarness getCachedFrame={getCachedFrame} />);

		act(() => seek({ time: 1 }));
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"true"
		);

		act(() => vi.advanceTimersByTime(1200));
		expect(screen.getByTestId("cache-overlay")).toHaveAttribute(
			"data-visible",
			"false"
		);
	});
});
