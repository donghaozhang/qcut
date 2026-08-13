import { describe, expect, test } from "bun:test";

import {
	classifyTextParityMetrics,
	summarizeTextParityForeground,
} from "./text-parity-media";
import type { TextForegroundDifferenceMetrics } from "./text-parity-foreground";

const thresholds = {
	fullFrameRmse: 4,
	foregroundRmse: 8,
	maskIou: 0.98,
	geometryPixels: 2,
};

function foregroundMetrics({
	centroidDistance = 0,
	foregroundRmse = 0,
	maskIou = 1,
	maximumBoundsDelta = 0,
}: {
	centroidDistance?: number;
	foregroundRmse?: number;
	maskIou?: number;
	maximumBoundsDelta?: number;
} = {}): TextForegroundDifferenceMetrics {
	const bounds = { x: 0, y: 0, width: 1, height: 1, visiblePixels: 1 };
	return {
		backgroundThreshold: 8,
		unionBounds: bounds,
		referenceBounds: bounds,
		candidateBounds: bounds,
		referenceVisiblePixels: 1,
		candidateVisiblePixels: 1,
		unionVisiblePixels: 1,
		intersectionVisiblePixels: 1,
		maskIou,
		centroidDistance,
		maximumBoundsDelta,
		roiMae: 0,
		roiRmse: 0,
		foregroundMae: 0,
		foregroundRmse,
	};
}

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

describe("summarizeTextParityForeground", () => {
	test("rejects a comparison without frame evidence", () => {
		expect(() => summarizeTextParityForeground({ samples: [] })).toThrow(
			"produced no frame samples"
		);
	});

	test("aggregates foreground and geometry evidence", () => {
		const summary = summarizeTextParityForeground({
			samples: [
				{
					foreground: foregroundMetrics({ foregroundRmse: 2, maskIou: 0.9 }),
					geometry: foregroundMetrics({
						centroidDistance: 1,
						maximumBoundsDelta: 3,
					}),
				},
				{
					foreground: foregroundMetrics({ foregroundRmse: 4, maskIou: 0.8 }),
					geometry: foregroundMetrics({
						centroidDistance: 5,
						maximumBoundsDelta: 2,
					}),
				},
			],
		});

		expect(summary).toEqual({
			meanRmse: 3,
			worstRmse: 4,
			minimumMaskIou: 0.8,
			maximumCentroidDistance: 5,
			maximumBoundsDelta: 3,
		});
	});
});
