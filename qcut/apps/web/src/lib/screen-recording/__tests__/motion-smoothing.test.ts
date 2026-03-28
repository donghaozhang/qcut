import { describe, it, expect } from "vitest";
import {
	getCursorSpringConfig,
	stepSpring,
	createSpringState,
	type SpringState,
} from "../motion-smoothing";

describe("motion-smoothing", () => {
	describe("getCursorSpringConfig", () => {
		it("returns high stiffness for factor 0 (instant)", () => {
			const config = getCursorSpringConfig(0);
			expect(config.stiffness).toBe(1000);
			expect(config.mass).toBe(1);
		});

		it("returns default stiffness for factor 0.18", () => {
			const config = getCursorSpringConfig(0.18);
			expect(config.stiffness).toBeCloseTo(1000 - 0.18 * 420, 1);
		});

		it("returns low stiffness for factor 2 (ultra-smooth)", () => {
			const config = getCursorSpringConfig(2);
			expect(config.stiffness).toBe(160);
		});

		it("clamps values above 2", () => {
			const config = getCursorSpringConfig(5);
			expect(config.stiffness).toBe(160);
		});

		it("clamps values below 0", () => {
			const config = getCursorSpringConfig(-1);
			expect(config.stiffness).toBe(1000);
		});

		it("uses critical damping formula", () => {
			const config = getCursorSpringConfig(0.5);
			expect(config.damping).toBeCloseTo(2 * Math.sqrt(config.stiffness));
		});
	});

	describe("createSpringState", () => {
		it("creates uninitialized state", () => {
			const state = createSpringState();
			expect(state.value).toBe(0);
			expect(state.velocity).toBe(0);
			expect(state.initialized).toBe(false);
		});
	});

	describe("stepSpring", () => {
		it("snaps to target on first call (uninitialized)", () => {
			const state = createSpringState();
			const result = stepSpring(state, 100, getCursorSpringConfig(0.18), 0.016);
			expect(result.value).toBe(100);
			expect(result.velocity).toBe(0);
			expect(result.initialized).toBe(true);
		});

		it("moves toward target over time", () => {
			const config = getCursorSpringConfig(0.18);
			let state: SpringState = { value: 0, velocity: 0, initialized: true };

			// Step several times toward target=100
			for (let i = 0; i < 60; i++) {
				state = stepSpring(state, 100, config, 0.016);
			}

			// After ~1 second at 60fps, should be close to target
			expect(state.value).toBeGreaterThan(90);
		});

		it("converges to target with stiff spring", () => {
			const config = getCursorSpringConfig(0); // Instant
			let state: SpringState = { value: 0, velocity: 0, initialized: true };

			for (let i = 0; i < 30; i++) {
				state = stepSpring(state, 50, config, 0.016);
			}

			expect(state.value).toBeCloseTo(50, 0);
		});

		it("smooth spring takes longer to converge", () => {
			const stiff = getCursorSpringConfig(0);
			const smooth = getCursorSpringConfig(2);

			let stiffState: SpringState = {
				value: 0,
				velocity: 0,
				initialized: true,
			};
			let smoothState: SpringState = {
				value: 0,
				velocity: 0,
				initialized: true,
			};

			// Step 10 frames
			for (let i = 0; i < 10; i++) {
				stiffState = stepSpring(stiffState, 100, stiff, 0.016);
				smoothState = stepSpring(smoothState, 100, smooth, 0.016);
			}

			// Stiff should be closer to target
			expect(Math.abs(100 - stiffState.value)).toBeLessThan(
				Math.abs(100 - smoothState.value)
			);
		});
	});
});
