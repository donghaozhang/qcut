import { describe, expect, it } from "vitest";
import {
	resolvePersonCutoutFrameCountExpectation,
	validatePersonCutoutAlphaFrameCount,
} from "../jianying-person-cutout/frame-count.js";

describe("person cutout frame count", () => {
	it("prefers the counted frame total and validates it exactly", () => {
		const expectation = resolvePersonCutoutFrameCountExpectation({
			declaredFrames: "59",
			duration: 2,
			frameRate: 30,
			readFrames: "60",
		});

		expect(expectation).toEqual({
			count: 60,
			source: "counted",
			tolerance: 0,
		});
		expect(() =>
			validatePersonCutoutAlphaFrameCount({
				actualFrameCount: 59,
				expectation,
			})
		).toThrow("人物蒙版帧数不完整");
	});

	it("uses a valid declared count when frame counting is unavailable", () => {
		expect(
			resolvePersonCutoutFrameCountExpectation({
				declaredFrames: "42",
				duration: 1.4,
				frameRate: 30,
				readFrames: "N/A",
			})
		).toEqual({ count: 42, source: "declared", tolerance: 0 });
	});

	it("allows one-frame container rounding only for an estimate", () => {
		const expectation = resolvePersonCutoutFrameCountExpectation({
			declaredFrames: "N/A",
			duration: 2,
			frameRate: 30,
			readFrames: "N/A",
		});

		expect(expectation).toEqual({
			count: 60,
			source: "estimated",
			tolerance: 1,
		});
		expect(() =>
			validatePersonCutoutAlphaFrameCount({
				actualFrameCount: 59,
				expectation,
			})
		).not.toThrow();
		expect(() =>
			validatePersonCutoutAlphaFrameCount({
				actualFrameCount: 58,
				expectation,
			})
		).toThrow("人物蒙版帧数不完整");
	});
});
