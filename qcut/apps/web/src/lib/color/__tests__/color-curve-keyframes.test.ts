import { describe, expect, it } from "vitest";
import {
	curveShapeAtFrame,
	resolveColorCurveShapes,
	upsertCurveShapeKeyframe,
} from "../color-curve-keyframes";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";

describe("color curve shape keyframes", () => {
	it("interpolates shapes with different control-point topologies", () => {
		const points = curveShapeAtFrame({
			base: [
				{ id: "black", x: 0, y: 0 },
				{ id: "white", x: 1, y: 1 },
			],
			keyframes: [
				{
					id: "start",
					frame: 0,
					points: [
						{ id: "black", x: 0, y: 0 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "linear",
				},
				{
					id: "end",
					frame: 20,
					points: [
						{ id: "black", x: 0, y: 0 },
						{ id: "middle", x: 0.5, y: 0.8 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "linear",
				},
			],
			frame: 10,
		});
		expect(points).toHaveLength(65);
		expect(points[32].x).toBe(0.5);
		expect(points[32].y).toBeCloseTo(0.65, 4);
	});

	it("preserves editable points at an exact keyframe", () => {
		const keyframePoints = [
			{ id: "start", x: 0, y: 0.5 },
			{ id: "picked", x: 0.4, y: 0.8 },
			{ id: "end", x: 1, y: 0.5 },
		];
		const points = curveShapeAtFrame({
			base: keyframePoints,
			keyframes: [
				{ id: "shape", frame: 12, points: keyframePoints, easing: "linear" },
			],
			frame: 12,
		});
		expect(points).toEqual(keyframePoints);
		expect(points).not.toBe(keyframePoints);
	});

	it("resolves RGB and secondary shapes into sampled settings", () => {
		const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		settings.curveShapeKeyframes = {
			"curves.master": [
				{
					id: "rgb",
					frame: 0,
					points: [
						{ id: "black", x: 0, y: 0.1 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "linear",
				},
			],
			"secondaryCurves.hueVsHue": [
				{
					id: "secondary",
					frame: 0,
					points: [
						{ id: "start", x: 0, y: 0.5 },
						{ id: "middle", x: 0.5, y: 0.75 },
						{ id: "end", x: 1, y: 0.5 },
					],
					easing: "linear",
				},
			],
		};
		const resolved = resolveColorCurveShapes({ settings, frame: 0 });
		expect(resolved.curves.master[0].y).toBe(0.1);
		expect(resolved.secondaryCurves.hueVsHue.samples[128]).toBe(0.75);
	});

	it("replaces an existing shape keyframe at the same frame", () => {
		const next = upsertCurveShapeKeyframe({
			keyframes: [
				{
					id: "old",
					frame: 10,
					points: [],
					easing: "linear",
				},
			],
			keyframe: {
				id: "new",
				frame: 10,
				points: [{ id: "point", x: 0, y: 0.5 }],
				easing: "easeInOut",
			},
		});
		expect(next).toHaveLength(1);
		expect(next[0].id).toBe("new");
	});
});
