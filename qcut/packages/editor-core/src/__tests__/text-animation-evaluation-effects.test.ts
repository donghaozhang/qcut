import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	type TextAnimationEffect,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createLayout,
	createPhase,
} from "./text-animation-test-helpers.js";

describe("text animation frame evaluation", () => {
	const effects: Array<{
		name: TextAnimationEffect["kind"];
		effect: TextAnimationEffect;
		assertState: ({
			state,
		}: {
			state: ReturnType<typeof evaluateTextAnimationFrame>;
		}) => void;
	}> = [
		{
			name: "typewriter",
			effect: {
				kind: "typewriter",
				reveal: "fade",
				cursor: { text: "|", blinkPeriod: 0.5, persist: false },
			},
			assertState: ({ state }) => {
				// A single unit owns the slot [0, 1/2] of the phase, so its fade
				// completes by the midpoint sampled here.
				expect(state.units[0].visual.opacity).toBeCloseTo(1);
				expect(state.decorations.some((item) => item.kind === "cursor")).toBe(
					true
				);
			},
		},
		{
			name: "fade",
			effect: { kind: "fade", minimumOpacity: 0 },
			assertState: ({ state }) =>
				expect(state.container.opacity).toBeCloseTo(0.5),
		},
		{
			name: "slide",
			effect: {
				kind: "slide",
				direction: "up",
				distance: { value: 40, unit: "px" },
				fade: true,
			},
			assertState: ({ state }) => {
				expect(state.container.translateY).toBeCloseTo(20);
				expect(state.container.opacity).toBeCloseTo(0.5);
			},
		},
		{
			name: "blur",
			effect: {
				kind: "blur",
				direction: "left",
				distance: { value: 20, unit: "px" },
				radiusPx: 10,
				fade: true,
			},
			assertState: ({ state }) => {
				expect(state.container.blurPx).toBeCloseTo(5);
				expect(state.container.translateX).not.toBe(0);
			},
		},
		{
			name: "rotate",
			effect: { kind: "rotate", degrees: 180, fade: true },
			assertState: ({ state }) => {
				expect(state.container.rotationDeg).toBeCloseTo(90);
				expect(state.container.opacity).toBeCloseTo(0.5);
			},
		},
		{
			name: "scale",
			effect: { kind: "scale", hiddenScale: 0.5, overshoot: 0, fade: true },
			assertState: ({ state }) =>
				expect(state.container.scaleX).toBeCloseTo(0.75),
		},
		{
			name: "bounce",
			effect: {
				kind: "bounce",
				direction: "up",
				distance: { value: 40, unit: "px" },
				hiddenScale: 0.8,
				spring: { mass: 1, stiffness: 20, damping: 8, velocity: 0 },
			},
			assertState: ({ state }) => {
				expect(state.container.translateY).not.toBe(0);
				expect(state.container.scaleX).not.toBe(1);
			},
		},
		{
			name: "orbit",
			effect: {
				kind: "orbit",
				rotation: "clockwise",
				turns: 0.5,
				radius: { value: 40, unit: "px" },
				fade: true,
			},
			assertState: ({ state }) => {
				expect(state.container.translateY).not.toBe(0);
				expect(state.container.rotationDeg).not.toBe(0);
			},
		},
		{
			name: "laser",
			effect: {
				kind: "laser",
				direction: "right",
				color: "#00ffff",
				thicknessPx: 2,
				glowPx: 10,
				trail: 0.2,
				fade: true,
			},
			assertState: ({ state }) => {
				expect(state.container.mask?.progress).toBeCloseTo(0.5);
				expect(state.decorations).toContainEqual(
					expect.objectContaining({ kind: "laser", progress: 0.5 })
				);
			},
		},
		{
			name: "heart",
			effect: {
				kind: "heart",
				direction: "up",
				distance: { value: 20, unit: "px" },
				hiddenScale: 0.7,
				color: "#ff0000",
				particleCount: 4,
				spread: 1,
				seed: 99,
			},
			assertState: ({ state }) =>
				expect(
					state.decorations.filter((item) => item.kind === "heart")
				).toHaveLength(4),
		},
	];

	for (const testCase of effects) {
		it(`evaluates ${testCase.name} through the shared state model`, () => {
			const target =
				testCase.effect.kind === "typewriter" ? "text" : "textAndBackground";
			const unit = testCase.effect.kind === "typewriter" ? "grapheme" : "all";
			const element = createElement({
				overrides: {
					content: "A",
					textAnimations: createAnimation({
						entrance: createPhase({ effect: testCase.effect, target, unit }),
					}),
				},
			});
			const compiled = compileTextAnimation({ element, fps: 10 });
			const state = evaluateTextAnimationFrame({
				compiled,
				frame: 5,
				layout: createLayout({ content: element.content }),
			});

			expect(state.activePhases).toContain("entrance");
			testCase.assertState({ state });
		});
	}

	it("spirals exit units outward while dropping and spinning", () => {
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 2,
				textAnimations: createAnimation({
					exit: createPhase({
						effect: {
							kind: "spiral",
							turns: 1,
							radius: { value: 1, unit: "em" },
							drop: { value: 1, unit: "boxHeight" },
							fade: true,
						},
						target: "text",
						unit: "grapheme",
						timing: { duration: 1, delay: 0, easing: "linear" },
						sequence: {
							unit: "grapheme",
							order: "forward",
							staggerRatio: 0,
							seed: 7,
						},
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const midway = evaluateTextAnimationFrame({ compiled, frame: 15, layout });
		const visual = midway.units.at(0)?.visual;
		if (!visual) throw new Error("expected exit unit state");
		// Halfway through the exit: on the circle, dropping, spinning, fading.
		expect(Math.hypot(visual.translateX, visual.translateY)).toBeGreaterThan(0);
		expect(visual.rotationDeg).toBeCloseTo(180);
		expect(visual.opacity).toBeLessThan(1);
	});

	it("tumbles exit units on RotateFlyOut's cubic-in shrink-spin-drop", () => {
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 2,
				textAnimations: createAnimation({
					exit: createPhase({
						effect: {
							kind: "tumble",
							spinDeg: -720,
							drop: { value: 2, unit: "em" },
							fade: false,
						},
						target: "text",
						unit: "grapheme",
						timing: { duration: 1, delay: 0, easing: "linear" },
						sequence: {
							unit: "grapheme",
							order: "forward",
							staggerRatio: 0,
							seed: 5,
						},
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const midway = evaluateTextAnimationFrame({ compiled, frame: 15, layout });
		const visual = midway.units.at(0)?.visual;
		if (!visual) throw new Error("expected exit unit state");
		// Halfway in, the cubic-in drive is 0.5^3 = 0.125.
		expect(visual.scaleX).toBeCloseTo(1 - 0.125);
		expect(visual.rotationDeg).toBeCloseTo(-720 * 0.125);
		expect(visual.translateY).toBeCloseTo(2 * 20 * 0.125);
		// It vanishes by scale, not by fading.
		expect(visual.opacity).toBe(1);
	});

	it("scatters exit units on seeded headings with distinct spins", () => {
		const element = createElement({
			overrides: {
				content: "ABCD",
				duration: 2,
				textAnimations: createAnimation({
					exit: createPhase({
						effect: {
							kind: "scatter",
							distance: { value: 2, unit: "em" },
							flicker: false,
							rotateDeg: 60,
							seed: 99,
						},
						target: "text",
						unit: "grapheme",
						timing: { duration: 1, delay: 0, easing: "linear" },
						sequence: {
							unit: "grapheme",
							order: "forward",
							staggerRatio: 0,
							seed: 99,
						},
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const state = evaluateTextAnimationFrame({ compiled, frame: 17, layout });
		const headings = state.units.map(({ visual }) =>
			Math.atan2(visual.translateY, visual.translateX).toFixed(4)
		);
		expect(new Set(headings).size).toBe(state.units.length);
		const repeat = evaluateTextAnimationFrame({ compiled, frame: 17, layout });
		expect(repeat.units.map(({ visual }) => visual.translateX)).toEqual(
			state.units.map(({ visual }) => visual.translateX)
		);
	});

	it("shakes the shrink on quantized steps keyed to unit rank", () => {
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 2,
				textAnimations: createAnimation({
					exit: createPhase({
						effect: {
							kind: "scale",
							shakeEm: 0.1,
							hiddenScale: 0.2,
							overshoot: 0,
							fade: false,
						},
						target: "text",
						unit: "grapheme",
						timing: { duration: 1, delay: 0, easing: "linear" },
						sequence: {
							unit: "grapheme",
							order: "forward",
							staggerRatio: 0,
							seed: 3,
						},
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 40 });
		const layout = createLayout({ content: element.content });
		const at = (frame: number) =>
			evaluateTextAnimationFrame({ compiled, frame, layout });
		// Frames inside one quantized step share the same shake offset.
		expect(at(41).units[0].visual.translateX).toBeCloseTo(
			at(42).units[0].visual.translateX
		);
		// Ranks shake apart from each other.
		const state = at(50);
		expect(state.units[0].visual.translateX).not.toBeCloseTo(
			state.units[1].visual.translateX
		);
		expect(state.units[0].visual.scaleX).toBeLessThan(1);
	});

	it("scales only the X axis for axis-locked scale effects", () => {
		const element = createElement({
			overrides: {
				content: "A",
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: {
							kind: "scale",
							hiddenScale: 0,
							overshoot: 0,
							fade: false,
							axis: "x",
						},
						target: "textAndBackground",
						unit: "all",
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const state = evaluateTextAnimationFrame({
			compiled,
			frame: 5,
			layout: createLayout({ content: element.content }),
		});

		// Jianying's 翻动 unfolds glyphs horizontally: X animates, Y stays 1.
		expect(state.container.scaleX).toBeCloseTo(0.5);
		expect(state.container.scaleY).toBeCloseTo(1);
	});

	it("reveals rhythm typewriter units on the cycled weight slots", () => {
		const rhythm = [1, 3];
		const element = createElement({
			overrides: {
				content: "ABCD",
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: { kind: "typewriter", reveal: "step", rhythm },
						target: "text",
						unit: "grapheme",
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 100 });

		expect(compiled.entrance?.typewriterRhythm).toEqual({
			weights: [1, 3],
			prefixTotals: [0, 1, 4],
			cycleTotal: 4,
			total: 8,
			span: 0.8,
		});
		const partialCycle = compileTextAnimation({
			element: { ...element, content: "ABCDE" },
			fps: 100,
		});
		expect(partialCycle.entrance?.typewriterRhythm).toMatchObject({
			total: 9,
			span: 5 / 6,
		});
		// Weights cycle 1,3,1,3 over four units: total 8, span 4/5. Unit slots
		// end at (cumulative/total)*span: 0.1, 0.4, 0.5, 0.8 of the phase.
		const revealFrames = [0, 1, 2, 3].map((rank) => {
			for (let frame = 0; frame <= 100; frame += 1) {
				const state = evaluateTextAnimationFrame({
					compiled,
					frame,
					layout: createLayout({ content: element.content }),
				});
				if (state.units[rank]?.visual.opacity >= 1 - 1e-6) return frame / 100;
			}
			return Number.POSITIVE_INFINITY;
		});

		expect(revealFrames[0]).toBeCloseTo(0.1, 1);
		expect(revealFrames[1]).toBeCloseTo(0.4, 1);
		expect(revealFrames[2]).toBeCloseTo(0.5, 1);
		expect(revealFrames[3]).toBeCloseTo(0.8, 1);
		// Irregular rhythm: the second slot is three times the first.
		expect(revealFrames[1] - revealFrames[0]).toBeGreaterThan(
			2 * (revealFrames[2] - revealFrames[1])
		);
	});

	it("keeps heart particles visible when spring easing overshoots early", () => {
		const heartEffect: TextAnimationEffect = {
			kind: "heart",
			direction: "up",
			distance: { value: 20, unit: "px" },
			hiddenScale: 0.7,
			color: "#ff0000",
			particleCount: 4,
			spread: 1,
			seed: 99,
		};
		const entrance = createPhase({ effect: heartEffect });
		const element = createElement({
			overrides: {
				content: "A",
				textAnimations: createAnimation({
					entrance: {
						...entrance,
						timing: {
							...entrance.timing,
							easing: {
								type: "spring",
								mass: 1,
								stiffness: 170,
								damping: 18,
								velocity: 0,
							},
						},
					},
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const state = evaluateTextAnimationFrame({
			compiled,
			frame: 5,
			layout: createLayout({ content: element.content }),
		});

		expect(
			state.decorations.filter((decoration) => decoration.kind === "heart")
		).toHaveLength(4);
	});
});
