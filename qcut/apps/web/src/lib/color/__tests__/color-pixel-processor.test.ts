import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import { buildSecondaryCurve } from "../color-secondary-curves";
import { buildPresetCube } from "../color-lut";
import { transformColorPixel } from "../color-pixel-processor";

function settings() {
	return structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
}

function constantCube({
	red,
	green,
	blue,
}: {
	red: number;
	green: number;
	blue: number;
}) {
	return {
		size: 2,
		domainMin: [0, 0, 0] as [number, number, number],
		domainMax: [1, 1, 1] as [number, number, number],
		values: Array.from({ length: 8 }, () => [red, green, blue]).flat(),
	};
}

describe("color pixel processor", () => {
	it("treats vibrance differently from ordinary saturation", () => {
		const muted = { r: 0.45, g: 0.42, b: 0.4 };
		const vibrant = settings();
		vibrant.basic.vibrance = 60;
		const saturated = settings();
		saturated.basic.saturation = 60;
		expect(
			transformColorPixel({ color: muted, settings: vibrant })
		).not.toEqual(transformColorPixel({ color: muted, settings: saturated }));
	});

	it("applies LUT intensity and skin protection", () => {
		const base = settings();
		base.basic.enabled = false;
		base.lut = {
			enabled: true,
			presetId: "cinematic",
			name: "Cinematic",
			intensity: 100,
			skinProtection: 0,
			cube: buildPresetCube({ id: "cinematic", size: 9 }),
		};
		const skin = { r: 0.72, g: 0.48, b: 0.36 };
		const unprotected = transformColorPixel({ color: skin, settings: base });
		base.lut.skinProtection = 100;
		const protectedColor = transformColorPixel({ color: skin, settings: base });
		const unprotectedDistance =
			Math.abs(unprotected.r - skin.r) +
			Math.abs(unprotected.g - skin.g) +
			Math.abs(unprotected.b - skin.b);
		const protectedDistance =
			Math.abs(protectedColor.r - skin.r) +
			Math.abs(protectedColor.g - skin.g) +
			Math.abs(protectedColor.b - skin.b);
		expect(protectedDistance).toBeLessThan(unprotectedDistance);
	});

	it("blends background and skin LUTs through the explicit skin mask", () => {
		const grade = settings();
		grade.basic.enabled = false;
		grade.lut = {
			enabled: true,
			presetId: "custom",
			name: "Dual LUT",
			intensity: 100,
			skinProtection: 0,
			cube: constantCube({ red: 0, green: 0, blue: 1 }),
			dual: {
				skinCube: constantCube({ red: 1, green: 0, blue: 0 }),
				maskKind: "skin-tone-v1",
			},
		};
		const skin = transformColorPixel({
			color: { r: 0.72, g: 0.48, b: 0.36 },
			settings: grade,
		});
		const blue = transformColorPixel({
			color: { r: 0.1, g: 0.2, b: 0.9 },
			settings: grade,
		});
		expect(skin.r).toBeGreaterThan(0);
		expect(skin.b).toBeLessThan(1);
		expect(blue).toEqual({ r: 0, g: 0, b: 1 });
	});

	it("combines HSL, primary and secondary curves, wheels, smart correction, and color management", () => {
		const grade = settings();
		grade.basic.enabled = false;
		grade.hsl.enabled = true;
		grade.hsl.ranges.blue.saturation = 40;
		grade.curves.enabled = true;
		grade.curves.master = [
			{ id: "black", x: 0, y: 0.03 },
			{ id: "middle", x: 0.5, y: 0.58 },
			{ id: "white", x: 1, y: 1 },
		];
		grade.secondaryCurves.enabled = true;
		grade.secondaryCurves.hueVsSaturation = buildSecondaryCurve({
			points: [
				{ id: "start", x: 0, y: 0.5 },
				{ id: "blue", x: 240 / 360, y: 0.75 },
				{ id: "end", x: 1, y: 0.5 },
			],
		});
		grade.wheels.enabled = true;
		grade.wheels.shadows = { x: -0.08, y: 0.06, luminance: 4 };
		grade.smart = {
			enabled: true,
			intensity: 80,
			autoWhiteBalance: true,
			autoTone: true,
			status: "ready",
			correction: {
				exposure: 0.2,
				contrast: 8,
				temperature: 10,
				tint: -4,
				saturation: 6,
			},
		};
		grade.management = {
			enabled: true,
			inputSpace: "display-p3",
			workingSpace: "acescg",
			outputSpace: "rec709",
			toneMapping: "aces",
			peakNits: 100,
		};
		const input = { r: 0.18, g: 0.28, b: 0.68 };
		const output = transformColorPixel({ color: input, settings: grade });
		expect(output).not.toEqual(input);
		for (const channel of [output.r, output.g, output.b]) {
			expect(channel).toBeGreaterThanOrEqual(0);
			expect(channel).toBeLessThanOrEqual(1);
		}
	});

	it("keeps every supported input transfer finite", () => {
		const spaces = [
			"auto",
			"srgb",
			"rec709",
			"display-p3",
			"rec2020",
			"logc3",
			"slog3",
			"vlog",
			"hlg",
			"pq",
		] as const;
		for (const inputSpace of spaces) {
			const grade = settings();
			grade.basic.enabled = false;
			grade.management = {
				enabled: true,
				inputSpace,
				workingSpace: "acescg",
				outputSpace:
					inputSpace === "hlg" || inputSpace === "pq" ? inputSpace : "rec709",
				toneMapping: "aces",
				peakNits: 1_000,
			};
			const output = transformColorPixel({
				color: { r: 0.18, g: 0.42, b: 0.76 },
				settings: grade,
			});
			for (const channel of [output.r, output.g, output.b]) {
				expect(Number.isFinite(channel)).toBe(true);
				expect(channel).toBeGreaterThanOrEqual(0);
				expect(channel).toBeLessThanOrEqual(1);
			}
		}
	});

	it("uses peak luminance when tone-mapping HDR input", () => {
		const lowPeak = settings();
		lowPeak.basic.enabled = false;
		lowPeak.management = {
			enabled: true,
			inputSpace: "pq",
			workingSpace: "rec709-linear",
			outputSpace: "rec709",
			toneMapping: "aces",
			peakNits: 100,
		};
		const highPeak = structuredClone(lowPeak);
		highPeak.management.peakNits = 1_000;
		const input = { r: 0.72, g: 0.54, b: 0.3 };
		expect(
			transformColorPixel({ color: input, settings: highPeak })
		).not.toEqual(transformColorPixel({ color: input, settings: lowPeak }));
	});

	it("uses distinct tonal and lift-gamma-gain wheel math", () => {
		const grade = settings();
		grade.basic.enabled = false;
		grade.wheels.enabled = true;
		grade.wheels.shadows = { x: -0.12, y: 0.08, luminance: 12 };
		grade.wheels.midtones = { x: 0.06, y: -0.04, luminance: -8 };
		grade.wheels.highlights = { x: 0.1, y: 0.08, luminance: 10 };
		const input = { r: 0.22, g: 0.4, b: 0.72 };
		grade.wheels.mode = "tonal";
		const tonal = transformColorPixel({ color: input, settings: grade });
		grade.wheels.mode = "lift-gamma-gain";
		const liftGammaGain = transformColorPixel({
			color: input,
			settings: grade,
		});

		expect(liftGammaGain).not.toEqual(tonal);
	});

	it("scales wheels with strength and applies the offset wheel globally", () => {
		const grade = settings();
		grade.basic.enabled = false;
		grade.wheels.enabled = true;
		grade.wheels.shadows = { x: -0.12, y: 0.08, luminance: 12 };
		grade.wheels.offset = { x: 0.1, y: -0.05, luminance: 4 };
		const input = { r: 0.3, g: 0.36, b: 0.42 };
		const fullStrength = transformColorPixel({ color: input, settings: grade });
		grade.wheels.strength = 0;
		const noStrength = transformColorPixel({ color: input, settings: grade });

		expect(fullStrength).not.toEqual(input);
		expect(noStrength).toEqual(input);
	});
});
