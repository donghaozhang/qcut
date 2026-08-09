import { describe, expect, it } from "vitest";
import {
	buildPreviewFrameComparisonSummary,
	buildPreviewFrameSetEvidence,
	getPreviewFrameFileName,
	type PreviewFrameSampleOutcome,
} from "../capcut-e2e/preview-frame-comparison.js";
import type { RgbImageComparison } from "../capcut-e2e/visual-ffmpeg.js";

function comparison({ pass, rmse }: { pass: boolean; rmse: number }) {
	return {
		actualGeometry: { height: 720, width: 1280 },
		dimensionsMatch: true,
		expectedGeometry: { height: 720, width: 1280 },
		metrics: {
			channelSampleCount: 2_764_800,
			mae: rmse,
			max: Math.ceil(rmse),
			p95: Math.ceil(rmse),
			pixelCount: 921_600,
			rmse,
		},
		pass,
		rmseThreshold: 8,
	} satisfies RgbImageComparison;
}

function outcome({
	frameIndex,
	leftSha = "a".repeat(64),
	result = comparison({ pass: true, rmse: 0 }),
	rightSha = "b".repeat(64),
}: {
	frameIndex: number;
	leftSha?: string;
	result?: RgbImageComparison;
	rightSha?: string;
}): PreviewFrameSampleOutcome {
	return {
		comparison: result,
		leftFrame: { bytes: 100 + frameIndex, sha256: leftSha },
		rightFrame: { bytes: 200 + frameIndex, sha256: rightSha },
		sample: {
			frameIndex,
			reasons: [{ kind: frameIndex === 0 ? "project-first" : "project-last" }],
			timestampUs: frameIndex * 33_333,
		},
	};
}

describe("CapCut E2E preview frame comparison", () => {
	it("uses a fixed path-safe file name for every sampled frame", () => {
		expect(getPreviewFrameFileName({ frameIndex: 0 })).toBe(
			"frame-00000000.png"
		);
		expect(getPreviewFrameFileName({ frameIndex: 12_345 })).toBe(
			"frame-00012345.png"
		);
		expect(() => getPreviewFrameFileName({ frameIndex: -1 })).toThrow(
			"non-negative integer"
		);
	});

	it("builds an order-independent path-free sample-set digest", () => {
		const frames = [
			{ file: { bytes: 20, sha256: "b".repeat(64) }, frameIndex: 2 },
			{ file: { bytes: 10, sha256: "a".repeat(64) }, frameIndex: 1 },
		];
		const forward = buildPreviewFrameSetEvidence({ frames });
		const reverse = buildPreviewFrameSetEvidence({
			frames: [...frames].reverse(),
		});

		expect(forward).toEqual(reverse);
		expect(forward.availableSampleCount).toBe(2);
		expect(forward.sampleSetSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(JSON.stringify(forward)).not.toContain("/");
	});

	it("distinguishes passing, failing, and incomplete frame sets", () => {
		const passing = buildPreviewFrameComparisonSummary({
			expectedSampleCount: 2,
			outcomes: [outcome({ frameIndex: 0 }), outcome({ frameIndex: 179 })],
		});
		expect(passing).toMatchObject({
			checks: {
				comparedSampleCountMatch: true,
				leftPlanCoverage: true,
				rightPlanCoverage: true,
			},
			missing: [],
			verdict: "pass",
		});

		const failing = buildPreviewFrameComparisonSummary({
			expectedSampleCount: 1,
			outcomes: [
				outcome({
					frameIndex: 0,
					result: comparison({ pass: false, rmse: 12 }),
				}),
			],
		});
		expect(failing).toMatchObject({
			failureReason: "One or more preview frame comparisons failed.",
			verdict: "fail",
		});

		const incompleteOutcome = outcome({ frameIndex: 0 });
		incompleteOutcome.rightFrame = undefined;
		incompleteOutcome.comparison = undefined;
		const incomplete = buildPreviewFrameComparisonSummary({
			expectedSampleCount: 1,
			outcomes: [incompleteOutcome],
		});
		expect(incomplete).toMatchObject({
			checks: {
				comparedSampleCountMatch: false,
				leftPlanCoverage: true,
				rightPlanCoverage: false,
			},
			missing: [{ frameIndex: 0, sides: ["right"] }],
			notComparableReason: "Preview frame sets do not cover the sample plan.",
			verdict: "not-comparable",
		});
	});
});
