import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	evaluateTextColorKeyframeTrack,
	evaluateTextKeyframeTrack,
	multiplyTextAnimationColors,
	sampleTextAnimationPalette,
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

	it("wraps marquee characters around the period seamlessly", () => {
		const element = createElement({
			overrides: {
				content: "AB",
				duration: 3,
				textAnimations: createAnimation({
					loop: createPhase({
						effect: { kind: "marquee", gapEm: 1, alternate: true },
						unit: "grapheme",
						// Per-unit target: the block-level target would evaluate
						// the marquee once and land it on the container.
						target: "text",
						duration: 1,
					}),
				}),
			},
		});
		const compiled = compileTextAnimation({ element, fps: 100 });
		const layout = createLayout({ content: "AB" });
		const at = (frame: number) =>
			evaluateTextAnimationFrame({ compiled, frame, layout });
		// Period = block width 40 + gap 20 = 60. Identity at the cycle edges.
		expect(at(0).units[0]?.visual.translateX).toBeCloseTo(0);
		expect(at(0).units[1]?.visual.translateX).toBeCloseTo(0);
		// Halfway: A (center 10) slides +30 into the gap; B (center 30) has
		// wrapped and re-entered from the left edge.
		const mid = at(50);
		expect(mid.units[0]?.visual.translateX).toBeCloseTo(30);
		expect(mid.units[1]?.visual.translateX).toBeCloseTo(-30);
	});

	it("drives the outline crossfade from the outlineAmount track", () => {
		const effect: TextAnimationEffect = {
			kind: "keyframes",
			channels: {
				// Over-range endpoints prove the clamp; the midpoint blends.
				outlineAmount: [
					{ t: 0, v: 1.4 },
					{ t: 0.5, v: 0.5 },
					{ t: 1, v: -0.4 },
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
		const compiled = compileTextAnimation({ element, fps: 100 });
		const layout = createLayout({ content: "AB" });
		const at = (frame: number) =>
			evaluateTextAnimationFrame({ compiled, frame, layout });
		expect(at(0).container.outlineAmount).toBe(1);
		expect(at(50).container.outlineAmount).toBeCloseTo(0.5);
		expect(at(99).container.outlineAmount).toBeCloseTo(0, 1);
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

	it("selects nothing outside a collapsed window even with feather", () => {
		// twist-dissolve's end track grows from [0, 0]; outward feather must
		// not pre-select the line before the sweep starts.
		const selector = {
			start: [{ t: 0, v: 0 }],
			end: [{ t: 0, v: 0 }],
			shape: "square" as const,
			feather: 1,
		};
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.1, progress: 0 })
		).toBe(0);
		expect(
			selectorUnitWeight({ selector, unitPosition: 0.9, progress: 0 })
		).toBe(0);
	});

	it("holds ramps at full weight past their full edge", () => {
		const rampUp = {
			start: [{ t: 0, v: 0.2 }],
			end: [{ t: 0, v: 0.4 }],
			shape: "rampUp" as const,
			feather: 0,
		};
		expect(
			selectorUnitWeight({ selector: rampUp, unitPosition: 0.9, progress: 0 })
		).toBe(1);
		expect(
			selectorUnitWeight({ selector: rampUp, unitPosition: 0.3, progress: 0 })
		).toBeCloseTo(0.5);
		expect(
			selectorUnitWeight({ selector: rampUp, unitPosition: 0.1, progress: 0 })
		).toBe(0);

		const rampDown = { ...rampUp, shape: "rampDown" as const };
		expect(
			selectorUnitWeight({ selector: rampDown, unitPosition: 0.1, progress: 0 })
		).toBe(1);
		expect(
			selectorUnitWeight({ selector: rampDown, unitPosition: 0.9, progress: 0 })
		).toBe(0);
	});
});

describe("ramp wipe selector", () => {
	// Jianying 蓝瓣划入's real selector: start 0 / end 1 with the `offset`
	// keyframed -1 → 1 (baked here into both window tracks), rampUp shape.
	// Selected characters collapse to a point 0.3 em below home with a blue
	// tint; the sweep releases them left to right.
	const PETAL_WIPE: TextAnimationEffect = {
		kind: "keyframes",
		color: "#3dabff",
		selector: {
			start: [
				{ t: 0, v: -1, outValue: -0.34, outTime: 0.209 },
				{
					t: 0.633,
					v: 1,
					inValue: 0.32,
					inTime: -0.215,
					outValue: 1,
					outTime: 0.121,
				},
				{ t: 1, v: 1, inValue: 1, inTime: -0.125 },
			],
			end: [
				{ t: 0, v: 0, outValue: 0.66, outTime: 0.209 },
				{
					t: 0.633,
					v: 2,
					inValue: 1.32,
					inTime: -0.215,
					outValue: 2,
					outTime: 0.121,
				},
				{ t: 1, v: 2, inValue: 2, inTime: -0.125 },
			],
			shape: "rampUp",
			feather: 0,
		},
		channels: {
			scaleX: [{ t: 0, v: 0 }],
			scaleY: [{ t: 0, v: 0 }],
			translateYEm: [{ t: 0, v: 0.3 }],
			colorAmount: [{ t: 0, v: 1 }],
		},
	};

	function sampleWipe({ frame }: { frame: number }) {
		const element = createElement({
			overrides: {
				content: "ABCDEF",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect: PETAL_WIPE,
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

	it("hides every character before the sweep starts", () => {
		const start = sampleWipe({ frame: 0 });
		for (const unit of start.units) {
			expect(unit.visual.scaleX).toBeCloseTo(0);
			// Anchored 0.3 em below home on a 20 px font.
			expect(unit.visual.translateY).toBeCloseTo(6);
			expect(unit.visual.colorMix?.amount ?? 0).toBeCloseTo(1);
		}
	});

	it("releases characters left to right as the window sweeps", () => {
		const mid = sampleWipe({ frame: 25 });
		const amounts = mid.units.map((unit) => unit.visual.colorMix?.amount ?? 0);
		for (let index = 1; index < amounts.length; index++) {
			expect(amounts[index]).toBeGreaterThanOrEqual(amounts[index - 1] - 1e-9);
		}
		expect(amounts[0]).toBeLessThan(amounts[amounts.length - 1]);
		const first = mid.units[0]?.visual;
		const last = mid.units[5]?.visual;
		expect(first?.scaleX ?? 0).toBeGreaterThan(last?.scaleX ?? 0);
	});

	it("settles every character once the offset reaches 1", () => {
		const settled = sampleWipe({ frame: 70 });
		for (const unit of settled.units) {
			expect(unit.visual.scaleX).toBeCloseTo(1);
			expect(unit.visual.translateY).toBeCloseTo(0);
			expect(unit.visual.colorMix?.amount ?? 0).toBeCloseTo(0);
		}
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

	it("round-trips an animated tint track and drops junk points", () => {
		expect(
			normalizeTextAnimationEffect({
				value: {
					kind: "keyframes",
					channels: { colorAmount: [{ t: 0, v: 1 }] },
					colorTrack: [
						{ t: 1, v: [1, 1, 1] },
						{ t: 0, v: [1, 0, 0], outValue: [0.9, 0.19, 0.33], outTime: 0.13 },
						{ t: 0.5, v: "oops" },
						{ t: 0.6, v: [1, 2] },
					],
				},
			})
		).toEqual({
			kind: "keyframes",
			channels: { colorAmount: [{ t: 0, v: 1 }] },
			colorTrack: [
				{ t: 0, v: [1, 0, 0], outValue: [0.9, 0.19, 0.33], outTime: 0.13 },
				{ t: 1, v: [1, 1, 1] },
			],
		});
	});
});

describe("animated tint track", () => {
	it("sweeps 彩虹渐变's red→violet→white color keys", () => {
		// The reference color track (times renormalized /3), per-component
		// cubic handles preserved.
		const track = [
			{
				t: 0,
				v: [1, 0, 0] as [number, number, number],
				outValue: [0.902, 0.186, 0.33] as [number, number, number],
				outTime: 0.132,
			},
			{
				t: 0.4,
				v: [0.703, 0.563, 1] as [number, number, number],
				inValue: [0.804, 0.371, 0.66] as [number, number, number],
				inTime: -0.136,
				// biome-ignore lint/suspicious/noApproximativeNumericConstant: transcribed handle value, not Math.SQRT1_2
				outValue: [0.801, 0.707, 1] as [number, number, number],
				outTime: 0.198,
			},
			{
				t: 1,
				v: [1, 1, 1] as [number, number, number],
				inValue: [0.899, 0.851, 1] as [number, number, number],
				inTime: -0.204,
			},
		];
		expect(evaluateTextColorKeyframeTrack({ track, progress: 0 })).toBe(
			"#ff0000"
		);
		expect(evaluateTextColorKeyframeTrack({ track, progress: 0.4 })).toBe(
			"#b390ff"
		);
		expect(evaluateTextColorKeyframeTrack({ track, progress: 1 })).toBe(
			"#ffffff"
		);
		// Mid-sweep the red channel dips while blue has risen — the violet leg.
		const middle = evaluateTextColorKeyframeTrack({ track, progress: 0.2 });
		const red = Number.parseInt(middle.slice(1, 3), 16);
		const blue = Number.parseInt(middle.slice(5, 7), 16);
		expect(red).toBeLessThan(255);
		expect(blue).toBeGreaterThan(64);
	});

	it("feeds the per-unit color mix from the track", () => {
		const effect: TextAnimationEffect = {
			kind: "keyframes",
			colorTrack: [
				{ t: 0, v: [1, 0, 0] },
				{ t: 1, v: [0, 0, 1] },
			],
			channels: {
				opacity: [{ t: 0, v: 1 }],
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
		expect(state.container.colorMix?.color).toBe("#800080");
		expect(state.container.colorMix?.amount).toBe(1);
		// Jianying tint tracks are multiplicative: white keys mean "no tint"
		// whatever the element's own fill is.
		expect(state.container.colorMix?.mode).toBe("multiply");
	});

	it("lands each rank on its own palette stop", () => {
		// 彩虹's per-character rotation: rank r sits at position r/stops, which
		// must floor onto stop r exactly — the old wrap arithmetic dropped
		// ranks 1 and 2 onto the previous stop.
		const palette = ["#111111", "#222222", "#333333", "#444444", "#555555"];
		const sampled = [0, 1, 2, 3, 4].map((rank) =>
			sampleTextAnimationPalette({
				palette,
				position: rank / palette.length,
				stepped: true,
			})
		);
		expect(sampled).toEqual(palette);
		// Negative positions still wrap to the end of the palette.
		expect(
			sampleTextAnimationPalette({
				palette,
				position: -0.2,
				stepped: true,
			})
		).toBe("#555555");
		// Every negative stop boundary lands exactly: wrapping in 0..1 space
		// first put −0.8 at 0.999… and picked stop 0 instead of stop 1.
		expect(
			[-0.8, -0.6, -0.4, -0.2].map((position) =>
				sampleTextAnimationPalette({ palette, position, stepped: true })
			)
		).toEqual(["#222222", "#333333", "#444444", "#555555"]);
		// Other palette lengths keep their exact boundaries too.
		expect(
			sampleTextAnimationPalette({
				palette: ["#aaaaaa", "#bbbbbb", "#cccccc"],
				position: -1 / 3,
				stepped: true,
			})
		).toBe("#cccccc");
	});

	it("filters colors multiplicatively with white as identity", () => {
		expect(
			multiplyTextAnimationColors({
				base: "#ff0000",
				tint: "#ffffff",
				amount: 1,
			})
		).toBe("#ff0000");
		expect(
			multiplyTextAnimationColors({
				base: "#ff8000",
				tint: "#80ff80",
				amount: 1,
			})
		).toBe("#808000");
		expect(
			multiplyTextAnimationColors({
				base: "#ff0000",
				tint: "#000000",
				amount: 0.5,
			})
		).toBe("#800000");
	});

	it("maps rank-based selectors through the sequence order", () => {
		// 扭曲消散's randomSort: with basedOn "rank" and a reverse sequence the
		// window consumes the LAST character first.
		const effect: TextAnimationEffect = {
			kind: "keyframes",
			channels: { opacity: [{ t: 0, v: 0 }] },
			selector: {
				start: [{ t: 0, v: 0 }],
				end: [{ t: 0, v: 0.4 }],
				shape: "square",
				feather: 0,
				basedOn: "rank",
			},
		};
		const element = createElement({
			overrides: {
				content: "ABCDEF",
				duration: 3,
				textAnimations: createAnimation({
					entrance: createPhase({
						effect,
						target: "text",
						unit: "grapheme",
						order: "reverse",
						duration: 1,
					}),
				}),
			},
		});
		const state = evaluateTextAnimationFrame({
			compiled: compileTextAnimation({ element, fps: 100 }),
			frame: 10,
			layout: createLayout({ content: "ABCDEF" }),
		});
		// Ranks run 5..0 left to right, so the [0, 0.4] window covers the two
		// RIGHTMOST characters (ranks 0 and 1) and leaves the first ones alone.
		expect(state.units[5]?.visual.opacity).toBeCloseTo(0);
		expect(state.units[4]?.visual.opacity).toBeCloseTo(0);
		expect(state.units[0]?.visual.opacity).toBeCloseTo(1);
	});
});
