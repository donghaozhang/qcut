import { describe, expect, it } from "vitest";
import { resolveSpeedKeyframeMarks } from "../speed-keyframe-marks";
import type { MediaElement } from "@/types/timeline";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip",
		type: "media",
		mediaId: "media",
		name: "Clip",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("resolveSpeedKeyframeMarks", () => {
	it("returns nothing without a speed curve", () => {
		expect(resolveSpeedKeyframeMarks({ element: element() })).toEqual([]);
	});

	it("places boundary points at the clip edges", () => {
		const marks = resolveSpeedKeyframeMarks({
			element: element({
				speedKeyframes: [
					{ id: "start", frame: 0, value: 1, easing: "linear" },
					{ id: "end", frame: 240, value: 1, easing: "linear" },
				],
			}),
		});
		expect(marks.map((mark) => mark.ratio)).toEqual([0, 1]);
	});

	it("compresses fast sections so a mid-source point sits nearer the start", () => {
		const [, middle] = resolveSpeedKeyframeMarks({
			element: element({
				speedKeyframes: [
					{ id: "start", frame: 0, value: 4, easing: "linear" },
					{ id: "middle", frame: 120, value: 4, easing: "linear" },
					{ id: "end", frame: 240, value: 1, easing: "linear" },
				],
			}),
		});
		// The point sits halfway through the source, but that half plays at 4x, so
		// it occupies well under half of the clip.
		expect(middle.ratio).toBeLessThan(0.4);
		expect(middle.ratio).toBeGreaterThan(0);
	});

	it("offsets frames by the trim start and sorts by frame", () => {
		const marks = resolveSpeedKeyframeMarks({
			element: element({
				trimStart: 2,
				trimEnd: 1,
				speedKeyframes: [
					{ id: "end", frame: 150, value: 1, easing: "linear" },
					{ id: "start", frame: 0, value: 1, easing: "linear" },
				],
			}),
		});
		expect(marks.map((mark) => mark.id)).toEqual(["start", "end"]);
		expect(marks[0].ratio).toBe(0);
		expect(marks[1].ratio).toBe(1);
	});
});
