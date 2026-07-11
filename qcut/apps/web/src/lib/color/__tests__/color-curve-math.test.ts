import { describe, expect, it } from "vitest";
import {
	buildCurveSamples,
	createCurveSampler,
	insertCurvePoint,
	sampleCurveValues,
} from "../color-curve-math";

describe("color curve math", () => {
	it("uses monotone PCHIP interpolation without overshooting", () => {
		const sample = createCurveSampler({
			points: [
				{ id: "black", x: 0, y: 0 },
				{ id: "middle", x: 0.5, y: 0.8 },
				{ id: "white", x: 1, y: 1 },
			],
		});
		const quarter = sample(0.25);
		expect(quarter).not.toBeCloseTo(0.4, 4);
		expect(quarter).toBeGreaterThan(0);
		expect(quarter).toBeLessThan(0.8);
		expect(sample(0.75)).toBeGreaterThan(0.8);
		expect(sample(0.75)).toBeLessThanOrEqual(1);
	});

	it("clamps malformed points and safely resolves duplicate inputs", () => {
		const sample = createCurveSampler({
			points: [
				{ id: "first", x: -1, y: -1 },
				{ id: "duplicate-a", x: 0.5, y: 0.2 },
				{ id: "duplicate-b", x: 0.5, y: 0.7 },
				{ id: "last", x: 2, y: 2 },
			],
		});
		expect(sample(-1)).toBe(0);
		expect(sample(0.5)).toBeCloseTo(0.7, 6);
		expect(sample(2)).toBe(1);
	});

	it("builds a stable lookup table with interpolated reads", () => {
		const samples = buildCurveSamples({
			points: [
				{ id: "start", x: 0, y: 0.5 },
				{ id: "peak", x: 0.5, y: 1 },
				{ id: "end", x: 1, y: 0.5 },
			],
			count: 17,
		});
		expect(samples).toHaveLength(17);
		expect(sampleCurveValues({ samples, value: 0.5 })).toBe(1);
		expect(sampleCurveValues({ samples, value: 0.25 })).toBeGreaterThan(0.5);
	});

	it("keeps inserted points separated from their neighbors", () => {
		const points = [
			{ id: "start", x: 0, y: 0 },
			{ id: "middle", x: 0.5, y: 0.5 },
			{ id: "end", x: 1, y: 1 },
		];
		const inserted = insertCurvePoint({
			points,
			point: { id: "new", x: 0.499, y: 0.6 },
			minimumSpacing: 0.01,
		});
		expect(inserted.map((point) => point.x)).toEqual([0, 0.49, 0.5, 1]);
		expect(
			insertCurvePoint({
				points: [
					{ id: "left", x: 0.49, y: 0.5 },
					{ id: "right", x: 0.5, y: 0.5 },
				],
				point: { id: "blocked", x: 0.495, y: 0.8 },
				minimumSpacing: 0.01,
			})
		).toHaveLength(2);
	});
});
