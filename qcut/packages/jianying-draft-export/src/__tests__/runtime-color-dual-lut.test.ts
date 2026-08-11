import { describe, expect, it } from "vitest";
import { validateColorLutRuntime } from "../snapshot-color-lut-runtime-validation.js";

function createCube({ offset = 0 }: { offset?: number } = {}) {
	const values: number[] = [];
	for (const blue of [0, 1]) {
		for (const green of [0, 1]) {
			for (const red of [0, 1]) {
				values.push(red + offset, green + offset, blue + offset);
			}
		}
	}
	return {
		domainMax: [1, 1, 1],
		domainMin: [0, 0, 0],
		size: 2,
		values,
	};
}

function createDualLut() {
	return {
		cube: createCube(),
		dual: {
			maskKind: "skin-tone-v1",
			skinCube: createCube({ offset: 0.01 }),
		},
		enabled: true,
		intensity: 100,
		name: "Dual LUT",
		presetId: "dual-lut",
		skinProtection: 0,
	};
}

describe("dual LUT snapshot validation", () => {
	it("accepts the deterministic skin-tone dual LUT schema", () => {
		expect(() =>
			validateColorLutRuntime({ path: "$.color.lut", value: createDualLut() })
		).not.toThrow();
	});

	it("rejects unsupported mask implementations", () => {
		const lut = createDualLut();
		lut.dual.maskKind = "person-segmentation";
		expect(() =>
			validateColorLutRuntime({ path: "$.color.lut", value: lut })
		).toThrow(/skin-tone-v1/);
	});

	it("rejects unknown dual LUT properties", () => {
		const lut = {
			...createDualLut(),
			dual: { ...createDualLut().dual, feather: 0.5 },
		};
		expect(() =>
			validateColorLutRuntime({ path: "$.color.lut", value: lut })
		).toThrow(/Unknown properties: feather/);
	});
});
