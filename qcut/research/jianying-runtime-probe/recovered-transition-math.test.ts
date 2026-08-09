import { describe, expect, test } from "bun:test";

import {
	evaluateAeSpatialBezier,
	evaluateAeTemporalBezier,
	fogBlurIntensity,
	horizontalMotionUsesIncomingFrame,
	pageCurlCylinderAmount,
	quadraticEaseInOut,
	quinticEaseInOut,
	remapProgress,
	sineEaseInOut,
	threeJsShaderProgress,
	threeJsTimelineProgress,
} from "./recovered-transition-math";

describe("recovered transition timing", () => {
	test("reproduces the ThreeJS timeline and shader remaps", () => {
		expect(threeJsTimelineProgress({ progress: 0.15 })).toBe(0);
		expect(threeJsTimelineProgress({ progress: 0.5 })).toBeCloseTo(0.5);
		expect(threeJsTimelineProgress({ progress: 0.85 })).toBe(1);
		expect(threeJsShaderProgress({ progress: 0.1 })).toBe(0);
		expect(threeJsShaderProgress({ progress: 0.5 })).toBe(0.5);
		expect(threeJsShaderProgress({ progress: 0.9 })).toBe(1);
	});

	test("reproduces the easing functions found in package scripts", () => {
		expect(sineEaseInOut({ progress: 0.5 })).toBeCloseTo(0.5);
		expect(quinticEaseInOut({ progress: 0.25 })).toBeCloseTo(0.015625);
		expect(quinticEaseInOut({ progress: 0.75 })).toBeCloseTo(0.984375);
		expect(quadraticEaseInOut({ progress: 0.25 })).toBeCloseTo(0.125);
		expect(quadraticEaseInOut({ progress: 0.75 })).toBeCloseTo(0.875);
	});

	test("reproduces effect-specific scalar controls", () => {
		expect(fogBlurIntensity({ progress: 0 })).toBe(0);
		expect(fogBlurIntensity({ progress: 0.5 })).toBe(1);
		expect(fogBlurIntensity({ progress: 1 })).toBe(0);
		expect(pageCurlCylinderAmount({ progress: 0 })).toBeCloseTo(-0.16);
		expect(pageCurlCylinderAmount({ progress: 1 })).toBeCloseTo(1.5);
		expect(horizontalMotionUsesIncomingFrame({ progress: 12 / 24 })).toBe(
			false
		);
		expect(horizontalMotionUsesIncomingFrame({ progress: 13 / 24 })).toBe(true);
	});

	test("rejects inverted progress ranges", () => {
		expect(() => remapProgress({ progress: 0.5, start: 1, end: 0 })).toThrow(
			"progress range end must be greater than start"
		);
	});
});

describe("recovered AE keyframe evaluation", () => {
	test("solves temporal cubic handles by the observed bisection path", () => {
		expect(
			evaluateAeTemporalBezier({
				progress: 0.5,
				startValue: 10,
				endValue: 20,
				control1: { x: 1 / 3, y: 10 / 3 },
				control2: { x: 2 / 3, y: 20 / 3 },
			})
		).toBeCloseTo(15, 2);
	});

	test("maps spatial curves by approximate arc length", () => {
		const midpoint = evaluateAeSpatialBezier({
			progress: 0.5,
			start: [0, 0],
			control1: [0, 10],
			control2: [10, 10],
			end: [10, 0],
		});

		expect(midpoint[0]).toBeCloseTo(5, 2);
		expect(midpoint[1]).toBeCloseTo(7.5, 2);
	});

	test("returns the start point for a zero-length spatial curve", () => {
		expect(
			evaluateAeSpatialBezier({
				progress: 0.75,
				start: [2, 3],
				control1: [2, 3],
				control2: [2, 3],
				end: [2, 3],
			})
		).toEqual([2, 3]);
	});
});
