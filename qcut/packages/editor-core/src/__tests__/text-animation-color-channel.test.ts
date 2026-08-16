import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	mixTextAnimationColors,
	parseTextAnimationHexColor,
	sampleTextAnimationPalette,
	segmentText,
	type TextAnimationEffect,
	type TextAnimationLayout,
	type TextAnimationOrder,
	type TextAnimationUnit,
} from "../text-animation/index.js";
import { normalizeTextAnimationEffect } from "../text-animation/normalize-effect.js";
import {
	createAnimation,
	createElement,
	createPhase,
} from "./text-animation-test-helpers.js";

const FPS = 100;

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

function sampleColorLoop({
	effect,
	frame,
	content = "ABCD",
	unit = "grapheme",
	order = "forward",
	staggerRatio = 0,
}: {
	effect: TextAnimationEffect;
	frame: number;
	content?: string;
	unit?: TextAnimationUnit;
	order?: TextAnimationOrder;
	staggerRatio?: number;
}) {
	const loop = {
		...createPhase({
			effect,
			target: unit === "all" ? "textAndBackground" : "text",
			unit,
			order,
			staggerRatio,
		}),
		repeat: { mode: "restart" as const, gap: 0, phaseOffset: 0 },
	};
	const element = createElement({
		overrides: {
			content,
			duration: 3,
			textAnimations: createAnimation({ loop }),
		},
	});
	return evaluateTextAnimationFrame({
		compiled: compileTextAnimation({ element, fps: FPS }),
		frame,
		layout: createHorizontalLayout({ content }),
	});
}

const COLOR_BOUNCE: TextAnimationEffect = {
	kind: "colorCycle",
	palette: ["#ffff00"],
	amount: 1,
	cycles: 1,
	rankOffset: 0,
	stepped: false,
	envelope: "hold",
	bounceEm: 0.2,
};

describe("text animation color utilities", () => {
	it("parses long and short hex colors and rejects garbage", () => {
		expect(parseTextAnimationHexColor({ color: "#ffff00" })).toEqual({
			r: 255,
			g: 255,
			b: 0,
		});
		expect(parseTextAnimationHexColor({ color: "0f0" })).toEqual({
			r: 0,
			g: 255,
			b: 0,
		});
		expect(parseTextAnimationHexColor({ color: "yellow" })).toBeNull();
	});

	it("mixes in sRGB and survives unparseable endpoints", () => {
		expect(
			mixTextAnimationColors({ from: "#000000", to: "#ffffff", amount: 0.5 })
		).toBe("#808080");
		expect(
			mixTextAnimationColors({ from: "#123456", to: "#654321", amount: 0 })
		).toBe("#123456");
		expect(
			mixTextAnimationColors({ from: "oops", to: "#ff0000", amount: 0.2 })
		).toBe("#ff0000");
		expect(
			mixTextAnimationColors({ from: "#ff0000", to: "oops", amount: 0.9 })
		).toBe("#ff0000");
	});

	it("samples palettes smoothly, stepped, and wrapped", () => {
		const palette = ["#000000", "#ffffff"];
		expect(
			sampleTextAnimationPalette({ palette, position: 0.25, stepped: false })
		).toBe("#808080");
		expect(
			sampleTextAnimationPalette({ palette, position: 0.25, stepped: true })
		).toBe("#000000");
		expect(
			sampleTextAnimationPalette({ palette, position: 1, stepped: true })
		).toBe("#000000");
	});
});

describe("colorCycle effect", () => {
	it("holds the reference tint and lift once the front has passed (变色弹跳)", () => {
		// staggerRatio 0: every unit shares the phase clock. At 35% of the
		// cycle the hold envelope has fully attacked.
		const state = sampleColorLoop({ effect: COLOR_BOUNCE, frame: 35 });
		for (const unit of state.units) {
			expect(unit.visual.colorMix).toEqual({ color: "#ffff00", amount: 1 });
			// 0.2 em × 20 px font, lifted upward.
			expect(unit.visual.translateY).toBeCloseTo(-4);
		}
	});

	it("starts each cycle untinted and at rest", () => {
		const state = sampleColorLoop({ effect: COLOR_BOUNCE, frame: 0 });
		for (const unit of state.units) {
			expect(unit.visual.colorMix?.amount ?? 0).toBeCloseTo(0);
			expect(unit.visual.translateY).toBeCloseTo(0);
		}
	});

	it("staggers the front so ranks are tinted unevenly mid-sweep", () => {
		const state = sampleColorLoop({
			effect: COLOR_BOUNCE,
			frame: 20,
			order: "centerOut",
			staggerRatio: 0.7,
		});
		const amounts = state.units.map(
			(unit) => unit.visual.colorMix?.amount ?? 0
		);
		expect(Math.max(...amounts)).toBeGreaterThan(Math.min(...amounts));
	});

	it("beats once per cycle on the container for whole-block tints", () => {
		const beat: TextAnimationEffect = {
			...COLOR_BOUNCE,
			envelope: "beat",
			bounceEm: undefined as unknown as number,
		};
		const rest = sampleColorLoop({ effect: beat, frame: 0, unit: "all" });
		const peak = sampleColorLoop({ effect: beat, frame: 50, unit: "all" });
		expect(rest.container.colorMix?.amount ?? 0).toBeCloseTo(0);
		expect(peak.container.colorMix?.amount ?? 0).toBeCloseTo(1);
	});

	it("shifts palette stops per rank for rainbow-style cycling", () => {
		const rainbow: TextAnimationEffect = {
			kind: "colorCycle",
			palette: ["#ff0000", "#00ff00"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: true,
			envelope: "constant",
		};
		const state = sampleColorLoop({ effect: rainbow, frame: 0, content: "AB" });
		expect(state.units[0]?.visual.colorMix?.color).toBe("#ff0000");
		expect(state.units[1]?.visual.colorMix?.color).toBe("#00ff00");
	});
});

describe("colorCycle normalization", () => {
	it("fills defaults for a bare record", () => {
		expect(
			normalizeTextAnimationEffect({ value: { kind: "colorCycle" } })
		).toEqual({
			kind: "colorCycle",
			palette: ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"],
			amount: 1,
			cycles: 1,
			rankOffset: 1,
			stepped: false,
			envelope: "constant",
		});
	});

	it("clamps ranges and keeps calibrated fields", () => {
		expect(
			normalizeTextAnimationEffect({
				value: {
					kind: "colorCycle",
					palette: ["#ffff00"],
					amount: 5,
					cycles: 0,
					rankOffset: 99,
					stepped: true,
					envelope: "hold",
					bounceEm: 0.2,
				},
			})
		).toEqual({
			kind: "colorCycle",
			palette: ["#ffff00"],
			amount: 1,
			cycles: 0.1,
			rankOffset: 12,
			stepped: true,
			envelope: "hold",
			bounceEm: 0.2,
		});
	});

	it("drops non-string palette entries and invalid envelopes", () => {
		const normalized = normalizeTextAnimationEffect({
			value: {
				kind: "colorCycle",
				palette: [42, "#123456"],
				envelope: "sweep",
			},
		});
		expect(normalized).toMatchObject({
			palette: ["#123456"],
			envelope: "constant",
		});
	});
});
