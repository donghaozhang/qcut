import { describe, expect, it } from "vitest";
import { parseConsistencyResponse } from "../consistency-normalize.js";
import type { Keyframe } from "../types.js";

const keyframes: Keyframe[] = [
	{ index: 0, frameNumber: 0, timeSeconds: 0, path: "frame-1.jpg" },
	{ index: 1, frameNumber: 30, timeSeconds: 1, path: "frame-2.jpg" },
	{ index: 2, frameNumber: 60, timeSeconds: 2, path: "frame-3.jpg" },
];

describe("parseConsistencyResponse", () => {
	it("parses clean JSON into frame ranges", () => {
		const findings = parseConsistencyResponse({
			response: JSON.stringify([
				{
					frameNumber: 30,
					category: "proportion/height",
					severity: "high",
					comment: "Too short",
					fix: "Regenerate this shot",
				},
			]),
			batchKeyframes: keyframes,
			samplingFps: 1,
			videoFps: 30,
		});

		expect(findings).toEqual([
			{
				startFrame: 30,
				endFrame: 59,
				startTime: "00:00:01.000",
				endTime: "00:00:01.967",
				category: "proportion/height",
				severity: "high",
				comment: "Too short",
				fix: "Regenerate this shot",
			},
		]);
	});

	it("handles fenced, truncated, and zh-ish model output", () => {
		const findings = parseConsistencyResponse({
			response:
				'```json\n[{"frameNumber":60,"category":"脸变了","severity":"严重","comment":"像换了人","fix":"按参考图重做"},{"frameNumber":',
			batchKeyframes: keyframes,
			samplingFps: 1,
			videoFps: 30,
		});

		expect(findings).toHaveLength(1);
		expect(findings[0]?.category).toBe("identity/face");
		expect(findings[0]?.severity).toBe("high");
		expect(findings[0]?.startFrame).toBe(60);
		expect(findings[0]?.endFrame).toBe(89);
	});

	it("drops malformed items and accepts empty arrays", () => {
		expect(
			parseConsistencyResponse({
				response: "[]",
				batchKeyframes: keyframes,
				samplingFps: 1,
				videoFps: 30,
			})
		).toEqual([]);

		expect(
			parseConsistencyResponse({
				response: '[{"frameNumber":30,"category":"unknown","comment":"bad"}]',
				batchKeyframes: keyframes,
				samplingFps: 1,
				videoFps: 30,
			})
		).toEqual([]);
	});
});
