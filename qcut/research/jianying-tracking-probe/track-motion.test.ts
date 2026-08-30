import { describe, expect, test } from "bun:test";
import { expectedSampleCount, parseFrameRate, parseRect } from "./track-motion";

describe("Jianying motion tracking CLI contract", () => {
	test("parses a normalized rectangle", () => {
		expect(parseRect({ value: "0.1, 0.2, 0.7, 0.9" })).toEqual([
			0.1, 0.2, 0.7, 0.9,
		]);
	});

	test.each([
		"0.5,0.2,0.5,0.8",
		"0.1,0.8,0.9,0.2",
		"-0.1,0.2,0.5,0.8",
		"0.1,0.2,1.1,0.8",
		"0.1,0.2,0.5",
		"0.1,wat,0.5,0.8",
	])("rejects an invalid rectangle: %s", (value) => {
		expect(() => parseRect({ value })).toThrow();
	});

	test("parses rational frame rates", () => {
		expect(parseFrameRate({ value: "30000/1001" })).toBeCloseTo(29.970_029_97);
	});

	test.each([
		"0/0",
		"30/0",
		"not-a-rate",
		30,
		null,
	])("rejects an invalid frame rate: %p", (value) => {
		expect(() => parseFrameRate({ value })).toThrow();
	});

	test("counts a forward branch from its anchor", () => {
		expect(
			expectedSampleCount({
				anchorFrame: 30,
				direction: "forward",
				frameCount: 60,
			})
		).toBe(30);
	});

	test("counts a backward branch including its anchor", () => {
		expect(
			expectedSampleCount({
				anchorFrame: 30,
				direction: "backward",
				frameCount: 60,
			})
		).toBe(31);
	});

	test("counts a bidirectional track without duplicating its anchor", () => {
		expect(
			expectedSampleCount({
				anchorFrame: 30,
				direction: "both",
				frameCount: 60,
			})
		).toBe(60);
	});
});
