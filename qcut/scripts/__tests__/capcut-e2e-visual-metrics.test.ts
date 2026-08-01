import { describe, expect, it } from "vitest";
import {
	compareRgbBuffers,
	computeRgbErrorMetrics,
	DEFAULT_VISUAL_RMSE_THRESHOLD,
} from "../capcut-e2e/visual-metrics.js";

describe("CapCut E2E RGB visual metrics", () => {
	it("reports zero error for identical RGB24 pixels", () => {
		const pixels = Uint8Array.from([0, 128, 255, 4, 8, 16]);
		expect(
			computeRgbErrorMetrics({ actual: pixels, expected: pixels })
		).toEqual({
			channelSampleCount: 6,
			mae: 0,
			max: 0,
			p95: 0,
			pixelCount: 2,
			rmse: 0,
		});
	});

	it("computes MAE, RMSE, max, and nearest-rank p95 on RGB 0-255 channels", () => {
		const expected = Uint8Array.from([0, 0, 0, 0, 0, 0]);
		const actual = Uint8Array.from([0, 3, 4, 0, 0, 0]);
		expect(computeRgbErrorMetrics({ actual, expected })).toEqual({
			channelSampleCount: 6,
			mae: 1.166667,
			max: 4,
			p95: 4,
			pixelCount: 2,
			rmse: 2.041241,
		});
	});

	it("evaluates every sample independently against the locked default", () => {
		const expected = Uint8Array.from([0, 0, 0]);
		const passing = compareRgbBuffers({
			actual: Uint8Array.from([8, 8, 8]),
			expected,
		});
		const failing = compareRgbBuffers({
			actual: Uint8Array.from([9, 9, 9]),
			expected,
		});
		expect(DEFAULT_VISUAL_RMSE_THRESHOLD).toBe(8);
		expect(passing).toMatchObject({ pass: true, rmseThreshold: 8 });
		expect(failing).toMatchObject({ pass: false, rmseThreshold: 8 });
	});

	it("rejects empty or differently sized pixel buffers", () => {
		expect(() =>
			compareRgbBuffers({
				actual: new Uint8Array(),
				expected: new Uint8Array(),
			})
		).toThrow("equally sized, non-empty RGB24");
		expect(() =>
			compareRgbBuffers({
				actual: Uint8Array.from([0, 0, 0]),
				expected: Uint8Array.from([0, 0, 0, 0, 0, 0]),
			})
		).toThrow("equally sized, non-empty RGB24");
	});
});
