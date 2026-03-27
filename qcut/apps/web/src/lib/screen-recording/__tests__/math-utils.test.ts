import { describe, it, expect } from "vitest";
import { easeOutCubic, easeOutScreenStudio, clamp01, lerp } from "../math-utils";

describe("math-utils", () => {
	describe("easeOutCubic", () => {
		it("returns 0 at t=0", () => {
			expect(easeOutCubic(0)).toBe(0);
		});

		it("returns 1 at t=1", () => {
			expect(easeOutCubic(1)).toBe(1);
		});

		it("starts fast and decelerates", () => {
			const early = easeOutCubic(0.2);
			const late = easeOutCubic(0.8) - easeOutCubic(0.6);
			// The first 20% covers more distance than the last 20%
			expect(early).toBeGreaterThan(late);
		});

		it("is monotonically increasing in [0,1]", () => {
			let prev = 0;
			for (let t = 0.1; t <= 1; t += 0.1) {
				const val = easeOutCubic(t);
				expect(val).toBeGreaterThan(prev);
				prev = val;
			}
		});
	});

	describe("easeOutScreenStudio", () => {
		it("returns 0 at t=0", () => {
			expect(easeOutScreenStudio(0)).toBe(0);
		});

		it("returns 1 at t=1", () => {
			expect(easeOutScreenStudio(1)).toBe(1);
		});

		it("uses t^4 (different curve than cubic)", () => {
			const cubic = easeOutCubic(0.5);
			const screenStudio = easeOutScreenStudio(0.5);
			// t^4 should be slightly different from t^3 at midpoint
			expect(screenStudio).not.toBeCloseTo(cubic, 2);
		});
	});

	describe("clamp01", () => {
		it("clamps values below 0 to 0", () => {
			expect(clamp01(-0.5)).toBe(0);
			expect(clamp01(-100)).toBe(0);
		});

		it("clamps values above 1 to 1", () => {
			expect(clamp01(1.5)).toBe(1);
			expect(clamp01(100)).toBe(1);
		});

		it("passes through values in [0,1]", () => {
			expect(clamp01(0)).toBe(0);
			expect(clamp01(0.5)).toBe(0.5);
			expect(clamp01(1)).toBe(1);
		});
	});

	describe("lerp", () => {
		it("returns a at t=0", () => {
			expect(lerp(10, 20, 0)).toBe(10);
		});

		it("returns b at t=1", () => {
			expect(lerp(10, 20, 1)).toBe(20);
		});

		it("returns midpoint at t=0.5", () => {
			expect(lerp(0, 100, 0.5)).toBe(50);
		});

		it("extrapolates beyond [0,1]", () => {
			expect(lerp(0, 10, 2)).toBe(20);
			expect(lerp(0, 10, -1)).toBe(-10);
		});
	});
});
