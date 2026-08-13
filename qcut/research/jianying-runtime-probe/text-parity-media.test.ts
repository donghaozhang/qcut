import { describe, expect, test } from "bun:test";

import { classifyTextParityMetrics } from "./text-parity-media";

const thresholds = {
	fullFrameRmse: 4,
	foregroundRmse: 8,
	maskIou: 0.98,
	geometryPixels: 2,
};

describe("classifyTextParityMetrics", () => {
	test("requires appearance, mask, and geometry to pass together", () => {
		expect(
			classifyTextParityMetrics({
				metrics: {
					fullFrameRmse: 2,
					foregroundRmse: 5,
					maskIou: 0.985,
					centroidDistance: 1,
					maximumBoundsDelta: 2,
				},
				thresholds,
			})
		).toBe("pass");
	});

	test("does not let a low full-frame score hide shifted text", () => {
		expect(
			classifyTextParityMetrics({
				metrics: {
					fullFrameRmse: 1,
					foregroundRmse: 7,
					maskIou: 0.72,
					centroidDistance: 8,
					maximumBoundsDelta: 8,
				},
				thresholds,
			})
		).toBe("fail");
	});

	test("keeps a bounded tolerance band distinct from a pass", () => {
		expect(
			classifyTextParityMetrics({
				metrics: {
					fullFrameRmse: 6,
					foregroundRmse: 12,
					maskIou: 0.9,
					centroidDistance: 3,
					maximumBoundsDelta: 4,
				},
				thresholds,
			})
		).toBe("near");
	});
});
