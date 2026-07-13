import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
