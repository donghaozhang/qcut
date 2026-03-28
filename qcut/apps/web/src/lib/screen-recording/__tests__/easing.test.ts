import { describe, it, expect } from "vitest";
import {
	cubicBezier,
	easeOutScreenStudioBezier,
	easeConnectedPan,
	easeInOutCubic,
	easeOutExpo,
	smoothStep,
} from "../easing";

describe("easing", () => {
	describe("cubicBezier", () => {
		it("returns 0 at t=0", () => {
			expect(cubicBezier(0.16, 1, 0.3, 1, 0)).toBe(0);
		});

		it("returns 1 at t=1", () => {
			expect(cubicBezier(0.16, 1, 0.3, 1, 1)).toBe(1);
		});

		it("produces monotonically increasing values", () => {
			let prev = 0;
			for (let i = 1; i <= 20; i++) {
				const t = i / 20;
				const value = cubicBezier(0.16, 1, 0.3, 1, t);
				expect(value).toBeGreaterThanOrEqual(prev - 0.001);
				prev = value;
			}
		});

		it("matches known linear bezier (0, 0, 1, 1)", () => {
			for (const t of [0.25, 0.5, 0.75]) {
				expect(cubicBezier(0, 0, 1, 1, t)).toBeCloseTo(t, 2);
			}
		});
	});

	describe("easeOutScreenStudioBezier", () => {
		it("returns 0 at t=0 and 1 at t=1", () => {
			expect(easeOutScreenStudioBezier(0)).toBe(0);
			expect(easeOutScreenStudioBezier(1)).toBe(1);
		});

		it("rises fast initially (ease-out behavior)", () => {
			expect(easeOutScreenStudioBezier(0.3)).toBeGreaterThan(0.5);
		});
	});

	describe("easeConnectedPan", () => {
		it("returns 0 at t=0 and 1 at t=1", () => {
			expect(easeConnectedPan(0)).toBe(0);
			expect(easeConnectedPan(1)).toBe(1);
		});

		it("produces values between 0 and 1", () => {
			for (let i = 0; i <= 10; i++) {
				const v = easeConnectedPan(i / 10);
				expect(v).toBeGreaterThanOrEqual(-0.01);
				expect(v).toBeLessThanOrEqual(1.01);
			}
		});
	});

	describe("easeInOutCubic", () => {
		it("returns 0 at t=0 and 1 at t=1", () => {
			expect(easeInOutCubic(0)).toBe(0);
			expect(easeInOutCubic(1)).toBe(1);
		});

		it("returns 0.5 at t=0.5", () => {
			expect(easeInOutCubic(0.5)).toBe(0.5);
		});

		it("is symmetric around 0.5", () => {
			expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 5);
		});
	});

	describe("easeOutExpo", () => {
		it("returns 0 at t=0", () => {
			expect(easeOutExpo(0)).toBeCloseTo(0, 1);
		});

		it("returns 1 at t=1", () => {
			expect(easeOutExpo(1)).toBe(1);
		});

		it("reaches near 1 quickly", () => {
			expect(easeOutExpo(0.5)).toBeGreaterThan(0.9);
		});
	});

	describe("smoothStep", () => {
		it("returns 0 at t=0 and 1 at t=1", () => {
			expect(smoothStep(0)).toBe(0);
			expect(smoothStep(1)).toBe(1);
		});

		it("returns 0.5 at t=0.5", () => {
			expect(smoothStep(0.5)).toBe(0.5);
		});

		it("clamps values outside [0, 1]", () => {
			expect(smoothStep(-0.5)).toBe(0);
			expect(smoothStep(1.5)).toBe(1);
		});
	});
});
