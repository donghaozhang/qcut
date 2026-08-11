import { describe, expect, it } from "vitest";
import { validateColorMultiPassRuntime } from "../snapshot-color-multi-pass-runtime-validation.js";

function createCube() {
	return {
		domainMax: [1, 1, 1],
		domainMin: [0, 0, 0],
		size: 2,
		values: [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
		],
	};
}

function createMultiPass() {
	return {
		enabled: true,
		fidelity: "structural",
		intensity: 100,
		name: "Structural filter",
		passes: [
			{ amount: 1, kind: "sharpen" },
			{ kind: "bilateral-blur", radius: 1.52, threshold: 7.75 },
			{ amount: 50, kind: "fog-blend", radius: 3.6 },
			{ amount: 100, kind: "vignette", softness: 65 },
			{ cube: createCube(), intensity: 100, kind: "lut" },
		],
		presetId: "jianying:test:v1",
	};
}

describe("multi-pass color snapshot validation", () => {
	it("accepts every supported structural pass", () => {
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: createMultiPass(),
			})
		).not.toThrow();
	});

	it("rejects unsupported pass kinds", () => {
		const settings = {
			...createMultiPass(),
			passes: [{ amount: 1, kind: "beautify" }],
		};
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: settings,
			})
		).toThrow(/Unsupported multi-pass operation/);
	});

	it("rejects unknown operation properties", () => {
		const settings = {
			...createMultiPass(),
			passes: [{ amount: 1, feather: 0.5, kind: "sharpen" }],
		};
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: settings,
			})
		).toThrow(/Unknown properties: feather/);
	});
});
