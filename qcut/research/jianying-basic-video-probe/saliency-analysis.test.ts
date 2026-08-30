import { describe, expect, test } from "bun:test";
import {
	analyzeSaliencyMask,
	buildSmartMotionKeyframes,
} from "./saliency-analysis";

describe("analyzeSaliencyMask", () => {
	test("returns normalized subject and crop bounds", () => {
		const mask = new Uint8Array(8 * 6);
		for (let y = 2; y <= 3; y += 1) {
			for (let x = 2; x <= 5; x += 1) mask[y * 8 + x] = 255;
		}

		const result = analyzeSaliencyMask({
			mask,
			width: 8,
			height: 6,
			paddingRatio: 0,
			targetAspectRatio: 1,
		});

		expect(result.activePixelCount).toBe(8);
		expect(result.centroid.x).toBeCloseTo(3.5 / 8);
		expect(result.centroid.y).toBeCloseTo(2.5 / 6);
		expect(result.subjectBounds).toEqual({
			x: 0.25,
			y: 2 / 6,
			width: 0.5,
			height: 2 / 6,
		});
		expect(result.recommendedCrop.width).toBeCloseTo(0.5);
		expect(result.recommendedCrop.height).toBeCloseTo(0.5);
	});

	test("rejects an empty mask", () => {
		expect(() =>
			analyzeSaliencyMask({ mask: new Uint8Array(4), width: 2, height: 2 })
		).toThrow("no foreground pixels");
	});
});

describe("buildSmartMotionKeyframes", () => {
	test("sorts and smooths observations", () => {
		const first = analyzeSaliencyMask({
			mask: new Uint8Array([255, 0, 0, 0]),
			width: 2,
			height: 2,
			paddingRatio: 0,
		});
		const second = analyzeSaliencyMask({
			mask: new Uint8Array([0, 0, 0, 255]),
			width: 2,
			height: 2,
			paddingRatio: 0,
		});

		const keyframes = buildSmartMotionKeyframes({
			observations: [
				{ timestampSeconds: 1, analysis: second },
				{ timestampSeconds: 0, analysis: first },
			],
			smoothing: 0.5,
		});

		expect(keyframes.map(({ timestampSeconds }) => timestampSeconds)).toEqual([
			0, 1,
		]);
		expect(keyframes[1]?.centerX).toBeCloseTo(0.25);
		expect(keyframes[1]?.centerY).toBeCloseTo(0.25);
	});
});
