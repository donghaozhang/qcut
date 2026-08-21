import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QCUT_VIDEO_FRAME_EVENT } from "@/lib/preview/preview-health-events";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { usePlaybackHealthPreviewQuality } from "../use-playback-health-preview-quality";

function PlaybackHealthHarness() {
	usePlaybackHealthPreviewQuality();
	return null;
}

function presentStalledFrames({
	isActivePlaybackFrame,
}: {
	isActivePlaybackFrame: boolean;
}) {
	for (let index = 0; index < 5; index += 1) {
		window.dispatchEvent(
			new CustomEvent(QCUT_VIDEO_FRAME_EVENT, {
				detail: {
					videoId: "clip-1",
					isActivePlaybackFrame,
					intervalMs: 95,
					mediaTime: index / 10,
					presentedFrames: index + 1,
					timelineTime: index / 10,
				},
			})
		);
	}
}

describe("usePlaybackHealthPreviewQuality", () => {
	let nowValue = 0;

	beforeEach(() => {
		nowValue = 0;
		vi.spyOn(performance, "now").mockImplementation(() => nowValue);
		usePlaybackStore.setState({
			isPlaying: true,
			previewQuality: "auto",
			runtimePreviewQuality: null,
			runtimePreviewQualityDiagnostic: null,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("ignores inactive video frames when adapting preview quality", () => {
		render(<PlaybackHealthHarness />);
		// Skip past the playback-start warmup window.
		nowValue = 5000;

		act(() => presentStalledFrames({ isActivePlaybackFrame: false }));
		expect(usePlaybackStore.getState().runtimePreviewQuality).toBeNull();
		expect(
			usePlaybackStore.getState().runtimePreviewQualityDiagnostic
		).toBeNull();

		act(() => presentStalledFrames({ isActivePlaybackFrame: true }));
		expect(usePlaybackStore.getState().runtimePreviewQuality).toBe("low");
		expect(
			usePlaybackStore.getState().runtimePreviewQualityDiagnostic?.reason
		).toBe("video-frame");
	});
});
