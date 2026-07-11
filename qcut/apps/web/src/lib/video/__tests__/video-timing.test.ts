import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	getMediaSourcePlaybackTime,
	getMediaTimelineDuration,
	mapMediaSourceTime,
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

	it("maps long constant-speed clips without a frame-sampled curve", () => {
		const element = media({ duration: 3_000, playbackRate: 2 });
		expect(getMediaTimelineDuration(element)).toBe(1_500);
		expect(
			mapMediaTimelineTime({ element, localTimelineTime: 600 }).sourceTime
		).toBe(1_200);
	});

	it("maps timeline time to the trimmed source time used by preview and export", () => {
		const element = media({
			duration: 10,
			trimStart: 2,
			trimEnd: 2,
			playbackRate: 2,
		});
		expect(getMediaSourcePlaybackTime({ element, localTimelineTime: 2 })).toBe(
			6
		);
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

	it("maps absolute trimmed source timestamps back onto the timeline", () => {
		const element = media({ trimStart: 2, trimEnd: 2, playbackRate: 2 });
		expect(mapMediaSourceTime({ element, sourceTime: 6 })).toBeCloseTo(2);
	});

	it("maps source timestamps through reverse playback and freeze frames", () => {
		const element = media({
			duration: 10,
			reverse: true,
			freezeFrameTime: 3,
			freezeFrameDuration: 2,
		});
		expect(mapMediaSourceTime({ element, sourceTime: 9 })).toBeCloseTo(1);
		expect(mapMediaSourceTime({ element, sourceTime: 1 })).toBeCloseTo(11);
	});

	it("round-trips variable-speed source timestamps", () => {
		const element = media({
			duration: 4,
			trimStart: 0.5,
			trimEnd: 0.5,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.75, easing: "linear" },
				{ id: "fast", frame: 90, value: 2, easing: "linear" },
			],
		});
		const timelineTime = 1.2;
		const sourceTime =
			element.trimStart +
			mapMediaTimelineTime({ element, localTimelineTime: timelineTime })
				.sourceTime;
		expect(mapMediaSourceTime({ element, sourceTime })).toBeCloseTo(
			timelineTime,
			2
		);
	});
});
