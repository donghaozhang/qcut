import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	evaluateTextKeyframeTrack,
	segmentText,
	selectorUnitWeight,
	type TextAnimationEffect,
	type TextAnimationLayout,
	type TextKeyframePoint,
} from "../text-animation/index.js";
import { normalizeTextAnimationEffect } from "../text-animation/normalize-effect.js";
import {
	createAnimation,
	createElement,
	createPhase,
} from "./text-animation-test-helpers.js";

function createLayout({ content }: { content: string }): TextAnimationLayout {
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

describe("keyframe track evaluation", () => {
	it("interpolates linearly when keys carry no handles", () => {
		const track: TextKeyframePoint[] = [
			{ t: 0, v: 0 },
			{ t: 1, v: 10 },
		];
		expect(evaluateTextKeyframeTrack({ track, progress: 0.5 })).toBeCloseTo(5);
		expect(evaluateTextKeyframeTrack({ track, progress: -1 })).toBe(0);
		expect(evaluateTextKeyframeTrack({ track, progress: 2 })).toBe(10);
	});

	it("holds multi-segment values and picks the right segment", () => {
		const track: TextKeyframePoint[] = [
			{ t: 0, v: 0 },
			{ t: 2 / 3, v: 1 },
			{ t: 1, v: 1 },
		];
		expect(evaluateTextKeyframeTrack({ track, progress: 1 / 3 })).toBeCloseTo(
			0.5
		);
		expect(evaluateTextKeyframeTrack({ track, progress: 0.9 })).toBeCloseTo(1);
	});

	it("bends toward bezier handles like Jianying's 变色弹跳 selector track", () => {
		// The reference selector `start` track, times renormalized from 0..3 s
		// to 0..1: fast open (out handle at +0.15 of the phase) into a long
		// ease-out (in handle reaching back -0.54).
		const track: TextKeyframePoint[] = [
			{ t: 0, v: 0.5, outValue: 0.14000000059604645, outTime: 0.15 },
			{ t: 1, v: 0, inValue: 0.05000000074505806, inTime: -0.54 },
		];
		expect(evaluateTextKeyframeTrack({ track, progress: 0 })).toBeCloseTo(0.5);
		expect(evaluateTextKeyframeTrack({ track, progress: 1 })).toBeCloseTo(0);
		// The handle pair pulls the curve far below the linear midpoint 0.25.
		const middle = evaluateTextKeyframeTrack({ track, progress: 0.5 });
		expect(middle).toBeLessThan(0.15);
		expect(middle).toBeGreaterThan(0);
		// Monotonic descent across the segment.
		let previous = 0.5;
		for (let step = 1; step <= 10; step++) {
			const value = evaluateTextKeyframeTrack({
				track,
				progress: step / 10,
			});
			expect(value).toBeLessThanOrEqual(previous + 1e-9);
			previous = value;
		}
	});
});

describe("keyframes effect", () => {
	const FADE_REVEAL: TextAnimationEffect = {
		kind: "keyframes",
		channels: {
			opacity: [
				{ t: 0, v: 0 },
				{ t: 2 / 3, v: 1 },
				{ t: 1, v: 1 },
			],
			translateYEm: [
				{ t: 0, v: 0.5 },
				{ t: 2 / 3, v: 0 },
				{ t: 1, v: 0 },
			],
			scaleX: [
				{ t: 0, v: 0.8 },
				{ t: 2 / 3, v: 1 },
				{ t: 1, v: 1 },
			],
			scaleY: [
				{ t: 0, v: 0.8 },
				{ t: 2 / 3, v: 1 },
				{ t: 1, v: 1 },
			],
		},
	};

	function sampleEntrance({ frame }: { frame: number }) {
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: FADE_REVEAL,
						target: "textAndBackground",
						duration: 1,
					}),
				}),
			},
		});
		return evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame,
			layout: createLayout({ content: "AB" }),
		});
	}

	it("plays the transcribed 淡入显现 document (data, not code)", () => {
		const start = sampleEntrance({ frame: 0 });
		expect(start.container.opacity).toBeCloseTo(0);
		// 0.5 em below on a 20 px font.
		expect(start.container.translateY).toBeCloseTo(10);
		expect(start.container.scaleX).toBeCloseTo(0.8);

		const settled = sampleEntrance({ frame: 67 });
		expect(settled.container.opacity).toBeCloseTo(1, 1);
		expect(settled.container.translateY).toBeCloseTo(0, 1);
		expect(settled.container.scaleX).toBeCloseTo(1, 1);
	});

	it("drives the render-group glow from glow tracks", () => {
		const effect: TextAnimationEffect = {
			kind: "keyframes",
			glowColor: "#ffeeaa",
			channels: {
				glowIntensity: [
					{ t: 0, v: 0.35 },
					{ t: 0.5, v: 1 },
					{ t: 1, v: 0.35 },
				],
				glowRadiusPx: [{ t: 0, v: 14 }],
			},
		};
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect,
						target: "textAndBackground",
						duration: 1,
					}),
				}),
			},
		});
		const state = evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame: 50,
			layout: createLayout({ content: "AB" }),
		});
		expect(state.container.postProcess?.glow).toEqual({
			color: "#ffeeaa",
			radiusPx: 14,
			intensity: 1,
		});
	});

	it("feeds the color channel from a colorAmount track", () => {
		const effect: TextAnimationEffect = {
			kind: "keyframes",
			color: "#00ffcc",
			channels: {
				colorAmount: [
					{ t: 0, v: 0 },
					{ t: 1, v: 1 },
				],
			},
		};
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect,
						target: "textAndBackground",
						duration: 1,
					}),
				}),
			},
		});
		const state = evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame: 50,
			layout: createLayout({ content: "AB" }),
		});
		expect(state.container.colorMix?.color).toBe("#00ffcc");
		expect(state.container.colorMix?.amount).toBeCloseTo(0.5);
	});
});

describe("animated selector", () => {
	// Jianying 变色弹跳's real selector: the window opens from the text center
	// (0.5, 0.5) to full (0, 1) over the cycle; characters inside get the
	// constant tint + lift, feathered at the moving front.
	const COLOR_BOUNCE_SELECTOR: TextAnimationEffect = {
		kind: "keyframes",
		color: "#ffff00",
		selector: {
			start: [
				{ t: 0, v: 0.5, outValue: 0.14000000059604645, outTime: 0.15 },
				{ t: 1, v: 0, inValue: 0.05000000074505806, inTime: -0.54 },
			],
			end: [
				{ t: 0, v: 0.5, outValue: 0.8600000143051147, outTime: 0.15 },
				{ t: 1, v: 1, inValue: 0.949999988079071, inTime: -0.54 },
			],
			shape: "square",
			feather: 0.25,
		},
		channels: {
			colorAmount: [{ t: 0, v: 1 }],
			translateYEm: [{ t: 0, v: -0.2 }],
		},
	};

	function sampleSelector({ frame }: { frame: number }) {
		const element = createElement({
			overrides: {
				content: "ABCDEF",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: COLOR_BOUNCE_SELECTOR,
						target: "text",
						unit: "grapheme",
						duration: 1,
					}),
				}),
			},
		});
		return evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame,
			layout: createLayout({ content: "ABCDEF" }),
		});
	}

	it("opens the tint window from the center outward", () => {
		const early = sampleSelector({ frame: 8 });
		const centerAmount = early.units[2]?.visual.colorMix?.amount ?? 0;
		const edgeAmount = early.units[0]?.visual.colorMix?.amount ?? 0;
		expect(centerAmount).toBeGreaterThan(edgeAmount);
		expect(centerAmount).toBeGreaterThan(0.5);
	});

	it("covers every character once the window is fully open", () => {
		const settled = sampleSelector({ frame: 99 });
		for (const unit of settled.units) {
			expect(unit.visual.colorMix?.amount ?? 0).toBeGreaterThan(0.95);
			expect(unit.visual.translateY).toBeLessThan(-3.8);
		}
	});

	it("weights shapes across the window", () => {
		const selector = {
			start: [{ t: 0, v: 0 }],
			end: [{ t: 0, v: 1 }],
			shape: "triangle" as const,
			feather: 0,
		};
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.5, progress: 0 })
		).toBeCloseTo(1);
		expect(
			selectorUnitWeight({ selector, unitPosition: 0, progress: 0 })
		).toBeCloseTo(0);
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.25, progress: 0 })
		).toBeCloseTo(0.5);
	});

	it("feathers square windows past their edges", () => {
		const selector = {
			start: [{ t: 0, v: 0.4 }],
			end: [{ t: 0, v: 0.6 }],
			shape: "square" as const,
			feather: 0.2,
		};
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.5, progress: 0 })
		).toBeCloseTo(1);
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.7, progress: 0 })
		).toBeCloseTo(0.5);
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.9, progress: 0 })
		).toBeCloseTo(0);
	});
});

describe("keyframes normalization", () => {
	it("keeps valid tracks, sorts keys, and drops junk", () => {
		expect(
			normalizeTextAnimationEffect({
				value: {
					kind: "keyframes",
					color: " #ffcc00 ",
					channels: {
						opacity: [
							{ t: 1, v: 1 },
							{ t: 0, v: 0, outTime: 0.2, outValue: 0.1 },
							{ t: 0.5, v: "oops" },
						],
						sparkle: [{ t: 0, v: 1 }],
					},
				},
			})
		).toEqual({
			kind: "keyframes",
			channels: {
				opacity: [
					{ t: 0, v: 0, outValue: 0.1, outTime: 0.2 },
					{ t: 1, v: 1 },
				],
			},
			color: "#ffcc00",
		});
	});

	it("rejects documents without a single usable track", () => {
		expect(
			normalizeTextAnimationEffect({
				value: { kind: "keyframes", channels: { opacity: [] } },
			})
		).toBeNull();
		expect(
			normalizeTextAnimationEffect({ value: { kind: "keyframes" } })
		).toBeNull();
	});
});
