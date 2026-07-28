import { describe, expect, it } from "vitest";
import type { TextElement } from "../types/timeline.js";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	type TextAnimationEffect,
	type TextAnimationOrder,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createLayout,
	createPhase,
} from "./text-animation-test-helpers.js";

describe("text animation frame evaluation", () => {
	it("places the typewriter cursor at the revealed grapheme boundary", () => {
		const build = ({ order }: { order: TextAnimationOrder }) => {
			const element = createElement({
				overrides: {
					content: "ABC",
					textAnimations: createAnimation({
						entrance: createPhase({
							effect: {
								kind: "typewriter",
								reveal: "step",
								cursor: { text: "|", blinkPeriod: 0.5, persist: true },
							},
							unit: "grapheme",
							order,
							staggerRatio: 0.8,
							target: "text",
						}),
					}),
				},
			});
			return { element, compiled: compileTextAnimation({ element, fps: 10 }) };
		};
		const forward = build({ order: "forward" });
		const atStart = evaluateTextAnimationFrame({
			compiled: forward.compiled,
			frame: 0,
			layout: createLayout({ content: forward.element.content }),
		});
		const afterEntrance = evaluateTextAnimationFrame({
			compiled: forward.compiled,
			frame: 10,
			layout: createLayout({ content: forward.element.content }),
		});
		const reverse = build({ order: "reverse" });
		const afterReverse = evaluateTextAnimationFrame({
			compiled: reverse.compiled,
			frame: 10,
			layout: createLayout({ content: reverse.element.content }),
		});
		const random = build({ order: "random" });
		const expectedRandomBoundary = random.compiled.entrance?.units.find(
			(unit) => unit.rank === 2
		)?.graphemeEnd;
		const afterRandom = evaluateTextAnimationFrame({
			compiled: random.compiled,
			frame: 10,
			layout: createLayout({ content: random.element.content }),
		});
		const cursorBoundary = ({
			state,
		}: {
			state: ReturnType<typeof evaluateTextAnimationFrame>;
		}) =>
			state.decorations.find((item) => item.kind === "cursor")?.afterGrapheme;

		expect(cursorBoundary({ state: atStart })).toBe(0);
		expect(cursorBoundary({ state: afterEntrance })).toBe(3);
		expect(cursorBoundary({ state: afterReverse })).toBe(1);
		expect(cursorBoundary({ state: afterRandom })).toBe(expectedRandomBoundary);
	});

	it("reveals typewriter units on Jianying's (rank+1)/(count+1) slots", () => {
		const element = createElement({
			overrides: {
				content: "ABC",
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: { kind: "typewriter", reveal: "step" },
						unit: "grapheme",
						staggerRatio: 0.58,
						target: "text",
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const visibleUnits = ({ frame }: { frame: number }) =>
			evaluateTextAnimationFrame({ compiled, frame, layout }).units.filter(
				(unit) => unit.visual.opacity > 0.5
			).length;

		// Nothing is revealed at progress 0, units land at 1/4, 2/4, and 3/4 of
		// the phase, and the full text is visible one slot before the end.
		expect(visibleUnits({ frame: 0 })).toBe(0);
		expect(visibleUnits({ frame: 3 })).toBe(1);
		expect(visibleUnits({ frame: 5 })).toBe(2);
		expect(visibleUnits({ frame: 8 })).toBe(3);
	});

	it("keeps the cursor solid while typing and blinks it relative to its phase afterwards", () => {
		const createTypewriter = ({ startTime }: { startTime: number }) => {
			const element = createElement({
				overrides: {
					startTime,
					textAnimations: createAnimation({
						entrance: createPhase({
							effect: {
								kind: "typewriter",
								reveal: "step",
								cursor: { text: "|", blinkPeriod: 0.5, persist: true },
							},
							unit: "grapheme",
							target: "text",
						}),
					}),
				},
			});
			return { element, compiled: compileTextAnimation({ element, fps: 10 }) };
		};
		const atOrigin = createTypewriter({ startTime: 0 });
		const shifted = createTypewriter({ startTime: 0.7 });
		const cursorOpacity = ({
			element,
			compiled,
			frame,
		}: {
			element: TextElement;
			compiled: ReturnType<typeof compileTextAnimation>;
			frame: number;
		}) =>
			evaluateTextAnimationFrame({
				compiled,
				frame,
				layout: createLayout({ content: element.content }),
			}).decorations.find((decoration) => decoration.kind === "cursor")
				?.opacity;

		expect(
			cursorOpacity({
				...atOrigin,
				frame: atOrigin.compiled.entrance?.startFrame ?? 0,
			})
		).toBe(1);
		// Solid mid-phase: Jianying never blinks the cursor while typing.
		expect(
			cursorOpacity({
				...shifted,
				frame: (shifted.compiled.entrance?.startFrame ?? 0) + 5,
			})
		).toBe(1);
		// After the phase the persisting cursor blinks, anchored to the phase
		// start rather than the timeline origin.
		expect(
			cursorOpacity({
				...atOrigin,
				frame: (atOrigin.compiled.entrance?.startFrame ?? 0) + 15,
			})
		).toBe(0);
		expect(
			cursorOpacity({
				...shifted,
				frame: (shifted.compiled.entrance?.startFrame ?? 0) + 15,
			})
		).toBe(0);
	});

	it("moves a reverse typewriter exit cursor from the end toward the start", () => {
		const element = createElement({
			overrides: {
				content: "ABC",
				textAnimations: createAnimation({
					exit: createPhase({
						effect: {
							kind: "typewriter",
							reveal: "step",
							cursor: { text: "|", blinkPeriod: 0.5, persist: false },
						},
						unit: "grapheme",
						order: "reverse",
						staggerRatio: 0.8,
						target: "text",
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const cursorAt = ({ frame }: { frame: number }) =>
			evaluateTextAnimationFrame({ compiled, frame, layout }).decorations.find(
				(decoration) => decoration.kind === "cursor"
			)?.afterGrapheme;

		expect(cursorAt({ frame: 10 })).toBe(3);
		expect(cursorAt({ frame: 15 })).toBe(1);
		expect(cursorAt({ frame: 19 })).toBe(0);
	});

	it("evaluates exit from identity toward the hidden state", () => {
		const element = createElement({
			overrides: {
				textAnimations: createAnimation({
					exit: createPhase({ effect: { kind: "fade", minimumOpacity: 0 } }),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const start = evaluateTextAnimationFrame({ compiled, frame: 10, layout });
		const middle = evaluateTextAnimationFrame({ compiled, frame: 15, layout });

		expect(start.container.opacity).toBe(1);
		expect(middle.container.opacity).toBeCloseTo(0.5);
		expect(middle.activePhases).toEqual(["exit"]);
	});

	it("honors loop gap, alternate mode, and finite repeat count", () => {
		const base = createPhase({
			effect: { kind: "fade", minimumOpacity: 0.2 },
			duration: 0.5,
		});
		const element = createElement({
			overrides: {
				duration: 3,
				textAnimations: createAnimation({
					loop: {
						...base,
						repeat: { mode: "alternate", count: 2, gap: 0.5, phaseOffset: 0 },
					},
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });
		const active = evaluateTextAnimationFrame({ compiled, frame: 2, layout });
		const gap = evaluateTextAnimationFrame({ compiled, frame: 7, layout });
		const finished = evaluateTextAnimationFrame({
			compiled,
			frame: 22,
			layout,
		});

		expect(active.activePhases).toEqual(["loop"]);
		expect(active.container.opacity).toBeLessThan(1);
		expect(gap.activePhases).toEqual([]);
		expect(finished.activePhases).toEqual([]);
		expect(finished.container.opacity).toBe(1);
	});

	it("stops the loop when the exit window begins", () => {
		const loopBase = createPhase({
			effect: { kind: "rotate", degrees: 360, fade: false },
			duration: 0.5,
		});
		const element = createElement({
			overrides: {
				textAnimations: createAnimation({
					loop: {
						...loopBase,
						repeat: { mode: "restart", gap: 0, phaseOffset: 0 },
					},
					exit: createPhase({
						effect: { kind: "fade", minimumOpacity: 0 },
						duration: 0.5,
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const state = evaluateTextAnimationFrame({
			compiled,
			frame: 16,
			layout: createLayout({ content: element.content }),
		});

		expect(compiled.loop?.endFrame).toBe(compiled.exit?.startFrame);
		expect(state.activePhases).toEqual(["exit"]);
		expect(state.container.rotationDeg).toBe(0);
	});

	it("uses persisted seeds for deterministic heart decorations", () => {
		const effect: TextAnimationEffect = {
			kind: "heart",
			direction: "up",
			distance: { value: 20, unit: "px" },
			hiddenScale: 0.7,
			color: "#ff0000",
			particleCount: 5,
			spread: 1,
			seed: 42,
		};
		const element = createElement({
			overrides: {
				textAnimations: createAnimation({ entrance: createPhase({ effect }) }),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 10 });
		const input = {
			compiled,
			frame: 5,
			layout: createLayout({ content: element.content }),
		};

		expect(evaluateTextAnimationFrame(input).decorations).toEqual(
			evaluateTextAnimationFrame(input).decorations
		);
	});

	it("does not render outside the trim-aware visible interval", () => {
		const element = createElement({ overrides: { startTime: 1, duration: 1 } });
		const compiled = compileTextAnimation({ element, fps: 10 });
		const layout = createLayout({ content: element.content });

		expect(
			evaluateTextAnimationFrame({ compiled, frame: 9, layout }).render
		).toBe(false);
		expect(
			evaluateTextAnimationFrame({ compiled, frame: 10, layout }).render
		).toBe(true);
		expect(
			evaluateTextAnimationFrame({ compiled, frame: 20, layout }).render
		).toBe(false);
	});
});
