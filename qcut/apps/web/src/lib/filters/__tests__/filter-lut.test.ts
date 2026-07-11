import { describe, expect, it } from "vitest";
import { getFilterPreset } from "../filter-registry";
import {
	buildFilterCube,
	clearFilterCubeCache,
	getFilterCube,
	transformFilterColor,
} from "../filter-lut";

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
});
