import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";
import {
	PERSPECTIVE_CORNERS,
	PERSPECTIVE_CORNER_MAX,
	PERSPECTIVE_CORNER_MIN,
	perspectiveCornerFromOffsetPercent,
	perspectiveCornerOffsetPercent,
	perspectiveFromLocalDelta,
} from "../media-perspective-geometry";

describe("perspectiveFromLocalDelta", () => {
	it("moves only the dragged corner, normalized by the box size", () => {
		const next = perspectiveFromLocalDelta({
			perspective: DEFAULT_MEDIA_PERSPECTIVE,
			corner: "topLeft",
			delta: { x: 96, y: 54 },
			width: 960,
			height: 540,
		});
		expect(next.topLeftX).toBeCloseTo(0.1);
		expect(next.topLeftY).toBeCloseTo(0.1);
		expect(next.topRightX).toBe(1);
		expect(next.bottomLeftY).toBe(1);
	});

	it("clamps corners to the supported travel range", () => {
		const next = perspectiveFromLocalDelta({
			perspective: DEFAULT_MEDIA_PERSPECTIVE,
			corner: "bottomRight",
			delta: { x: 5000, y: -5000 },
			width: 100,
			height: 100,
		});
		expect(next.bottomRightX).toBe(PERSPECTIVE_CORNER_MAX);
		expect(next.bottomRightY).toBe(PERSPECTIVE_CORNER_MIN);
	});

	it("ignores degenerate boxes", () => {
		expect(
			perspectiveFromLocalDelta({
				perspective: DEFAULT_MEDIA_PERSPECTIVE,
				corner: "topRight",
				delta: { x: 10, y: 10 },
				width: 0,
				height: 100,
			})
		).toBe(DEFAULT_MEDIA_PERSPECTIVE);
	});
});

describe("corner offset percent", () => {
	it("reads every resting corner as 0", () => {
		for (const field of PERSPECTIVE_CORNERS) {
			for (const key of [field.x, field.y]) {
				expect(
					perspectiveCornerOffsetPercent({
						perspective: DEFAULT_MEDIA_PERSPECTIVE,
						key,
					})
				).toBe(0);
			}
		}
	});

	it("round-trips offsets against the resting edge", () => {
		expect(
			perspectiveCornerFromOffsetPercent({ key: "bottomRightX", percent: -25 })
		).toBeCloseTo(0.75);
		expect(
			perspectiveCornerOffsetPercent({
				perspective: { ...DEFAULT_MEDIA_PERSPECTIVE, bottomRightX: 0.75 },
				key: "bottomRightX",
			})
		).toBe(-25);
		expect(
			perspectiveCornerFromOffsetPercent({ key: "topLeftY", percent: 40 })
		).toBeCloseTo(0.4);
	});
});
