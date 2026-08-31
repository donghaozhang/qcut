import type { Mat } from "@techstark/opencv-js";
import { describe, expect, it, vi } from "vitest";
import {
	OpenCvPlanarTrackerKernel,
	type OpenCvPlanarRuntime,
} from "../opencv-planar-tracker-kernel";
import { DEFAULT_PLANAR_TRACKER_CONFIGURATION } from "../planar-tracker-protocol";

describe("OpenCvPlanarTrackerKernel lifecycle", () => {
	it("releases the seed Mat when mask allocation fails", () => {
		const deleteSeed = vi.fn();
		const seedGray = { delete: deleteSeed } as unknown as Mat;
		const allocationFailure = new Error("WASM allocation failed");
		let allocations = 0;
		const matFromArray = vi.fn((): Mat => {
			allocations += 1;
			if (allocations === 1) return seedGray;
			throw allocationFailure;
		});
		const kernel = new OpenCvPlanarTrackerKernel({
			cv: {
				CV_8UC1: 0,
				matFromArray,
			} as unknown as OpenCvPlanarRuntime,
		});

		expect(() =>
			kernel.begin({
				configuration: DEFAULT_PLANAR_TRACKER_CONFIGURATION,
				frame: {
					gray: new Uint8Array(4),
					height: 2,
					ptsUs: 0,
					width: 2,
				},
				seedQuad: {
					topLeft: { x: 0.1, y: 0.1 },
					topRight: { x: 0.9, y: 0.1 },
					bottomRight: { x: 0.9, y: 0.9 },
					bottomLeft: { x: 0.1, y: 0.9 },
				},
			})
		).toThrow(allocationFailure);
		expect(deleteSeed).toHaveBeenCalledOnce();
	});
});
