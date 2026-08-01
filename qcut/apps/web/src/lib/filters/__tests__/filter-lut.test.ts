import { describe, expect, it } from "vitest";
import { getFilterPreset } from "../filter-registry";
import {
	buildFilterCube,
	clearFilterCubeCache,
	getFilterCube,
	transformFilterColor,
} from "../filter-lut";
import type { FilterColorMatrix } from "../filter-types";

const IDENTITY_COLOR_MATRIX: FilterColorMatrix = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
];

const ZERO_COLOR_MATRIX: FilterColorMatrix = [
	[0, 0, 0],
	[0, 0, 0],
	[0, 0, 0],
];

describe("filter LUT", () => {
	it("builds a valid red-fastest 3D cube", () => {
		const preset = getFilterPreset({ presetId: "teal-gold" });
		expect(preset).toBeDefined();
		const cube = buildFilterCube({ preset: preset!, size: 5 });
		expect(cube.size).toBe(5);
		expect(cube.values).toHaveLength(5 ** 3 * 3);
		expect(cube.values.every((value) => value >= 0 && value <= 1)).toBe(true);
	});

	it("caches one cube per versioned asset", () => {
		clearFilterCubeCache();
		const preset = getFilterPreset({ presetId: "clean" });
		expect(preset).toBeDefined();
		const first = getFilterCube({ preset: preset! });
		const second = getFilterCube({ preset: preset! });
		expect(second).toBe(first);
	});

	it("produces neutral luminance for monochrome recipes", () => {
		const result = transformFilterColor({
			color: { r: 0.9, g: 0.2, b: 0.1 },
			recipe: { monochrome: 1 },
		});
		expect(result.r).toBeCloseTo(result.g, 6);
		expect(result.g).toBeCloseTo(result.b, 6);
	});

	it("preserves colors with an identity quadratic correction", () => {
		const color = { r: 0.25, g: 0.5, b: 0.75 };
		const result = transformFilterColor({
			color,
			recipe: {
				quadraticCorrection: {
					linear: IDENTITY_COLOR_MATRIX,
					squared: ZERO_COLOR_MATRIX,
					cross: ZERO_COLOR_MATRIX,
					offset: [0, 0, 0],
				},
			},
		});

		expect(result.r).toBeCloseTo(color.r, 12);
		expect(result.g).toBeCloseTo(color.g, 12);
		expect(result.b).toBeCloseTo(color.b, 12);
	});

	it("applies quadratic cross terms in rg, rb, gb order", () => {
		const result = transformFilterColor({
			color: { r: 0.2, g: 0.4, b: 0.8 },
			recipe: {
				quadraticCorrection: {
					linear: ZERO_COLOR_MATRIX,
					squared: ZERO_COLOR_MATRIX,
					cross: [
						[1, 0, 0],
						[0, 1, 0],
						[0, 0, 1],
					],
					offset: [0, 0, 0],
				},
			},
		});

		expect(result.r).toBeCloseTo(0.08, 6);
		expect(result.g).toBeCloseTo(0.16, 6);
		expect(result.b).toBeCloseTo(0.32, 6);
	});

	it("clamps quadratic correction output to the LUT domain", () => {
		const result = transformFilterColor({
			color: { r: 0.2, g: 0.4, b: 0.8 },
			recipe: {
				quadraticCorrection: {
					linear: [
						[2, 0, 0],
						[0, -2, 0],
						[0, 0, 2],
					],
					squared: ZERO_COLOR_MATRIX,
					cross: ZERO_COLOR_MATRIX,
					offset: [1, -1, 0],
				},
			},
		});

		expect(result).toEqual({ r: 1, g: 0, b: 1 });
	});
});
