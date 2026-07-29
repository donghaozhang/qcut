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

	it("flips by squashing scale through zero, mirroring on the back half", () => {
		// Jianying has no 3D camera: a turn is scale.x = cos(2*pi*t), which goes
		// negative to mirror the glyph rather than rotating a mesh.
		const effect: TextAnimationEffect = {
			kind: "flip",
			axis: "y",
			turns: 1,
			edgeOpacity: 0.55,
		};

		expect(sampleLoop({ effect, frame: 0 }).container.scaleX).toBeCloseTo(1);
		expect(sampleLoop({ effect, frame: 25 }).container.scaleX).toBeCloseTo(0);
		expect(sampleLoop({ effect, frame: 50 }).container.scaleX).toBeCloseTo(-1);
		expect(sampleLoop({ effect, frame: 75 }).container.scaleX).toBeCloseTo(0);
		// scaleY is untouched, so the glyph keeps its height through the turn.
		expect(sampleLoop({ effect, frame: 25 }).container.scaleY).toBeCloseTo(1);
		// Edge-on is the thinnest moment and dips to the configured floor.
		expect(sampleLoop({ effect, frame: 25 }).container.opacity).toBeCloseTo(
			0.55
		);
		expect(sampleLoop({ effect, frame: 0 }).container.opacity).toBeCloseTo(1);
	});

	it("orbits every unit on the circle Jianying's 环绕 traces", () => {
		// translate.x = sin(2*pi*t), translate.y = cos(2*pi*t) in their Lua.
		const effect: TextAnimationEffect = {
			kind: "orbit",
			rotation: "clockwise",
			turns: 1,
			radius: { value: 0.12, unit: "boxHeight" },
			fade: false,
		};
		const radius = 20 * 0.12;
		const samples = [0, 25, 50, 75].map((frame) =>
			sampleLoop({ effect, frame })
		);

		expect(samples.map(({ container }) => container.translateX)).toEqual([
			expect.closeTo(0),
			expect.closeTo(-radius),
			expect.closeTo(-radius * 2),
			expect.closeTo(-radius),
		]);
		expect(samples.map(({ container }) => container.translateY)).toEqual([
			expect.closeTo(0),
			expect.closeTo(radius),
			expect.closeTo(0),
			expect.closeTo(-radius),
		]);
	});

	it("steps the jitter into four poses per cycle, keyed on unit rank", () => {
		const effect: TextAnimationEffect = {
			kind: "jitter",
			steps: 4,
			amplitudeX: 0.04,
			amplitudeY: 0.027,
		};
		const sample = ({ frame }: { frame: number }) =>
			sampleLoop({ effect, frame, content: "ABCD", unit: "grapheme" });
		const offsets = ({ frame }: { frame: number }) =>
			sample({ frame }).units.map(
				({ visual }) => `${visual.translateX},${visual.translateY}`
			);

		// Local time is floored into quarters, so frames inside a step match.
		expect(offsets({ frame: 5 })).toEqual(offsets({ frame: 20 }));
		expect(offsets({ frame: 30 })).not.toEqual(offsets({ frame: 20 }));

		// Jianying's exact formula, with i as the 1-based unit rank.
		const expectedAt = ({ frame, rank }: { frame: number; rank: number }) => {
			const quantized = Math.floor(frame / 100 / 0.25) * 0.25;
			const swingX = Math.sin(quantized * Math.PI * 2);
			const swingY = Math.cos(quantized * Math.PI * 2);
			return {
				x:
					Math.cos(24.8 * swingX + 7.9 * rank) *
					Math.sin(swingX * Math.PI * 2 + rank) *
					0.04 *
					20,
				y:
					Math.sin(19.1 * swingY + 33.6 * rank) *
					Math.cos(swingY * Math.PI * 2 - rank) *
					0.027 *
					20,
			};
		};
		const frame = 30;
		const state = sample({ frame });
		for (const [index, unit] of state.units.entries()) {
			const expected = expectedAt({ frame, rank: index + 1 });
			expect(unit.visual.translateX).toBeCloseTo(expected.x);
			expect(unit.visual.translateY).toBeCloseTo(expected.y);
		}

		// Rank-keyed phase means neighbours never share an offset.
		expect(
			new Set(state.units.map(({ visual }) => visual.translateX.toFixed(6)))
				.size
		).toBe(state.units.length);
	});
});
