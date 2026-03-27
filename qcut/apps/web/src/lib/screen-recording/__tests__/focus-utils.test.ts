import { describe, it, expect } from "vitest";
import { constrainFocus } from "../focus-utils";

describe("focus-utils", () => {
	describe("constrainFocus", () => {
		it("returns center unchanged at 1x zoom", () => {
			const result = constrainFocus(0.5, 0.5, 1, 16 / 9);
			expect(result.cx).toBe(0.5);
			expect(result.cy).toBe(0.5);
		});

		it("clamps focus near left edge at 2x zoom", () => {
			const result = constrainFocus(0.1, 0.5, 2, 16 / 9);
			// At 2x zoom, halfViewW = 0.25, so min cx = 0.25
			expect(result.cx).toBe(0.25);
			expect(result.cy).toBe(0.5);
		});

		it("clamps focus near right edge at 2x zoom", () => {
			const result = constrainFocus(0.95, 0.5, 2, 16 / 9);
			// At 2x zoom, max cx = 1 - 0.25 = 0.75
			expect(result.cx).toBe(0.75);
		});

		it("clamps focus near top edge", () => {
			const result = constrainFocus(0.5, 0.05, 2, 16 / 9);
			expect(result.cy).toBe(0.25);
		});

		it("clamps focus near bottom edge", () => {
			const result = constrainFocus(0.5, 0.95, 2, 16 / 9);
			expect(result.cy).toBe(0.75);
		});

		it("clamps both axes at 3x zoom in corner", () => {
			const result = constrainFocus(0, 0, 3, 16 / 9);
			// At 3x, halfView = 0.5/3 ≈ 0.167
			expect(result.cx).toBeCloseTo(0.5 / 3, 5);
			expect(result.cy).toBeCloseTo(0.5 / 3, 5);
		});

		it("does not clamp center point at any zoom", () => {
			for (const zoom of [1, 1.5, 2, 3]) {
				const result = constrainFocus(0.5, 0.5, zoom, 16 / 9);
				expect(result.cx).toBe(0.5);
				expect(result.cy).toBe(0.5);
			}
		});
	});
});
