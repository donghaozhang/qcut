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
