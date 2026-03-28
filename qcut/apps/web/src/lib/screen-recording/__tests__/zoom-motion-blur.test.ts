import { describe, it, expect } from "vitest";
import {
	createZoomMotionBlurState,
	computeZoomMotionBlur,
} from "../zoom-motion-blur";

describe("zoom-motion-blur", () => {
	it("returns zero blur on first frame (initialization)", () => {
		const state = createZoomMotionBlurState();
		const result = computeZoomMotionBlur(state, 0, 0, 1, 0, 1920, 1080, 1.0);
		expect(result.magnitude).toBe(0);
	});

	it("returns zero blur when camera is stationary", () => {
		const state = createZoomMotionBlurState();
		computeZoomMotionBlur(state, 100, 100, 1, 0, 1920, 1080, 1.0);
		const result = computeZoomMotionBlur(
			state,
			100,
			100,
			1,
			16,
			1920,
			1080,
			1.0
		);
		expect(result.magnitude).toBe(0);
	});

	it("returns zero blur when motionBlurAmount is 0", () => {
		const state = createZoomMotionBlurState();
		computeZoomMotionBlur(state, 0, 0, 1, 0, 1920, 1080, 0);
		const result = computeZoomMotionBlur(state, 500, 500, 2, 16, 1920, 1080, 0);
		expect(result.magnitude).toBe(0);
	});

	it("increases blur with camera speed", () => {
		const state1 = createZoomMotionBlurState();
		computeZoomMotionBlur(state1, 0, 0, 1, 0, 1920, 1080, 1.0);
		const slow = computeZoomMotionBlur(state1, 5, 0, 1, 16, 1920, 1080, 1.0);

		const state2 = createZoomMotionBlurState();
		computeZoomMotionBlur(state2, 0, 0, 1, 0, 1920, 1080, 1.0);
		const fast = computeZoomMotionBlur(state2, 100, 0, 1, 16, 1920, 1080, 1.0);

		expect(fast.magnitude).toBeGreaterThan(slow.magnitude);
	});

	it("applies quadratic scaling (higher speed → disproportionately more blur)", () => {
		// Use small displacements to stay in the linear part of the curve (below cap)
		// velocity = displacement / (deltaMs/1000) = displacement * 62.5
		// PEAK_VELOCITY = 2000, so displacement of 4 → v=250 → normalized=0.125
		// displacement of 8 → v=500 → normalized=0.25
		const state1 = createZoomMotionBlurState();
		computeZoomMotionBlur(state1, 0, 0, 1, 0, 1920, 1080, 1.0);
		const blur1 = computeZoomMotionBlur(state1, 4, 0, 1, 16, 1920, 1080, 1.0);

		const state2 = createZoomMotionBlurState();
		computeZoomMotionBlur(state2, 0, 0, 1, 0, 1920, 1080, 1.0);
		const blur2 = computeZoomMotionBlur(state2, 8, 0, 1, 16, 1920, 1080, 1.0);

		// Both should be above threshold
		expect(blur1.magnitude).toBeGreaterThan(0);
		expect(blur2.magnitude).toBeGreaterThan(0);
		// Quadratic: 2x speed → ~4x blur (both well below cap)
		const ratio = blur2.magnitude / blur1.magnitude;
		expect(ratio).toBeGreaterThan(3);
		expect(ratio).toBeLessThan(5);
	});

	it("scale changes contribute to blur", () => {
		const state = createZoomMotionBlurState();
		computeZoomMotionBlur(state, 0, 0, 1, 0, 1920, 1080, 1.0);
		// Large scale change without position change
		const result = computeZoomMotionBlur(state, 0, 0, 2, 16, 1920, 1080, 1.0);
		expect(result.magnitude).toBeGreaterThan(0);
	});

	it("caps blur at MAX_BLUR_PX (8)", () => {
		const state = createZoomMotionBlurState();
		computeZoomMotionBlur(state, 0, 0, 1, 0, 1920, 1080, 1.0);
		// Extreme velocity
		const result = computeZoomMotionBlur(
			state,
			10000,
			0,
			5,
			16,
			1920,
			1080,
			1.0
		);
		expect(result.magnitude).toBeLessThanOrEqual(8);
	});
});
