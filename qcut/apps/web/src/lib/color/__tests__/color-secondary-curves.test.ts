import { describe, expect, it } from "vitest";
import {
	applySecondaryCurves,
	buildSecondaryCurve,
	createDefaultSecondaryCurve,
} from "../color-secondary-curves";
import { hslToRgb, rgbToHsl } from "../color-space-math";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";

function peakedCurve({ x, y }: { x: number; y: number }) {
	return buildSecondaryCurve({
		points: [
			{ id: "start", x: 0, y: 0.5 },
			{ id: "before", x: Math.max(0.001, x - 0.08), y: 0.5 },
			{ id: "center", x, y },
			{ id: "after", x: Math.min(0.999, x + 0.08), y: 0.5 },
			{ id: "end", x: 1, y: 0.5 },
		],
	});
}

function settings() {
	return structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS.secondaryCurves);
}

describe("secondary color curves", () => {
	it("keeps neutral curves pixel-identical", () => {
		const source = { r: 0.23, g: 0.51, b: 0.72 };
		const grade = settings();
		grade.enabled = true;
		expect(applySecondaryCurves({ color: source, settings: grade })).toEqual(
			source
		);
	});

	it("wraps a red hue selection across both ends of the hue axis", () => {
		const grade = settings();
		grade.enabled = true;
		grade.hueVsSaturation = buildSecondaryCurve({
			points: [
				{ id: "red-start", x: 0, y: 0.75 },
				{ id: "right-guard", x: 0.06, y: 0.5 },
				{ id: "left-guard", x: 0.94, y: 0.5 },
				{ id: "red-end", x: 1, y: 0.75 },
			],
		});
		for (const hue of [1 / 360, 359 / 360]) {
			const result = rgbToHsl(
				applySecondaryCurves({
					color: hslToRgb({ h: hue, s: 0.4, l: 0.5 }),
					settings: grade,
				})
			);
			expect(result.s).toBeGreaterThan(0.5);
		}
		const yellow = rgbToHsl(
			applySecondaryCurves({
				color: hslToRgb({ h: 60 / 360, s: 0.4, l: 0.5 }),
				settings: grade,
			})
		);
		expect(yellow.s).toBeCloseTo(0.4, 2);
	});

	it("applies all five secondary curve mappings", () => {
		const sourceHsl = { h: 0.5, s: 0.4, l: 0.5 };
		const source = hslToRgb(sourceHsl);
		const cases = [
			{
				name: "hueVsSaturation" as const,
				assert: (result: ReturnType<typeof rgbToHsl>) =>
					expect(result.s).toBeGreaterThan(sourceHsl.s),
			},
			{
				name: "hueVsHue" as const,
				assert: (result: ReturnType<typeof rgbToHsl>) =>
					expect(result.h).not.toBeCloseTo(sourceHsl.h, 2),
			},
			{
				name: "hueVsLuminance" as const,
				assert: (result: ReturnType<typeof rgbToHsl>) =>
					expect(result.l).toBeGreaterThan(sourceHsl.l),
			},
			{
				name: "luminanceVsSaturation" as const,
				assert: (result: ReturnType<typeof rgbToHsl>) =>
					expect(result.s).toBeGreaterThan(sourceHsl.s),
			},
			{
				name: "saturationVsSaturation" as const,
				assert: (result: ReturnType<typeof rgbToHsl>) =>
					expect(result.s).toBeGreaterThan(sourceHsl.s),
			},
		];
		for (const testCase of cases) {
			const grade = settings();
			grade.enabled = true;
			grade[testCase.name] = peakedCurve({
				x: testCase.name === "saturationVsSaturation" ? sourceHsl.s : 0.5,
				y: 0.75,
			});
			testCase.assert(
				rgbToHsl(applySecondaryCurves({ color: source, settings: grade }))
			);
		}
	});

	it("mixes the completed grade against the source", () => {
		const source = hslToRgb({ h: 0.5, s: 0.4, l: 0.5 });
		const full = settings();
		full.enabled = true;
		full.hueVsHue = peakedCurve({ x: 0.5, y: 0.75 });
		const complete = applySecondaryCurves({ color: source, settings: full });
		const half = { ...full, mix: 50 };
		const mixed = applySecondaryCurves({ color: source, settings: half });
		expect(mixed.r).toBeCloseTo((source.r + complete.r) / 2, 6);
		expect(mixed.g).toBeCloseTo((source.g + complete.g) / 2, 6);
		expect(mixed.b).toBeCloseTo((source.b + complete.b) / 2, 6);
	});

	it("creates independent default point and sample arrays", () => {
		const first = createDefaultSecondaryCurve();
		const second = createDefaultSecondaryCurve();
		first.points[0].y = 1;
		first.samples[0] = 1;
		expect(second.points[0].y).toBe(0.5);
		expect(second.samples[0]).toBe(0.5);
	});
});
