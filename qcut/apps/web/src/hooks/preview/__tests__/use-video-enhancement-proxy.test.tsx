import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platform } from "@qcut/platform-core";
import {
	getVideoEnhancementProxyWindow,
	useVideoEnhancementProxy,
	videoEnhancementProxyDimensions,
} from "../use-video-enhancement-proxy";
import type { MediaElement } from "@/types/timeline";

vi.mock("@qcut/platform-core", () => ({ platform: vi.fn() }));

const renderVideoPreviewProxy = vi.fn();
const cancelVideoPreviewProxy = vi.fn();
const removeProgressListener = vi.fn();
let progressListener:
	| ((progress: {
			requestId: string;
			progress: number;
			processedSeconds: number;
			duration: number;
	  }) => void)
	| undefined;

const enhancements = {
	stabilization: 10,
	denoise: 20,
	clarity: 30,
	upscale: 1 as const,
	relight: 5,
	beauty: 0,
};

function hookProps({
	enabled = true,
	sourceStart = 1.5,
}: {
	enabled?: boolean;
	sourceStart?: number;
} = {}) {
	return {
		enabled,
		elementId: "element-1",
		sourcePath: "/tmp/source.mp4",
		sourceStart,
		sourceDuration: 4,
		sourceWidth: 1920,
		sourceHeight: 1080,
		fps: 30,
		enhancements,
	};
}

describe("useVideoEnhancementProxy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		progressListener = undefined;
		vi.mocked(platform).mockReturnValue({
			isElectron: true,
			ffmpeg: {
				renderVideoPreviewProxy,
				cancelVideoPreviewProxy,
				onVideoPreviewProxyProgress: (
					listener: NonNullable<typeof progressListener>
				) => {
					progressListener = listener;
					return removeProgressListener;
				},
			},
		} as never);
		renderVideoPreviewProxy.mockImplementation(
			async ({ requestId }: { requestId: string }) => ({
				requestId,
				proxyUrl: "app://video-preview-proxy/result.mp4",
				cacheKey: "result",
				cacheHit: false,
				sourceStart: 1.5,
				duration: 4,
				width: 960,
				height: 540,
				fileSize: 4096,
			})
		);
		cancelVideoPreviewProxy.mockResolvedValue(true);
	});

	it("bounds dimensions and exposes the playable proxy URL", async () => {
		const { result } = renderHook(() => useVideoEnhancementProxy(hookProps()));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(renderVideoPreviewProxy).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceStart: 1.5,
				sourceDuration: 4,
				width: 960,
				height: 540,
				enhancements,
			})
		);
		expect(result.current.url).toBe("app://video-preview-proxy/result.mp4");
		expect(result.current.sourceTimeOffset).toBe(1.5);
	});

	it("reports generation progress and cancels stale work", async () => {
		let resolveProxy: ((value: unknown) => void) | undefined;
		renderVideoPreviewProxy.mockReturnValue(
			new Promise((resolve) => {
				resolveProxy = resolve;
			})
		);
		const { result, rerender } = renderHook(
			({ sourceStart }) => useVideoEnhancementProxy(hookProps({ sourceStart })),
			{ initialProps: { sourceStart: 1.5 } }
		);
		await waitFor(() => expect(renderVideoPreviewProxy).toHaveBeenCalled());
		const requestId = renderVideoPreviewProxy.mock.calls[0]?.[0]?.requestId;
		act(() => {
			progressListener?.({
				requestId,
				progress: 0.42,
				processedSeconds: 1.68,
				duration: 4,
			});
		});
		expect(result.current.progress).toBe(0.42);

		rerender({ sourceStart: 2 });
		expect(cancelVideoPreviewProxy).toHaveBeenCalledWith(requestId);
		await act(async () => {
			resolveProxy?.({ requestId: "stale" });
		});
	});

	it("supports retry after a failed proxy job", async () => {
		renderVideoPreviewProxy.mockRejectedValueOnce(new Error("encode failed"));
		const { result } = renderHook(() => useVideoEnhancementProxy(hookProps()));
		await waitFor(() => expect(result.current.status).toBe("error"));

		act(() => result.current.retry());
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(renderVideoPreviewProxy).toHaveBeenCalledTimes(2);
	});

	it("does not generate proxies when disabled", () => {
		const { result } = renderHook(() =>
			useVideoEnhancementProxy(hookProps({ enabled: false }))
		);

		expect(result.current.status).toBe("idle");
		expect(renderVideoPreviewProxy).not.toHaveBeenCalled();
	});

	it("keeps aspect ratio while rounding dimensions for H.264", () => {
		expect(
			videoEnhancementProxyDimensions({ width: 853, height: 480 })
		).toEqual({ width: 854, height: 480 });
		expect(
			videoEnhancementProxyDimensions({ width: 1080, height: 1920 })
		).toEqual({ width: 540, height: 960 });
	});

	it("uses overlapping bounded chunks instead of transcoding a long clip", () => {
		const element: MediaElement = {
			id: "long-video",
			type: "media",
			mediaId: "media-1",
			name: "Long video",
			startTime: 10,
			duration: 100,
			trimStart: 5,
			trimEnd: 5,
		};

		expect(
			getVideoEnhancementProxyWindow({ element, currentTime: 16 })
		).toEqual({ sourceStart: 5, sourceDuration: 12 });
		expect(
			getVideoEnhancementProxyWindow({ element, currentTime: 27 })
		).toEqual({ sourceStart: 15, sourceDuration: 12 });
		expect(
			getVideoEnhancementProxyWindow({ element, currentTime: 100 })
		).toEqual({ sourceStart: 83, sourceDuration: 12 });
	});
});
