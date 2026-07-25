import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QCUT_VIDEO_FRAME_EVENT } from "@/lib/preview/preview-health-events";
import type { MediaElement } from "@/types/timeline";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { VideoPlayer } from "../video-player";

vi.mock("@/stores/editor/playback-store", async () => {
	const { create } = await import("zustand");
	return {
		usePlaybackStore: create(() => ({
			currentTime: 0,
			isPlaying: false,
			speed: 1,
		})),
	};
});

vi.mock("@/lib/audio/use-media-audio-preview", () => ({
	useMediaAudioPreview: vi.fn(),
}));

function media({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "video",
		type: "media",
		mediaId: "asset",
		name: "Video",
		startTime: 10,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		playbackRate: 2,
		...overrides,
	};
}

describe("VideoPlayer", () => {
	beforeEach(() => {
		usePlaybackStore.setState({
			currentTime: 10.5,
			duration: 20,
			isPlaying: false,
			speed: 1,
		});
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("restores clip time and speed after metadata resets the video", () => {
		const element = media();
		const { container } = render(
			<VideoPlayer
				videoSource={{ type: "remote", src: "https://fal.media/video.mp4" }}
				clipStartTime={element.startTime}
				trimStart={element.trimStart}
				trimEnd={element.trimEnd}
				clipDuration={element.duration}
				clipPlaybackRate={element.playbackRate}
				timingElement={element}
			/>
		);
		const video = container.querySelector("video");
		expect(video).not.toBeNull();
		if (!video) return;

		video.currentTime = 0;
		video.playbackRate = 1;
		fireEvent.loadedMetadata(video);

		expect(video.currentTime).toBeCloseTo(1, 4);
		expect(video.playbackRate).toBe(2);
	});

	it("holds the first source frame during an incoming transition preroll", () => {
		const element = media();
		usePlaybackStore.setState({ currentTime: 9.8 });
		const { container } = render(
			<VideoPlayer
				videoSource={{ type: "remote", src: "https://fal.media/video.mp4" }}
				clipStartTime={element.startTime}
				trimStart={element.trimStart}
				trimEnd={element.trimEnd}
				clipDuration={element.duration}
				clipPlaybackRate={element.playbackRate}
				timingElement={element}
				playbackWindow={{ startTime: 9.75, endTime: 10.25 }}
			/>
		);
		const video = container.querySelector("video");
		expect(video).not.toBeNull();
		if (!video) return;

		video.currentTime = 3;
		fireEvent.loadedMetadata(video);

		expect(video.currentTime).toBe(0);
	});

	it("maps a trimmed proxy back to proxy-relative media time", () => {
		const element = media({
			overrides: { duration: 10, trimStart: 2, playbackRate: 1 },
		});
		const { container } = render(
			<VideoPlayer
				videoSource={{
					type: "remote",
					src: "app://video-preview-proxy/proxy.mp4",
				}}
				clipStartTime={element.startTime}
				trimStart={element.trimStart}
				trimEnd={element.trimEnd}
				clipDuration={element.duration}
				clipPlaybackRate={element.playbackRate}
				timingElement={element}
				sourceTimeOffset={2}
			/>
		);
		const video = container.querySelector("video");
		expect(video).not.toBeNull();
		if (!video) return;

		fireEvent.loadedMetadata(video);

		expect(video.currentTime).toBeCloseTo(0.5, 4);
	});

	it("marks a fallback frame as presented when frame callbacks are unavailable", () => {
		const element = media();
		const { container } = render(
			<VideoPlayer
				videoId="asset"
				videoSource={{ type: "remote", src: "https://fal.media/video.mp4" }}
				clipStartTime={element.startTime}
				trimStart={element.trimStart}
				trimEnd={element.trimEnd}
				clipDuration={element.duration}
				timingElement={element}
			/>
		);
		const video = container.querySelector("video");
		expect(video).not.toBeNull();
		if (!video) return;

		fireEvent.loadedData(video);

		expect(video.dataset.qcutPresentedFrames).toBe("1");
		expect(Number(video.dataset.qcutPresentedAt)).toBeGreaterThan(0);
	});

	it("resets frame timing across pause and resume", () => {
		const callbacks: VideoFrameRequestCallback[] = [];
		const requestDescriptor = Object.getOwnPropertyDescriptor(
			HTMLVideoElement.prototype,
			"requestVideoFrameCallback"
		);
		const cancelDescriptor = Object.getOwnPropertyDescriptor(
			HTMLVideoElement.prototype,
			"cancelVideoFrameCallback"
		);
		Object.defineProperty(
			HTMLVideoElement.prototype,
			"requestVideoFrameCallback",
			{
				configurable: true,
				value: vi.fn((callback: VideoFrameRequestCallback) => {
					callbacks.push(callback);
					return callbacks.length;
				}),
			}
		);
		Object.defineProperty(
			HTMLVideoElement.prototype,
			"cancelVideoFrameCallback",
			{
				configurable: true,
				value: vi.fn(),
			}
		);
		const presentedFrames: Array<{
			intervalMs: number | null;
			isActivePlaybackFrame: boolean;
		}> = [];
		const handleVideoFrame = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					intervalMs: number | null;
					isActivePlaybackFrame: boolean;
				}>
			).detail;
			presentedFrames.push({
				intervalMs: detail.intervalMs,
				isActivePlaybackFrame: detail.isActivePlaybackFrame,
			});
		};
		window.addEventListener(QCUT_VIDEO_FRAME_EVENT, handleVideoFrame);
		act(() => {
			usePlaybackStore.setState({ currentTime: 10.5, isPlaying: true });
		});

		const element = media();
		const { unmount } = render(
			<VideoPlayer
				videoId="asset"
				videoSource={{ type: "remote", src: "https://fal.media/video.mp4" }}
				clipStartTime={element.startTime}
				trimStart={element.trimStart}
				trimEnd={element.trimEnd}
				clipDuration={element.duration}
				timingElement={element}
			/>
		);
		const presentLatestFrame = ({
			timestamp,
			mediaTime,
			presentedFrames,
		}: {
			timestamp: number;
			mediaTime: number;
			presentedFrames: number;
		}) => {
			const callback = callbacks.at(-1);
			if (!callback) throw new Error("Video frame callback was not registered");
			callback(timestamp, {
				mediaTime,
				presentedFrames,
			} as VideoFrameCallbackMetadata);
		};

		try {
			act(() => {
				presentLatestFrame({
					timestamp: 1_000,
					mediaTime: 0,
					presentedFrames: 1,
				});
				presentLatestFrame({
					timestamp: 1_016,
					mediaTime: 0.016,
					presentedFrames: 2,
				});
			});
			expect(presentedFrames).toEqual([
				{ intervalMs: null, isActivePlaybackFrame: true },
				{ intervalMs: 16, isActivePlaybackFrame: true },
			]);

			act(() => {
				usePlaybackStore.setState({ isPlaying: false });
			});
			act(() => {
				presentLatestFrame({
					timestamp: 4_000,
					mediaTime: 0.016,
					presentedFrames: 2,
				});
			});
			expect(presentedFrames).toEqual([
				{ intervalMs: null, isActivePlaybackFrame: true },
				{ intervalMs: 16, isActivePlaybackFrame: true },
				{ intervalMs: null, isActivePlaybackFrame: false },
			]);

			act(() => {
				usePlaybackStore.setState({ isPlaying: true });
			});
			act(() => {
				presentLatestFrame({
					timestamp: 5_000,
					mediaTime: 0.032,
					presentedFrames: 3,
				});
			});
			expect(presentedFrames).toEqual([
				{ intervalMs: null, isActivePlaybackFrame: true },
				{ intervalMs: 16, isActivePlaybackFrame: true },
				{ intervalMs: null, isActivePlaybackFrame: false },
				{ intervalMs: null, isActivePlaybackFrame: true },
			]);
		} finally {
			unmount();
			window.removeEventListener(QCUT_VIDEO_FRAME_EVENT, handleVideoFrame);
			if (requestDescriptor) {
				Object.defineProperty(
					HTMLVideoElement.prototype,
					"requestVideoFrameCallback",
					requestDescriptor
				);
			} else {
				Reflect.deleteProperty(
					HTMLVideoElement.prototype,
					"requestVideoFrameCallback"
				);
			}
			if (cancelDescriptor) {
				Object.defineProperty(
					HTMLVideoElement.prototype,
					"cancelVideoFrameCallback",
					cancelDescriptor
				);
			} else {
				Reflect.deleteProperty(
					HTMLVideoElement.prototype,
					"cancelVideoFrameCallback"
				);
			}
		}
	});
});
