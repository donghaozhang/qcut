import { describe, expect, it } from "vitest";
import {
	jianyingTextFrameTimestamp,
	resolveJianyingTextTemplateTiming,
} from "../jianying-text-runtime/timing.js";

describe("Jianying text template timing", () => {
	it.each([
		{ sourceStart: 0, elementDuration: 3, frameCount: 90, fps: 30 },
		{ sourceStart: 0.2, elementDuration: 1, frameCount: 5, fps: 10 },
		{ sourceStart: 0.137, elementDuration: 3.7, frameCount: 103, fps: 30 },
		{
			sourceStart: 2 / 29.97,
			elementDuration: 2.5,
			frameCount: 70,
			fps: 29.97,
		},
	])("matches every standalone seek for %#", ({
		sourceStart,
		elementDuration,
		frameCount,
		fps,
	}) => {
		const templateDuration = 2.733_333;
		const sequence = resolveJianyingTextTemplateTiming({
			sourceStart,
			elementDuration,
			frameCount,
			fps,
			templateDuration,
		});
		const timestamps = Array.from({ length: frameCount }, (_, frameIndex) => {
			const singleFrame = resolveJianyingTextTemplateTiming({
				sourceStart: sourceStart + frameIndex / fps,
				elementDuration,
				frameCount: 1,
				fps,
				templateDuration,
			});
			return {
				sequence: jianyingTextFrameTimestamp({
					timing: sequence,
					frameIndex,
				}),
				seek: jianyingTextFrameTimestamp({
					timing: singleFrame,
					frameIndex: 0,
				}),
			};
		});
		expect(timestamps.every(({ sequence, seek }) => sequence === seek)).toBe(
			true
		);
	});

	it("clamps an overlong template to the runtime maximum", () => {
		expect(
			resolveJianyingTextTemplateTiming({
				sourceStart: 0,
				elementDuration: 120,
				frameCount: 1,
				fps: 30,
				templateDuration: 120,
			}).timelineDuration
		).toBe(60_000_000);
	});
});
