import { describe, expect, it } from "vitest";
import { buildPresetCube, parseCubeLut, serializeCubeLut } from "../color-lut";
import { sampleCubeLut } from "../color-space-math";

describe("3D LUT support", () => {
	it("parses and serializes a standards-shaped .cube payload", () => {
		const source = [
			'TITLE "Identity 2"',
			"LUT_3D_SIZE 2",
			"DOMAIN_MIN 0 0 0",
			"DOMAIN_MAX 1 1 1",
			"0 0 0",
			"1 0 0",
			"0 1 0",
			"1 1 0",
			"0 0 1",
			"1 0 1",
			"0 1 1",
			"1 1 1",
		].join("\n");
		const parsed = parseCubeLut({
			text: source,
			fallbackName: "identity.cube",
		});
		expect(parsed.name).toBe("Identity 2");
		expect(parsed.cube.values).toHaveLength(24);
		expect(
			sampleCubeLut({ cube: parsed.cube, color: { r: 0.25, g: 0.5, b: 0.75 } })
		).toEqual({ r: 0.25, g: 0.5, b: 0.75 });
		expect(serializeCubeLut(parsed)).toContain("LUT_3D_SIZE 2");
	});

	it("rejects incomplete and 1D LUT files", () => {
		expect(() =>
			parseCubeLut({ text: "LUT_1D_SIZE 16", fallbackName: "one.cube" })
		).toThrow(/1D LUT/);
		expect(() =>
			parseCubeLut({
				text: "LUT_3D_SIZE 2\n0 0 0",
				fallbackName: "broken.cube",
			})
		).toThrow(/Expected 8 LUT rows/);
	});

	it("builds usable preset cubes", () => {
		const cube = buildPresetCube({ id: "cinematic", size: 5 });
		expect(cube.values).toHaveLength(5 ** 3 * 3);
		const transformed = sampleCubeLut({
			cube,
			color: { r: 0.2, g: 0.3, b: 0.4 },
		});
		expect(transformed).not.toEqual({ r: 0.2, g: 0.3, b: 0.4 });
	});
});
