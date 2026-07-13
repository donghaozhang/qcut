import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platform } from "@qcut/platform-core";
import { useNativeVideoEnhancementPreview } from "../use-native-video-enhancement-preview";

vi.mock("@qcut/platform-core", () => ({ platform: vi.fn() }));

const renderVideoFramePreview = vi.fn();
const cancelVideoFramePreview = vi.fn();
const createObjectURL = vi.fn(() => "blob:native-enhancement");
const revokeObjectURL = vi.fn();

const neutralEnhancements = {
	stabilization: 0,
	denoise: 0,
	clarity: 25,
	upscale: 1 as const,
	relight: 0,
	beauty: 0,
};

function hookProps({
	enabled = true,
	currentTime = 0.4,
}: {
	enabled?: boolean;
	currentTime?: number;
} = {}) {
	return {
		enabled,
		elementId: "element-1",
		videoId: "video-1",
		sourcePath: "/tmp/source.mp4",
		currentTime,
		width: 1280,
		height: 720,
		fps: 30,
		fitMode: "cover" as const,
		enhancements: neutralEnhancements,
	};
}

describe("useNativeVideoEnhancementPreview", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.mocked(platform).mockReturnValue({
			isElectron: true,
			ffmpeg: {
				renderVideoFramePreview,
				cancelVideoFramePreview,
			},
		} as never);
		renderVideoFramePreview.mockImplementation(
			async ({ requestId }: { requestId: string }) => ({
				requestId,
				pngData: new Uint8Array([137, 80, 78, 71]),
				cacheHit: false,
				sourceTime: 0.4,
			})
		);
		cancelVideoFramePreview.mockResolvedValue(false);
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL = revokeObjectURL;
		const video = document.createElement("video");
		video.dataset.videoId = "video-1";
		Object.defineProperties(video, {
			readyState: { configurable: true, value: 2 },
			currentTime: { configurable: true, value: 0.4 },
			duration: { configurable: true, value: 1 },
			seeking: { configurable: true, value: false },
		});
		document.body.replaceChildren(video);
	});

	it("renders a bounded native frame and exposes the blob URL", async () => {
		const { result } = renderHook(() =>
			useNativeVideoEnhancementPreview(hookProps())
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(renderVideoFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceTime: 0.4,
				width: 960,
				height: 540,
				enhancements: neutralEnhancements,
			})
		);
		expect(result.current.url).toBe("blob:native-enhancement");
	});

	it("cancels a stale request when the playhead changes", async () => {
		let resolvePreview: ((value: unknown) => void) | undefined;
		renderVideoFramePreview.mockReturnValue(
			new Promise((resolve) => {
				resolvePreview = resolve;
			})
		);
		const { rerender } = renderHook(
			({ currentTime }) =>
				useNativeVideoEnhancementPreview(hookProps({ currentTime })),
			{ initialProps: { currentTime: 0.4 } }
		);
		await waitFor(() =>
			expect(renderVideoFramePreview).toHaveBeenCalledTimes(1)
		);
		rerender({ currentTime: 0.6 });
		expect(cancelVideoFramePreview).toHaveBeenCalledTimes(1);
		await act(async () => {
			resolvePreview?.({
				requestId: "stale",
				pngData: new Uint8Array([137, 80, 78, 71]),
				cacheHit: false,
				sourceTime: 0.4,
			});
		});
	});

	it("releases the previous frame after replacing it", async () => {
		createObjectURL
			.mockReturnValueOnce("blob:first-enhancement")
			.mockReturnValueOnce("blob:second-enhancement");
		const { result, rerender } = renderHook(
			({ currentTime }) =>
				useNativeVideoEnhancementPreview(hookProps({ currentTime })),
			{ initialProps: { currentTime: 0.4 } }
		);
		await waitFor(() =>
			expect(result.current.url).toBe("blob:first-enhancement")
		);
		rerender({ currentTime: 0.6 });
		await waitFor(() =>
			expect(result.current.url).toBe("blob:second-enhancement")
		);
		await waitFor(() =>
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:first-enhancement")
		);
	});

	it("does not invoke native FFmpeg when disabled", async () => {
		const { result } = renderHook(() =>
			useNativeVideoEnhancementPreview(hookProps({ enabled: false }))
		);
		expect(result.current.status).toBe("idle");
		expect(renderVideoFramePreview).not.toHaveBeenCalled();
	});

	it("adds the proxy trim offset when sampling the original source", async () => {
		const { result } = renderHook(() =>
			useNativeVideoEnhancementPreview({
				...hookProps(),
				sourceTimeOffset: 2,
			})
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));

		expect(renderVideoFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({ sourceTime: 2.4 })
		);
	});
});
