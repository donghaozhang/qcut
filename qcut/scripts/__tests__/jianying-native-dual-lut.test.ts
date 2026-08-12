import { describe, expect, it } from "vitest";
import {
	maskStatistics,
	mirrorFrame,
	parseNativeDualLutArgs,
	translateFrame,
} from "../jianying-filter-parity/run-native-dual-lut";

describe("Jianying native dual-LUT batch", () => {
	it("parses explicit evidence paths", () => {
		expect(
			parseNativeDualLutArgs({
				argv: ["--source", "/tmp/input.ppm", "--run-dir", "/tmp/run"],
			})
		).toEqual({ sourcePath: "/tmp/input.ppm", runDirectory: "/tmp/run" });
	});

	it("builds deterministic translated and mirrored frames", () => {
		const rgba = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255]);
		expect(
			Array.from(translateFrame({ rgba, width: 3, height: 1, offsetX: 1 }))
		).toEqual([1, 2, 3, 255, 1, 2, 3, 255, 4, 5, 6, 255]);
		expect(Array.from(mirrorFrame({ rgba, width: 3, height: 1 }))).toEqual([
			7, 8, 9, 255, 4, 5, 6, 255, 1, 2, 3, 255,
		]);
	});

	it("measures mask occupancy and edge energy", () => {
		expect(
			maskStatistics({
				bytes: new Uint8Array([0, 0, 255, 255]),
				width: 2,
				height: 2,
			})
		).toEqual({ mean: 127.5, nonZeroRatio: 0.5, edgeMean: 127.5 });
	});
});
