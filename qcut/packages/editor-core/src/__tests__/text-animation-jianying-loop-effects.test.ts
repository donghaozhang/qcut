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
});
