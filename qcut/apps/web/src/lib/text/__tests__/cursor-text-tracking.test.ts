import { describe, expect, it } from "vitest";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import { buildCursorTextTrackingKeyframes } from "../cursor-text-tracking";

const telemetry: CursorTelemetryData = {
	version: 1,
	captureRect: { x: 100, y: 50, width: 1000, height: 500 },
	points: [
		{ t: 0, x: 100, y: 50, p: false },
		{ t: 100, x: 200, y: 100, p: false },
		{ t: 250, x: 600, y: 300, p: false },
		{ t: 500, x: 1100, y: 550, p: false },
	],
};

describe("buildCursorTextTrackingKeyframes", () => {
	it("maps screen coordinates into center-relative canvas keyframes", () => {
		const result = buildCursorTextTrackingKeyframes({
			telemetry,
			canvasSize: { width: 1920, height: 1080 },
			elementStartTime: 0,
			elementDuration: 1,
			fps: 30,
			offset: { x: 0, y: 0 },
		});

		expect(result.x.map((keyframe) => keyframe.frame)).toEqual([0, 8, 15]);
		expect(result.x.map((keyframe) => keyframe.value)).toEqual([-960, 0, 960]);
		expect(result.y.map((keyframe) => keyframe.value)).toEqual([-540, 0, 540]);
	});

	it("only includes telemetry overlapping the text clip", () => {
		const result = buildCursorTextTrackingKeyframes({
			telemetry,
			canvasSize: { width: 1000, height: 500 },
			elementStartTime: 0.25,
			elementDuration: 0.25,
			fps: 30,
			offset: { x: 0, y: 0 },
			sampleIntervalMs: 0,
		});

		expect(result.x).toHaveLength(2);
		expect(result.x[0].frame).toBe(0);
		expect(result.x[1].frame).toBe(8);
	});
});
