import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { resolveAudioPreviewTiming } from "../audio-preview-timing";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "audio",
		type: "media",
		mediaId: "source",
		name: "Audio",
		startTime: 5,
		duration: 12,
		trimStart: 2,
		trimEnd: 2,
		playbackRate: 2,
		...overrides,
	};
}

describe("audio preview timing", () => {
	it("combines clip and transport speed", () => {
		const timing = resolveAudioPreviewTiming({
			element: element(),
			timelineTime: 6,
			playbackSpeed: 1.5,
		});
		expect(timing.mediaTime).toBe(4);
		expect(timing.playbackRate).toBe(3);
		expect(timing.timelineDuration).toBe(4);
	});

	it("maps reverse playback into the reversed preview source", () => {
		const source = element({ reverse: true, playbackRate: 1 });
		expect(
			resolveAudioPreviewTiming({
				element: source,
				timelineTime: 5,
				playbackSpeed: 1,
			}).mediaTime
		).toBe(2);
		expect(
			resolveAudioPreviewTiming({
				element: source,
				timelineTime: 13,
				playbackSpeed: 1,
			}).mediaTime
		).toBe(10);
	});

	it("resolves speed curves at the current source position", () => {
		const source = element({
			playbackRate: 1,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.5, easing: "linear" },
				{ id: "fast", frame: 240, value: 2, easing: "linear" },
			],
		});
		const start = resolveAudioPreviewTiming({
			element: source,
			timelineTime: 5,
			playbackSpeed: 1,
		});
		const end = resolveAudioPreviewTiming({
			element: source,
			timelineTime: 20,
			playbackSpeed: 1,
		});
		expect(start.playbackRate).toBeCloseTo(0.5, 1);
		expect(end.playbackRate).toBeCloseTo(2, 1);
	});
});
