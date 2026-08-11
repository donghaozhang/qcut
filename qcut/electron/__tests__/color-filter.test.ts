import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdjustmentFilter } from "../ffmpeg-video-transform";
import { buildVideoColorFilterGraph } from "../ffmpeg/color-filter-graph";
import { colorValueAtFrame } from "../ffmpeg/color-keyframe-filter";
import { DEFAULT_VIDEO_COLOR_SETTINGS } from "../ffmpeg/color-settings";
import type { VideoVisual } from "../ffmpeg/types";

function visual(): VideoVisual {
	const color = structuredClone(DEFAULT_VIDEO_COLOR_SETTINGS);
	color.basic = {
		...color.basic,
		exposure: 0.4,
		vibrance: 20,
		sharpness: 12,
		vignette: 8,
		grain: 4,
	};
	color.lut = {
		enabled: true,
		presetId: "identity",
		name: "Identity",
		intensity: 75,
		skinProtection: 30,
		cube: {
			size: 2,
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
			values: [
				0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
			],
		},
	};
	color.hsl.enabled = true;
	color.hsl.ranges = { red: { hue: 10, saturation: 15, luminance: 3 } };
	color.curves.enabled = true;
	color.curves.master = [
		{ id: "black", x: 0, y: 0.02 },
		{ id: "white", x: 1, y: 1 },
	];
	color.secondaryCurves.enabled = true;
	color.secondaryCurves.hueVsSaturation.samples = Array.from(
		{ length: 257 },
		(_, index) => 0.5 + Math.max(0, 1 - Math.abs(index / 256 - 0.5) * 10) * 0.2
	);
	color.wheels.enabled = true;
	color.wheels.shadows = { x: -0.04, y: 0.05, luminance: 3 };
	color.wheels.offset = { x: 0.03, y: -0.02, luminance: 2 };
	color.wheels.strength = 80;
	return {
		x: 0,
		y: 0,
		rotation: 0,
		scaleX: 1,
		scaleY: 1,
		flipHorizontal: false,
		flipVertical: false,
		opacity: 1,
		blendMode: "normal",
		fitMode: "cover",
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
		perspective: {
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		},
		adjustments: {
			brightness: 0,
			contrast: 0,
			saturation: 0,
			temperature: 0,
			tint: 0,
			sharpness: 0,
			fade: 0,
			vignette: 0,
		},
		color,
		keyframeFps: 30,
	};
}

describe("native color filter", () => {
	it("builds the complete native grade and materializes its LUT", () => {
		const filter = buildAdjustmentFilter(visual());
		expect(filter).toContain("eq=brightness=");
		expect(filter).toContain("vibrance=intensity=");
		expect(filter).toContain("lut3d=file='");
		expect(filter).toContain("huesaturation=");
		expect(filter).toContain("curves=master=");
		expect(filter).toContain("qcut-secondary-color-luts");
		expect(filter).toContain("colorbalance=");
		const path = /lut3d=file='([^']+)'/.exec(filter)?.[1];
		expect(path).toBeTruthy();
		// The filter embeds an ffmpeg-escaped path (e.g. `C\:/...` on Windows);
		// undo escapeFfmpegFilterPath before touching the filesystem.
		const lutFsPath = (path ?? "").replace(/\\([:'])/g, "$1");
		expect(existsSync(lutFsPath)).toBe(true);
		expect(readFileSync(lutFsPath, "utf8")).toContain("LUT_3D_SIZE 2");
	});

	it("materializes dual LUTs as one skin-mask blended export cube", () => {
		const input = visual();
		const skinValues = Array.from({ length: 3 ** 3 }, () => [1, 0, 0]).flat();
		input.color!.lut.dual = {
			maskKind: "skin-tone-v1",
			skinCube: {
				size: 3,
				domainMin: [0, 0, 0],
				domainMax: [1, 1, 1],
				values: skinValues,
			},
		};
		const filter = buildAdjustmentFilter(input);
		const escapedPath = /lut3d=file='([^']+)'/.exec(filter)?.[1] ?? "";
		const lutPath = escapedPath.replace(/\\([:'])/g, "$1");
		expect(readFileSync(lutPath, "utf8")).toContain("LUT_3D_SIZE 33");
	});

	it("emits per-frame expressions for basic and smart keyframes", () => {
		const input = visual();
		input.color!.smart = {
			enabled: true,
			intensity: 100,
			autoWhiteBalance: true,
			autoTone: true,
			status: "ready",
			correction: {
				exposure: 0.3,
				contrast: 4,
				temperature: 6,
				tint: 2,
				saturation: 5,
			},
		};
		input.color!.keyframes = {
			"basic.exposure": [
				{ id: "a", frame: 0, value: 0, easing: "linear" },
				{ id: "b", frame: 30, value: 1, easing: "easeInOut" },
			],
			"smart.intensity": [
				{ id: "c", frame: 0, value: 0, easing: "linear" },
				{ id: "d", frame: 30, value: 100, easing: "linear" },
			],
		};
		const filter = buildAdjustmentFilter(input);
		expect(filter).toContain("eval=frame");
		expect(filter).toContain("if(lt(t,1)");
		expect(filter).toContain("3-2*");
	});

	it("uses a static LUT and saturation matrix for smart correction", () => {
		const input = visual();
		input.color!.smart = {
			enabled: true,
			intensity: 75,
			autoWhiteBalance: true,
			autoTone: true,
			status: "ready",
			correction: {
				exposure: -1,
				contrast: -20,
				temperature: 16,
				tint: -8,
				saturation: -12,
			},
		};
		const graph = buildVideoColorFilterGraph({
			visual: input,
			inputLabel: "input",
			labelPrefix: "smart_clip",
		});
		const filters = graph.filterSteps.join(";");
		expect(filters).toContain("lutrgb=r=");
		expect(filters).toContain("colorchannelmixer=rr=");
		expect(filters.indexOf("smart_0")).toBeLessThan(filters.indexOf("basic_1"));
	});

	it("builds animated graph stages for every advanced keyframe family", () => {
		const input = visual();
		input.color!.keyframes = {
			"basic.vibrance": [
				{ id: "v0", frame: 0, value: 0, easing: "linear" },
				{ id: "v1", frame: 30, value: 50, easing: "easeInOut" },
			],
			"basic.sharpness": [
				{ id: "s0", frame: 0, value: 0, easing: "linear" },
				{ id: "s1", frame: 30, value: 50, easing: "easeOut" },
			],
			"lut.intensity": [
				{ id: "l0", frame: 0, value: 0, easing: "linear" },
				{ id: "l1", frame: 30, value: 100, easing: "linear" },
			],
			"lut.skinProtection": [
				{ id: "p0", frame: 0, value: 0, easing: "linear" },
				{ id: "p1", frame: 30, value: 100, easing: "linear" },
			],
			"hsl.red.hue": [
				{ id: "h0", frame: 0, value: 0, easing: "linear" },
				{ id: "h1", frame: 30, value: 20, easing: "easeIn" },
			],
			"curves.mix": [
				{ id: "c0", frame: 0, value: 0, easing: "linear" },
				{ id: "c1", frame: 30, value: 100, easing: "linear" },
			],
			"secondaryCurves.mix": [
				{ id: "sc0", frame: 0, value: 0, easing: "linear" },
				{ id: "sc1", frame: 30, value: 100, easing: "linear" },
			],
			"wheels.shadows.x": [
				{ id: "w0", frame: 0, value: 0, easing: "linear" },
				{ id: "w1", frame: 30, value: -0.2, easing: "linear" },
			],
			"wheels.offset.x": [
				{ id: "o0", frame: 0, value: 0, easing: "linear" },
				{ id: "o1", frame: 30, value: 0.12, easing: "linear" },
			],
			"wheels.strength": [
				{ id: "ws0", frame: 0, value: 0, easing: "linear" },
				{ id: "ws1", frame: 30, value: 100, easing: "linear" },
			],
		};
		const graph = buildVideoColorFilterGraph({
			visual: input,
			inputLabel: "input",
			labelPrefix: "clip_0",
		});
		const filters = graph.filterSteps.join(";");

		expect(filters).toContain("vibrance@clip_0_vibrance");
		expect(filters).toContain("unsharp=5:5:2");
		expect(filters).toContain("lut_protection_mix");
		expect(filters).toContain("huesaturation@clip_0_hsl_red");
		expect(filters).toContain("curves_mix");
		expect(filters).toContain("secondary_curves_mix");
		expect(filters).toContain("colorbalance@clip_0_wheel_shadows");
	});

	it("resolves easing numerically at arbitrary frames", () => {
		const input = visual();
		input.color!.keyframes = {
			"basic.exposure": [
				{ id: "a", frame: 0, value: 0, easing: "linear" },
				{ id: "b", frame: 20, value: 1, easing: "easeIn" },
			],
		};

		expect(
			colorValueAtFrame({
				visual: input,
				property: "basic.exposure",
				fallback: 0,
				frame: 10,
			})
		).toBeCloseTo(0.25);
	});

	it("builds animated branches for RGB and secondary curve shapes", () => {
		const input = visual();
		input.color!.curveShapeKeyframes = {
			"curves.master": [
				{
					id: "rgb-start",
					frame: 0,
					points: [
						{ id: "black", x: 0, y: 0 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "linear",
				},
				{
					id: "rgb-end",
					frame: 30,
					points: [
						{ id: "black", x: 0, y: 0.1 },
						{ id: "white", x: 1, y: 1 },
					],
					easing: "easeInOut",
				},
			],
			"secondaryCurves.hueVsSaturation": [
				{
					id: "secondary-start",
					frame: 0,
					points: [
						{ id: "start", x: 0, y: 0.5 },
						{ id: "end", x: 1, y: 0.5 },
					],
					samples: new Array<number>(257).fill(0.5),
					easing: "linear",
				},
				{
					id: "secondary-end",
					frame: 30,
					points: [
						{ id: "start", x: 0, y: 0.7 },
						{ id: "end", x: 1, y: 0.7 },
					],
					samples: new Array<number>(257).fill(0.7),
					easing: "linear",
				},
			],
		};
		const graph = buildVideoColorFilterGraph({
			visual: input,
			inputLabel: "input",
			labelPrefix: "clip_0",
		});
		const filters = graph.filterSteps.join(";");
		expect(filters).toContain("clip_0_curves_shape_interval_0");
		expect(filters).toContain("clip_0_secondary_curves_shape_interval_0");
		expect(filters).toContain("curves=master=");
		expect(filters).toContain("qcut-secondary-color-luts");
	});
});
