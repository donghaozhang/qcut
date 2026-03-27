import { describe, it, expect } from "vitest";
import { getClickAnimProgress } from "../canvas-cursor-renderer";

describe("canvas-cursor-renderer", () => {
	describe("getClickAnimProgress", () => {
		it("returns 0 when no click started (clickStartMs < 0)", () => {
			expect(getClickAnimProgress(1000, -1)).toBe(0);
		});

		it("returns 0 before click start", () => {
			expect(getClickAnimProgress(500, 1000)).toBe(0);
		});

		it("returns progress during click animation", () => {
			// 75ms into 150ms animation = 0.5
			expect(getClickAnimProgress(1075, 1000)).toBeCloseTo(0.5);
		});

		it("returns 0 at click start", () => {
			expect(getClickAnimProgress(1000, 1000)).toBe(0);
		});

		it("returns 0 after animation completes", () => {
			// 150ms later = done
			expect(getClickAnimProgress(1150, 1000)).toBe(0);
		});

		it("returns value in (0,1) during animation", () => {
			for (let offset = 1; offset < 150; offset++) {
				const progress = getClickAnimProgress(1000 + offset, 1000);
				expect(progress).toBeGreaterThan(0);
				expect(progress).toBeLessThan(1);
			}
		});
	});
});
