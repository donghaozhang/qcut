import { describe, expect, it } from "vitest";
import {
	applyTemporalSmoothing,
	processPersonConfidenceMask,
	shiftMaskEdge,
} from "../person-cutout-mask";

describe("person cutout mask processing", () => {
	it("converts person confidence into soft foreground alpha", () => {
		const result = processPersonConfidenceMask({
			personConfidence: new Float32Array([0, 0.5, 1]),
			width: 3,
			height: 1,
			options: {
				threshold: 0.5,
				temporalSmoothing: 0,
				edgeShift: 0,
				feather: 2,
			},
		});
		expect(Array.from(result.alpha)).toEqual([0, 0.5, 1]);
	});

	it("smooths confidence changes across adjacent video frames", () => {
		const result = applyTemporalSmoothing({
			current: new Float32Array([1, 0]),
			previous: new Float32Array([0, 1]),
			amount: 0.75,
		});
		expect(Array.from(result)).toEqual([0.25, 0.75]);
	});

	it("expands and contracts mask edges", () => {
		const input = new Float32Array([
			0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		]);
		const expanded = shiftMaskEdge({
			input,
			width: 5,
			height: 5,
			shift: 1,
		});
		expect(expanded.reduce((sum, value) => sum + value, 0)).toBe(9);

		const contracted = shiftMaskEdge({
			input: expanded,
			width: 5,
			height: 5,
			shift: -1,
		});
		expect(contracted.reduce((sum, value) => sum + value, 0)).toBe(1);
	});

	it("rejects inconsistent mask dimensions", () => {
		expect(() =>
			shiftMaskEdge({
				input: new Float32Array(3),
				width: 2,
				height: 2,
				shift: 1,
			})
		).toThrow(/dimensions/);
	});
});
