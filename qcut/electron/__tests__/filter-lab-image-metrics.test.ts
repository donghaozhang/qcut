// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	measureFilterLabFrames,
	measureFilterLabMasks,
	measureFilterLabTemporalFrames,
} from "../native-pipeline/filters/filter-lab-image-metrics.js";

function rgbFrame({ value }: { value: number }) {
	return {
		width: 8,
		height: 8,
		pixels: new Uint8Array(8 * 8 * 3).fill(value),
	};
}

describe("Filter Lab image metrics", () => {
	it("reports exact parity for identical RGB frames", () => {
		const frame = rgbFrame({ value: 128 });
		expect(
			measureFilterLabFrames({ reference: frame, candidate: frame })
		).toEqual({
			rgbRmse: 0,
			psnr: 100,
			ssim: 1,
			deltaE: 0,
			deltaESamples: 64,
		});
	});

	it("measures channel-level error and perceptual degradation", () => {
		const result = measureFilterLabFrames({
			reference: rgbFrame({ value: 100 }),
			candidate: rgbFrame({ value: 110 }),
		});
		expect(result.rgbRmse).toBe(10);
		expect(result.psnr).toBeCloseTo(28.1308, 3);
		expect(result.ssim).toBeLessThan(1);
		expect(result.deltaE).toBeGreaterThan(0);
	});

	it("compares mask coverage and edge weights", () => {
		const reference = {
			width: 3,
			height: 3,
			pixels: new Uint8Array([0, 0, 0, 0, 255, 255, 0, 255, 255]),
		};
		const identical = measureFilterLabMasks({
			reference,
			candidate: reference,
		});
		expect(identical).toEqual({ maskIou: 1, maskMae: 0, maskEdgeMae: 0 });
		const empty = measureFilterLabMasks({
			reference,
			candidate: { ...reference, pixels: new Uint8Array(9) },
		});
		expect(empty.maskIou).toBe(0);
		expect(empty.maskMae).toBeGreaterThan(0);
		expect(empty.maskEdgeMae).toBeGreaterThan(0);
	});

	it("separates frame mismatch from motion mismatch", () => {
		const black = new Uint8Array(12);
		const gray = new Uint8Array(12).fill(30);
		const white = new Uint8Array(12).fill(255);
		const result = measureFilterLabTemporalFrames({
			referenceFrames: [black, gray, gray],
			candidateFrames: [black, gray, white],
		});
		expect(result.frameCount).toBe(3);
		expect(result.temporalRmse).toBeGreaterThan(0);
		expect(result.temporalRmseMax).toBe(225);
		expect(result.temporalMotionDelta).toBeGreaterThan(0);
	});
});
