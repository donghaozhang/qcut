import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	segmentText,
	type TextAnimationEffect,
	type TextAnimationLayout,
	type TextAnimationUnit,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createPhase,
} from "./text-animation-test-helpers.js";

function createLoopElement({
	effect,
	content = "ABCD",
	unit = "all",
}: {
	effect: TextAnimationEffect;
	content?: string;
	unit?: TextAnimationUnit;
}) {
	const loop = {
		...createPhase({
			effect,
			target: unit === "all" ? "textAndBackground" : "text",
			unit,
		}),
		repeat: {
			mode: "restart" as const,
			gap: 0,
			phaseOffset: 0,
		},
	};
	return createElement({
		overrides: {
			content,
			duration: 3,
			textAnimations: createAnimation({ loop }),
		},
	});
}

function createHorizontalLayout({
	content,
}: {
	content: string;
}): TextAnimationLayout {
	const graphemes = segmentText({ content, unit: "grapheme" });
	return {
		bounds: { x: 0, y: 0, width: graphemes.length * 20, height: 20 },
		fontSize: 20,
		graphemes: graphemes.map((segment, index) => ({
			index,
			start: segment.start,
			end: segment.end,
			lineIndex: 0,
			bounds: { x: index * 20, y: 0, width: 20, height: 20 },
		})),
	};
}

function sampleLoop({
	effect,
	frame,
	content,
	unit,
}: {
	effect: TextAnimationEffect;
	frame: number;
	content?: string;
	unit?: TextAnimationUnit;
}) {
	const element = createLoopElement({ effect, content, unit });
	return evaluateTextAnimationFrame({
		compiled: compileTextAnimation({ element, fps: 100 }),
		frame,
		layout: createHorizontalLayout({ content: element.content }),
	});
}

describe("Jianying-derived loop effects", () => {
	it("keeps legacy rotate and scale loops unchanged without profiles", () => {
		const rotate = sampleLoop({
			effect: { kind: "rotate", degrees: 360, fade: false },
			frame: 25,
		});
		const scale = sampleLoop({
			effect: {
				kind: "scale",
				hiddenScale: 0.5,
				overshoot: 0,
				fade: false,
			},
			frame: 25,
		});

		expect(rotate.container.rotationDeg).toBeCloseTo(90);
		expect(scale.container.scaleX).toBeCloseTo(0.75);
	});

	it("reproduces five smooth scale dips per cycle", () => {
		const effect: TextAnimationEffect = {
			kind: "scale",
			hiddenScale: 0.85,
			overshoot: 0,
			fade: false,
			pulse: { cycles: 5, easing: "smoothstep" },
		};

		expect(sampleLoop({ effect, frame: 0 }).container.scaleX).toBeCloseTo(1);
		expect(sampleLoop({ effect, frame: 5 }).container.scaleX).toBeCloseTo(
			0.925
		);
		expect(sampleLoop({ effect, frame: 10 }).container.scaleX).toBeCloseTo(
			0.85
		);
		expect(sampleLoop({ effect, frame: 20 }).container.scaleX).toBeCloseTo(1);
	});

	it("rocks every grapheme in phase around its bottom center", () => {
		const effect: TextAnimationEffect = {
			kind: "rotate",
			degrees: 20,
			fade: false,
			oscillation: {
				cycles: 1,
				phaseEasing: "smoothstep",
				pivot: "bottomCenter",
			},
		};
		const samples = [0, 25, 50, 75].map((frame) =>
			sampleLoop({ effect, frame, unit: "grapheme" })
		);

		expect(samples.map(({ units }) => units.at(0)?.visual.rotationDeg)).toEqual(
			[
				expect.closeTo(20),
				expect.closeTo(0),
				expect.closeTo(-20),
				expect.closeTo(0),
			]
		);
		for (const state of samples) {
			expect(
				state.units.every(
					({ visual }) => visual.transformOrigin === "bottomCenter"
				)
			).toBe(true);
			expect(
				new Set(state.units.map(({ visual }) => visual.rotationDeg)).size
			).toBe(1);
		}
	});

	it("travels across graphemes using the sampled spatial wave", () => {
		const effect: TextAnimationEffect = {
			kind: "bounce",
			direction: "up",
			distance: { value: 0.2, unit: "em" },
			hiddenScale: 1,
			spring: { mass: 1, stiffness: 210, damping: 14, velocity: 0 },
			spatialWave: { spatialCycles: 0.75, phaseOffset: 0 },
		};
		const start = sampleLoop({
			effect,
			frame: 0,
			content: "ABCD",
			unit: "grapheme",
		});
		const quarter = sampleLoop({
			effect,
			frame: 25,
			content: "ABCD",
			unit: "grapheme",
		});
		const expectedStart = -4 * Math.sin(Math.PI * 2 * (0.75 * 0.125));
		const expectedQuarter = -4 * Math.sin(Math.PI * 2 * (0.75 * 0.125 - 0.25));

		expect(start.units.at(0)?.visual.translateY).toBeCloseTo(expectedStart);
		expect(quarter.units.at(0)?.visual.translateY).toBeCloseTo(expectedQuarter);
		expect(
			new Set(start.units.map(({ visual }) => visual.translateY.toFixed(6)))
				.size
		).toBeGreaterThan(1);
		expect(start.units.every(({ visual }) => visual.scaleX === 1)).toBe(true);
	});

	it("matches the horizontal 3D flip timing and midpoint mirror snap", () => {
		const effect: TextAnimationEffect = {
			kind: "flip3d",
			axis: "y",
			maxAngleDeg: 60,
			cameraFovDeg: 30,
			motionRatio: 0.8,
			motionEasing: {
				type: "cubicBezier",
				x1: 0.55,
				y1: 0.06,
				x2: 0.4,
				y2: 0.96,
			},
		};
		const start = sampleLoop({ effect, frame: 0 });
		const beforeSnap = sampleLoop({ effect, frame: 39 });
		const afterSnap = sampleLoop({ effect, frame: 40 });
		const hold = sampleLoop({ effect, frame: 90 });

		expect(start.container.rotationYDeg).toBe(0);
		expect(beforeSnap.container.rotationYDeg).toBeLessThan(-59);
		expect(afterSnap.container.rotationYDeg).toBe(60);
		expect(hold.container.rotationYDeg).toBe(0);
		expect(afterSnap.container.projection).toEqual({
			kind: "plane",
			cameraFovDeg: 30,
			groupRotationXDeg: 0,
			groupRotationYDeg: 0,
		});
	});

	it("maps the text block to the calibrated rotating cylinder", () => {
		const effect: TextAnimationEffect = {
			kind: "cylinder3d",
			turns: 1,
			tiltXDeg: 20,
			cameraFovDeg: 60,
			coverage: 5 / 6,
			radiusRatio: 1.2 / (Math.PI * 2),
			startYawDeg: 540,
		};
		const quarter = sampleLoop({ effect, frame: 25 });

		expect(quarter.container.projection).toEqual({
			kind: "cylinder",
			cameraFovDeg: 60,
			tiltXDeg: 20,
			yawDeg: 450,
			coverage: 5 / 6,
			radiusRatio: 1.2 / (Math.PI * 2),
		});
	});

	it("produces deterministic per-grapheme 3D jitter and post-processing", () => {
		const effect: TextAnimationEffect = {
			kind: "jitter3d",
			cameraFovDeg: 60,
			groupYawDeg: 20,
			rotationXDeg: 15,
			rotationYDeg: 15,
			rotationZDeg: 10,
			positionJitter: 0.03,
			scaleFrom: 2 / 3,
			scaleTo: 1,
			frequency: 12,
			seed: 90210,
			trailSamples: 25,
			trailStrength: 0.65,
			trapezoidAmount: 0.12,
		};
		const first = sampleLoop({
			effect,
			frame: 25,
			content: "ABCD",
			unit: "grapheme",
		});
		const repeated = sampleLoop({
			effect,
			frame: 25,
			content: "ABCD",
			unit: "grapheme",
		});

		expect(first).toEqual(repeated);
		expect(first.units.at(0)?.visual.projection).toEqual({
			kind: "plane",
			cameraFovDeg: 60,
			groupRotationXDeg: 0,
			groupRotationYDeg: 20,
		});
		expect(first.units.at(0)?.visual.postProcess).toEqual({
			trailSamples: 25,
			trailStrength: 0.65,
			trapezoidAmount: 0.12,
		});
		expect(
			new Set(first.units.map(({ visual }) => visual.rotationXDeg.toFixed(6)))
				.size
		).toBeGreaterThan(1);
		expect(first.units.at(0)?.visual.scaleX).toBeLessThan(
			first.units.at(-1)?.visual.scaleX ?? 0
		);
	});
});
