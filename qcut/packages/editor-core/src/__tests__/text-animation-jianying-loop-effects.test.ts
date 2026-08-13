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

	it("swings the block with a perspective gradient like 空间翻转", () => {
		const effect: TextAnimationEffect = {
			kind: "flip",
			maxAngleDeg: 32,
			perspective: 0.35,
		};
		const sample = ({ frame }: { frame: number }) =>
			sampleLoop({ effect, frame, content: "ABCD", unit: "grapheme" });

		// Tilt runs on the cos phase: full tilt at 0, level at the quarters.
		const start = sample({ frame: 0 });
		expect(start.units.at(0)?.visual.rotationDeg).toBeCloseTo(32);
		expect(sample({ frame: 25 }).units.at(0)?.visual.rotationDeg).toBeCloseTo(
			0,
			5
		);
		expect(sample({ frame: 50 }).units.at(0)?.visual.rotationDeg).toBeCloseTo(
			-32
		);

		// Perspective runs on the sin phase: level frames carry the strongest
		// scale spread, and it grows across the line like a yawing plane.
		const level = sample({ frame: 25 });
		const scales = level.units.map(({ visual }) => visual.scaleX);
		expect(scales.at(0)).toBeLessThan(1);
		expect(scales.at(-1)).toBeGreaterThan(1);
		for (let index = 1; index < scales.length; index += 1) {
			expect(scales[index]).toBeGreaterThan(scales[index - 1]);
		}
		// At full tilt the gradient rests.
		for (const unit of start.units) {
			expect(unit.visual.scaleX).toBeCloseTo(1);
		}

		// The tilt is rigid: unit offsets follow one rotation about the
		// layout center rather than spinning in place.
		const first = start.units.at(0);
		expect(first?.visual.translateX).not.toBeCloseTo(0);
	});

	it("drives a real Y-axis plane projection for the 3D flip", () => {
		const effect: TextAnimationEffect = {
			kind: "flip3d",
			axis: "y",
			maxAngleDeg: 60,
			cameraFovDeg: 30,
			motionRatio: 0.8,
			motionEasing: "linear",
		};
		const peak = sampleLoop({ effect, frame: 40 });
		const resting = sampleLoop({ effect, frame: 80 });

		expect(peak.container.projection).toEqual({
			kind: "plane",
			cameraFovDeg: 30,
			rotationXDeg: 0,
			rotationYDeg: 60,
		});
		expect(resting.container.projection).toMatchObject({ rotationYDeg: 0 });
	});

	it("rotates the complete text texture around a cylindrical surface", () => {
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

	it("keeps per-glyph 3D jitter deterministic and carries its trail state", () => {
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
			seed: 42,
			trailSamples: 12,
			trailStrength: 0.65,
			trapezoidAmount: 0.12,
		};
		const first = sampleLoop({
			effect,
			frame: 17,
			content: "ABCD",
			unit: "grapheme",
		});
		const repeated = sampleLoop({
			effect,
			frame: 17,
			content: "ABCD",
			unit: "grapheme",
		});

		expect(repeated.units).toEqual(first.units);
		expect(first.units.every(({ visual }) => visual.projection)).toBe(true);
		expect(first.units.at(0)?.visual.projection).toMatchObject({
			kind: "plane",
			rotationYDeg: 20,
		});
		expect(first.units.at(0)?.visual.postProcess).toEqual({
			trailSamples: 12,
			trailStrength: 0.65,
			trapezoidAmount: 0.12,
		});
		expect(
			new Set(first.units.map(({ visual }) => visual.rotationYDeg?.toFixed(5)))
				.size
		).toBeGreaterThan(1);
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

	it("spreads staggered loop units around the whole orbit like 环绕", () => {
		// Loop stagger is a cyclic phase offset, so at any instant the units
		// occupy distinct points of the shared circle instead of bunching at
		// the endpoints of a one-shot window.
		const effect: TextAnimationEffect = {
			kind: "orbit",
			rotation: "clockwise",
			turns: 1,
			radius: { value: 1.05, unit: "boxHeight" },
			ring: true,
			fade: false,
		};
		const element = createLoopElement({
			effect,
			content: "ABCD",
			unit: "grapheme",
		});
		element.textAnimations = {
			schemaVersion: 1,
			loop: {
				...element.textAnimations?.loop,
				sequence: {
					unit: "grapheme",
					order: "forward",
					staggerRatio: 0.95,
					seed: 12,
				},
			},
		} as typeof element.textAnimations;
		const state = evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame: 30,
			layout: createHorizontalLayout({ content: element.content }),
		});

		const angles = state.units.map(({ visual }) => visual.rotationDeg);
		expect(new Set(angles.map((angle) => angle.toFixed(3))).size).toBe(4);
		const spread = Math.max(...angles) - Math.min(...angles);
		expect(spread).toBeGreaterThan(180);

		// Ring mode: every transformed unit center sits on one circle around
		// the layout center, not on a circle around its own line position.
		const layout = createHorizontalLayout({ content: "ABCD" });
		const radius = 1.05 * layout.bounds.height;
		const centerX = layout.bounds.x + layout.bounds.width / 2;
		const centerY = layout.bounds.y + layout.bounds.height / 2;
		for (const [index, unit] of state.units.entries()) {
			const grapheme = layout.graphemes[index];
			const baseX = grapheme.bounds.x + grapheme.bounds.width / 2;
			const baseY = grapheme.bounds.y + grapheme.bounds.height / 2;
			const x = baseX + unit.visual.translateX;
			const y = baseY + unit.visual.translateY;
			expect(Math.hypot(x - centerX, y - centerY)).toBeCloseTo(radius);
		}
	});

	it("keeps vortex glyphs upright while they trace their circles", () => {
		// Jianying's 漩涡 Lua only writes translate channels — no rotation.
		const effect: TextAnimationEffect = {
			kind: "orbit",
			rotation: "clockwise",
			turns: 1,
			radius: { value: 0.35, unit: "em" },
			spin: false,
			fade: false,
		};
		const state = sampleLoop({
			effect,
			frame: 30,
			content: "ABCD",
			unit: "grapheme",
		});
		for (const unit of state.units) {
			expect(unit.visual.rotationDeg).toBe(0);
		}
		expect(state.units.at(0)?.visual.translateX).not.toBeCloseTo(0);
	});

	it("bows the line into an arc with outward-tilting ends", () => {
		const effect: TextAnimationEffect = {
			kind: "arc",
			riseEm: 0.5,
			tiltDeg: 20,
		};
		const state = sampleLoop({
			effect,
			frame: 50,
			content: "ABCD",
			unit: "grapheme",
		});
		const lifts = state.units.map(({ visual }) => -visual.translateY);
		// Center units rise the most; every unit rises at the half cycle.
		expect(Math.max(...lifts.slice(1, 3))).toBeGreaterThan(lifts[0]);
		for (const lift of lifts) expect(lift).toBeGreaterThan(0);
		// Ends tilt in opposite directions.
		const first = state.units.at(0)?.visual.rotationDeg ?? 0;
		const last = state.units.at(-1)?.visual.rotationDeg ?? 0;
		expect(Math.sign(first)).toBe(-Math.sign(last));
	});

	it("travels a squash wave across the line", () => {
		const effect: TextAnimationEffect = {
			kind: "squeeze",
			amount: 0.5,
			spatialCycles: 1.2,
		};
		const state = sampleLoop({
			effect,
			frame: 10,
			content: "ABCD",
			unit: "grapheme",
		});
		const scales = state.units.map(({ visual }) => visual.scaleY);
		expect(new Set(scales.map((value) => value.toFixed(4))).size).toBe(4);
		for (const scale of scales) {
			expect(scale).toBeLessThanOrEqual(1);
			expect(scale).toBeGreaterThanOrEqual(0.5);
		}
	});

	it("ripples the fold along unit ranks and never vanishes", () => {
		const effect: TextAnimationEffect = {
			kind: "fold",
			minimumScale: 0.05,
			phaseStepDeg: 90,
		};
		const state = sampleLoop({
			effect,
			frame: 0,
			content: "ABCD",
			unit: "grapheme",
		});
		const scales = state.units.map(({ visual }) => visual.scaleX);
		// rank phase steps of 90° make neighbours alternate open/flat.
		expect(scales[0]).toBeCloseTo(1);
		expect(scales[1]).toBeCloseTo(0.05);
		expect(scales[2]).toBeCloseTo(1);
		for (const scale of scales) expect(scale).toBeGreaterThan(0);
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
