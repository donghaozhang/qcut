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
			{
				amount: 18,
				kind: "grain-noise",
				seed: 42,
				size: 2,
				timeVarying: true,
			},
			{
				amount: 35,
				centerX: 0.15,
				centerY: 0.4,
				color: [1, 0.35, 0.08],
				kind: "light-leak",
				radius: 0.25,
				speed: 0.2,
				timeVarying: true,
			},
			{
				amount: 60,
				kind: "bloom",
				mipLevels: 3,
				pixelFormat: "float16",
				radius: 3,
				scale: 0.5,
				threshold: 0.72,
			},
			{ angle: 0, kind: "chromatic-aberration", offset: 2 },
			{
				centerX: 0.5,
				centerY: 0.5,
				distortion: -0.12,
				kind: "lens-distortion",
			},
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

	it("accepts a pinned local-native renderer identity", () => {
		const settings = {
			...createMultiPass(),
			fidelity: "native-local",
			nativeEffect: {
				provider: "jianying-local-effect-v1",
				resourceId: "7403664041945681191",
				version: "59f14f9555fc38667c3ddb0814346cc8",
			},
		};
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: settings,
			})
		).not.toThrow();
	});

	it("requires provider metadata for local-native fidelity", () => {
		const settings = { ...createMultiPass(), fidelity: "native-local" };
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: settings,
			})
		).toThrow(/nativeEffect/);
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

	it("rejects malformed long-tail traits and textures", () => {
		const invalidScale = {
			...createMultiPass(),
			passes: [
				{ amount: 50, kind: "bloom", radius: 2, scale: 0.75, threshold: 0.7 },
			],
		};
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: invalidScale,
			})
		).toThrow(/pass scale/);

		const invalidColor = {
			...createMultiPass(),
			passes: [
				{
					amount: 40,
					centerX: 0.2,
					centerY: 0.5,
					color: [1, 0.4],
					kind: "light-leak",
					radius: 0.2,
					speed: 0,
				},
			],
		};
		expect(() =>
			validateColorMultiPassRuntime({
				path: "$.color.multiPass",
				value: invalidColor,
			})
		).toThrow(/RGB color triple/);
	});
});
