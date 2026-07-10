import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "../video-timing";

function media(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "video",
		type: "media",
		mediaId: "asset",
		name: "Video",
		startTime: 0,
		duration: 10,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("video timing", () => {
	it("changes timeline duration and source mapping at constant speed", () => {
		const element = media({ playbackRate: 2 });
		expect(getMediaTimelineDuration(element)).toBeCloseTo(5, 4);
		expect(
			mapMediaTimelineTime({ element, localTimelineTime: 2 }).sourceTime
		).toBeCloseTo(4, 2);
	});

	it("integrates speed keyframes", () => {
		const element = media({
			duration: 2,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 1, easing: "linear" },
				{ id: "fast", frame: 60, value: 2, easing: "linear" },
			],
		});
		const duration = getMediaTimelineDuration(element, 30);
		expect(duration).toBeGreaterThan(1);
		expect(duration).toBeLessThan(2);
	});

	it("maps reverse playback and inserted freeze duration", () => {
		const element = media({
			duration: 4,
			reverse: true,
			freezeFrameTime: 1,
			freezeFrameDuration: 2,
		});
		expect(getMediaTimelineDuration(element)).toBeCloseTo(6, 4);
		const frozen = mapMediaTimelineTime({ element, localTimelineTime: 2 });
		expect(frozen.isFrozen).toBe(true);
		expect(frozen.sourceTime).toBeCloseTo(3, 2);
	});
});
