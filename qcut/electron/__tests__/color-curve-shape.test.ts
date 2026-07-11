import { describe, expect, it } from "vitest";
import {
	curveShapeEasingAtFrame,
	curveShapeFrames,
	resolveVideoCurveShapes,
} from "../ffmpeg/color-curve-shape";
import { DEFAULT_VIDEO_COLOR_SETTINGS } from "../ffmpeg/color-settings";

describe("native color curve shape keyframes", () => {
	it("resolves different point topologies and secondary samples", () => {
		const color = structuredClone(DEFAULT_VIDEO_COLOR_SETTINGS);
		color.curveShapeKeyframes = {
			"curves.master": [
				{
					id: "rgb-start",
					frame: 0,
					points: [
						{ id: "black", x: 0, y: 0 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "linear",
				},
				{
					id: "rgb-end",
					frame: 20,
					points: [
						{ id: "black", x: 0, y: 0 },
						{ id: "middle", x: 0.5, y: 0.8 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "easeInOut",
				},
			],
			"secondaryCurves.hueVsSaturation": [
				{
					id: "secondary-start",
					frame: 0,
					points: [
						{ id: "start", x: 0, y: 0.5 },
						{ id: "end", x: 1, y: 0.5 },
					],
					samples: new Array<number>(257).fill(0.5),
					easing: "linear",
				},
				{
					id: "secondary-end",
					frame: 20,
					points: [
						{ id: "start", x: 0, y: 0.5 },
						{ id: "middle", x: 0.5, y: 0.8 },
						{ id: "end", x: 1, y: 0.5 },
					],
					samples: Array.from(
						{ length: 257 },
						(_, index) =>
							0.5 + Math.max(0, 1 - Math.abs(index / 256 - 0.5) * 10) * 0.3
					),
					easing: "easeInOut",
				},
			],
		};
		const resolved = resolveVideoCurveShapes({ color, frame: 10 });
		expect(resolved.curves.master).toHaveLength(65);
		expect(resolved.curves.master[32].y).toBeCloseTo(0.65, 4);
		expect(resolved.secondaryCurves.hueVsSaturation.samples[128]).toBeCloseTo(
			0.65,
			4
		);
		expect(curveShapeFrames({ color, prefix: "curves." })).toEqual([0, 20]);
		expect(
			curveShapeEasingAtFrame({ color, prefix: "curves.", frame: 20 })
		).toBe("easeInOut");
	});
});
