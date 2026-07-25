import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	cropMediaSpeedKeyframes,
	cropMediaTiming,
	resizeMediaTiming,
	splitMediaTiming,
} from "../video-speed-edit";
import { getMediaTimelineDuration } from "../video-timing";

function media(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "video",
		type: "media",
		mediaId: "asset",
		name: "Video",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("video speed editing", () => {
	it("crops and shifts speed keyframes with interpolated boundaries", () => {
		const cropped = cropMediaSpeedKeyframes({
			keyframes: [
				{ id: "a", frame: 0, value: 1, easing: "linear" },
				{ id: "b", frame: 120, value: 3, easing: "linear" },
				{ id: "c", frame: 240, value: 1, easing: "easeOut" },
			],
			startSourceTime: 2,
			endSourceTime: 6,
			fps: 30,
		});

		expect(cropped).toHaveLength(3);
		expect(cropped?.map((keyframe) => keyframe.frame)).toEqual([0, 60, 120]);
		expect(cropped?.[0].value).toBeCloseTo(2);
		expect(cropped?.[2].value).toBeCloseTo(1.6307);
		expect(cropped?.[2].easing).toBe("easeOut");
	});

	it("preserves forward curve timing across a split", () => {
		const element = media({
			speedKeyframes: [
				{ id: "a", frame: 0, value: 1, easing: "linear" },
				{ id: "b", frame: 240, value: 2, easing: "linear" },
			],
		});
		const originalDuration = getMediaTimelineDuration(element);
		const split = splitMediaTiming({
			element,
			localTimelineTime: originalDuration * 0.4,
		});
		const left = { ...element, ...split.left };
		const right = { ...element, ...split.right };

		expect(split.left.trimStart).toBe(0);
		expect(split.right.trimEnd).toBe(0);
		expect(split.right.speedKeyframes?.[0].frame).toBe(0);
		expect(
			getMediaTimelineDuration(left) + getMediaTimelineDuration(right)
		).toBeCloseTo(originalDuration, 2);
	});

	it("trims the correct source edges when reverse playback is split", () => {
		const element = media({ reverse: true, playbackRate: 2 });
		const split = splitMediaTiming({ element, localTimelineTime: 1 });

		expect(split.left.trimStart).toBeCloseTo(6);
		expect(split.left.trimEnd).toBe(0);
		expect(split.right.trimStart).toBe(0);
		expect(split.right.trimEnd).toBeCloseTo(2);
	});

	it("divides a freeze window when the split occurs inside it", () => {
		const element = media({
			freezeFrameTime: 3,
			freezeFrameDuration: 2,
		});
		const split = splitMediaTiming({ element, localTimelineTime: 4 });
		const left = { ...element, ...split.left };
		const right = { ...element, ...split.right };

		expect(split.left.freezeFrameTime).toBeCloseTo(3);
		expect(split.left.freezeFrameDuration).toBeCloseTo(1);
		expect(split.right.freezeFrameTime).toBeCloseTo(0);
		expect(split.right.freezeFrameDuration).toBeCloseTo(1);
		expect(
			getMediaTimelineDuration(left) + getMediaTimelineDuration(right)
		).toBeCloseTo(getMediaTimelineDuration(element), 3);
	});

	it("moves a retained freeze point when the left edge is cropped", () => {
		const element = media({
			freezeFrameTime: 5,
			freezeFrameDuration: 1.5,
		});
		const updates = cropMediaTiming({
			element,
			startSourceTime: 2,
			endSourceTime: 8,
			startTimelineTime: 2,
			endTimelineTime: 9.5,
		});

		expect(updates.trimStart).toBe(2);
		expect(updates.freezeFrameTime).toBe(3);
		expect(updates.freezeFrameDuration).toBe(1.5);
	});

	it("maps a curve-aware right-edge trim through timeline time", () => {
		const element = media({
			speedKeyframes: [
				{ id: "a", frame: 0, value: 1, easing: "linear" },
				{ id: "b", frame: 240, value: 3, easing: "linear" },
			],
		});
		const originalDuration = getMediaTimelineDuration(element);
		const resized = resizeMediaTiming({
			element,
			side: "right",
			timelineDelta: -1,
		});
		const next = { ...element, ...resized.updates };

		expect(resized.updates.trimEnd).toBeGreaterThan(1);
		expect(resized.updates.speedKeyframes?.at(-1)?.frame).toBeCloseTo(
			(8 - (resized.updates.trimEnd ?? 0)) * 30
		);
		expect(getMediaTimelineDuration(next)).toBeCloseTo(originalDuration - 1, 1);
	});

	it("extends a left-trimmed curve at its boundary speed", () => {
		const element = media({
			trimStart: 2,
			speedKeyframes: [
				{ id: "a", frame: 0, value: 2, easing: "linear" },
				{ id: "b", frame: 180, value: 1, easing: "linear" },
			],
		});
		const resized = resizeMediaTiming({
			element,
			side: "left",
			timelineDelta: -0.5,
		});

		expect(resized.updates.trimStart).toBeCloseTo(1);
		expect(resized.startTimeDelta).toBeCloseTo(-0.5);
		expect(resized.updates.speedKeyframes?.[0]).toMatchObject({
			frame: 0,
			value: 2,
		});
		expect(resized.updates.speedKeyframes?.[1].frame).toBeCloseTo(30);
	});

	it("keeps reverse left-edge trim aligned with playback traversal", () => {
		const element = media({ reverse: true, playbackRate: 2 });
		const resized = resizeMediaTiming({
			element,
			side: "left",
			timelineDelta: 1,
		});

		expect(resized.updates.trimStart).toBe(0);
		expect(resized.updates.trimEnd).toBeCloseTo(2);
		expect(resized.startTimeDelta).toBe(1);
	});
});
