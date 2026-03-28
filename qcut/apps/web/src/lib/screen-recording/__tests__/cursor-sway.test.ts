import { describe, it, expect } from "vitest";
import {
	computeCursorSwayRotation,
	toSwaySliderValue,
	fromSwaySliderValue,
	SWAY_SLIDER_SCALE,
} from "../cursor-sway";

describe("cursor-sway", () => {
	describe("computeCursorSwayRotation", () => {
		it("returns 0 when sway is 0 (disabled)", () => {
			expect(
				computeCursorSwayRotation({ dx: 100, dy: 0, deltaMs: 16, sway: 0 })
			).toBe(0);
		});

		it("returns 0 when sway is negative", () => {
			expect(
				computeCursorSwayRotation({ dx: 100, dy: 0, deltaMs: 16, sway: -1 })
			).toBe(0);
		});

		it("returns 0 for negligible movement", () => {
			expect(
				computeCursorSwayRotation({
					dx: 0.001,
					dy: 0.001,
					deltaMs: 16,
					sway: 1,
				})
			).toBe(0);
		});

		it("returns non-zero rotation for significant movement", () => {
			const rotation = computeCursorSwayRotation({
				dx: 50,
				dy: 0,
				deltaMs: 16,
				sway: 1,
			});
			expect(rotation).not.toBe(0);
		});

		it("faster movement produces larger rotation", () => {
			const slow = Math.abs(
				computeCursorSwayRotation({ dx: 5, dy: 0, deltaMs: 16, sway: 1 })
			);
			const fast = Math.abs(
				computeCursorSwayRotation({ dx: 50, dy: 0, deltaMs: 16, sway: 1 })
			);
			expect(fast).toBeGreaterThan(slow);
		});

		it("higher sway intensity produces larger rotation", () => {
			const low = Math.abs(
				computeCursorSwayRotation({ dx: 30, dy: 0, deltaMs: 16, sway: 0.5 })
			);
			const high = Math.abs(
				computeCursorSwayRotation({ dx: 30, dy: 0, deltaMs: 16, sway: 2 })
			);
			expect(high).toBeGreaterThan(low);
		});

		it("caps speed factor at reference speed", () => {
			// Very fast movement — should not exceed max rotation * sway * intensity
			const r1 = Math.abs(
				computeCursorSwayRotation({ dx: 500, dy: 0, deltaMs: 16, sway: 1 })
			);
			const r2 = Math.abs(
				computeCursorSwayRotation({ dx: 5000, dy: 0, deltaMs: 16, sway: 1 })
			);
			// Both should be similar because speed factor clamps at 1
			expect(Math.abs(r2 - r1)).toBeLessThan(r1 * 0.1);
		});

		it("vertical movement contributes less than horizontal", () => {
			const horizontal = Math.abs(
				computeCursorSwayRotation({ dx: 30, dy: 0, deltaMs: 16, sway: 1 })
			);
			const vertical = Math.abs(
				computeCursorSwayRotation({ dx: 0, dy: 30, deltaMs: 16, sway: 1 })
			);
			// Vertical weight is 0.65, so vertical rotation should be less
			expect(vertical).toBeLessThan(horizontal);
		});

		it("opposite directions produce opposite rotations", () => {
			const right = computeCursorSwayRotation({
				dx: 30,
				dy: 0,
				deltaMs: 16,
				sway: 1,
			});
			const left = computeCursorSwayRotation({
				dx: -30,
				dy: 0,
				deltaMs: 16,
				sway: 1,
			});
			expect(Math.sign(right)).not.toBe(Math.sign(left));
			expect(Math.abs(right)).toBeCloseTo(Math.abs(left), 5);
		});

		it("handles NaN/Infinity gracefully", () => {
			expect(
				computeCursorSwayRotation({ dx: NaN, dy: 0, deltaMs: 16, sway: 1 })
			).toBe(0);
			expect(
				computeCursorSwayRotation({
					dx: Infinity,
					dy: 0,
					deltaMs: 16,
					sway: 1,
				})
			).toBe(0);
		});
	});

	describe("slider conversion", () => {
		it("converts to slider value", () => {
			expect(toSwaySliderValue(SWAY_SLIDER_SCALE)).toBe(1);
			expect(toSwaySliderValue(0)).toBe(0);
		});

		it("converts from slider value", () => {
			expect(fromSwaySliderValue(1)).toBe(SWAY_SLIDER_SCALE);
			expect(fromSwaySliderValue(0)).toBe(0);
		});

		it("round-trips correctly", () => {
			const original = 1.5;
			expect(fromSwaySliderValue(toSwaySliderValue(original))).toBeCloseTo(
				original
			);
		});
	});
});
