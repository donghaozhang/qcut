import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	detectJianyingMultiPassTopology,
	FILTER_LAB_PASS_TRAIT_DEFAULTS,
	loadJianyingMultiPassRecipe,
	resolveFilterLabPassTraits,
	type FilterLabMultiPassOperation,
	type JianyingFilterMultiPassRenderer,
} from "../native-pipeline/filters/filter-lab-multi-pass";

const COMMON = [
	"AmazingFeature/xshader/filter.xshader",
	"AmazingFeature/material/filter.material",
];

describe("Jianying multi-pass package detection", () => {
	it("recognizes sharpen plus tiled LUT packages", () => {
		expect(
			detectJianyingMultiPassTopology({
				paths: [
					...COMMON,
					"AmazingFeature/xshader/pass0.xshader",
					"AmazingFeature/material/pass0.material",
					"AmazingFeature/image/filter.png",
				],
				signals: "u_sharpness share://input.texture midRenderTex0.rt",
			})
		).toEqual({
			kind: "sharpen-lut",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 2,
		});
	});

	it("recognizes the four-stage fog package", () => {
		expect(
			detectJianyingMultiPassTopology({
				paths: [
					...COMMON,
					"AmazingFeature/xshader/pass0.xshader",
					"AmazingFeature/xshader/pass1.xshader",
					"AmazingFeature/xshader/pass2.xshader",
					"AmazingFeature/image/filter.png",
				],
				signals:
					'blurSize blurImageTexture setFloat("intensity", 1.0-(intensity*0.50))',
			})
		).toEqual({
			kind: "fog-lut",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 4,
		});
	});

	it("recognizes LUT, bilateral blur and corner-overlay packages", () => {
		expect(
			detectJianyingMultiPassTopology({
				paths: [
					"AmazingFeature/xshader/filter.frag",
					"AmazingFeature/xshader/blur.frag",
					"AmazingFeature/xshader/corner.frag",
					"AmazingFeature/image/lut0.png",
					"AmazingFeature/image/src1.png",
				],
				signals: "u_opacity BLUR_SIZE = 0.31 BLUR = 0.19 CORNER = 1",
			})
		).toEqual({
			kind: "vignette-lut",
			lutRelativePath: "AmazingFeature/image/lut0.png",
			passCount: 3,
		});
	});

	it("does not classify a tiled LUT as multi-pass from its title", () => {
		expect(
			detectJianyingMultiPassTopology({
				paths: ["AmazingFeature/image/filter.png"],
				signals: "清透美食 迷雾 暗角旧影",
			})
		).toBeNull();
	});
});

describe("Jianying multi-pass recipe loading", () => {
	it("keeps fog spatial work before the LUT", async () => {
		const renderer: JianyingFilterMultiPassRenderer = {
			kind: "fog-lut",
			container: "artistEffect",
			packageIdentifier: "resource",
			version: "version",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 4,
			fidelity: "structural",
		};
		const cube = {
			size: 2,
			values: new Float64Array(24),
			domainMin: [0, 0, 0] as [number, number, number],
			domainMax: [1, 1, 1] as [number, number, number],
		};
		const loadCube = vi.fn(async () => cube);
		const recipe = await loadJianyingMultiPassRecipe({
			cacheRoot: "/cache",
			renderer,
			loadCube,
		});

		expect(loadCube).toHaveBeenCalledWith({
			// join keeps the expectation correct under Windows separators.
			filePath: join(
				"/cache",
				"artistEffect",
				"resource",
				"version",
				"AmazingFeature",
				"image",
				"filter.png"
			),
		});
		expect(recipe?.passes.map(({ kind }) => kind)).toEqual([
			"fog-blend",
			"lut",
		]);
	});
});

describe("pass traits (FLP-002)", () => {
	it("keeps existing recipes byte-identical: no trait keys appear", async () => {
		const renderer: JianyingFilterMultiPassRenderer = {
			kind: "fog-lut",
			container: "artistEffect",
			packageIdentifier: "resource",
			version: "version",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 4,
			fidelity: "structural",
		};
		const cube = {
			size: 2,
			values: new Float64Array(24),
			domainMin: [0, 0, 0] as [number, number, number],
			domainMax: [1, 1, 1] as [number, number, number],
		};
		const recipe = await loadJianyingMultiPassRecipe({
			cacheRoot: "/cache",
			renderer,
			loadCube: async () => cube,
		});
		// Absent, not defaulted-in: serialized recipes must not change shape.
		expect(recipe?.passes).toEqual([
			{ kind: "fog-blend", radius: 3.6, amount: 50 },
			{ kind: "lut", cube, intensity: 100 },
		]);
		for (const pass of recipe?.passes ?? []) {
			expect(Object.keys(pass)).not.toContain("scale");
			expect(Object.keys(pass)).not.toContain("pixelFormat");
			expect(Object.keys(pass)).not.toContain("intensityCurve");
		}
	});

	it("resolves absent traits to the verified full-res RGBA8 defaults", () => {
		const resolved = resolveFilterLabPassTraits({
			kind: "sharpen",
			amount: 1,
		} as FilterLabMultiPassOperation);
		expect(resolved).toEqual(FILTER_LAB_PASS_TRAIT_DEFAULTS);
		expect(resolved).toEqual({
			scale: 1,
			pixelFormat: "rgba8",
			mipLevels: 1,
			edgeMode: "clamp",
			intensityCurve: { kind: "linear" },
			timeVarying: false,
		});
	});

	it("serializes observed traits through the renderer loader untouched", async () => {
		const { loadJianyingFilterLabRenderer } = await import(
			"../jianying-filter-multi-pass-loader"
		);
		const renderer: JianyingFilterMultiPassRenderer = {
			kind: "fog-lut",
			container: "artistEffect",
			packageIdentifier: "resource",
			version: "v1",
			lutRelativePath: "AmazingFeature/image/filter.png",
			passCount: 4,
			fidelity: "structural",
		};
		const result = await loadJianyingFilterLabRenderer({
			cacheRoot: "/cache",
			filterTitle: "迷雾",
			renderer,
			resourceId: "res-1",
			loadRecipe: async () => ({
				kind: "fog-lut",
				passes: [
					{
						kind: "fog-blend",
						radius: 3.6,
						amount: 50,
						scale: 0.5,
						pixelFormat: "float16",
						timeVarying: true,
					},
					{
						kind: "lut",
						cube: {
							size: 2,
							values: new Float64Array(24),
							domainMin: [0, 0, 0],
							domainMax: [1, 1, 1],
						},
						intensity: 100,
						edgeMode: "mirror",
					},
				],
			}),
		});
		expect(result.passes[0]).toMatchObject({
			kind: "fog-blend",
			scale: 0.5,
			pixelFormat: "float16",
			timeVarying: true,
		});
		expect(result.passes[1]).toMatchObject({
			kind: "lut",
			edgeMode: "mirror",
		});
		expect(
			Array.isArray((result.passes[1] as { values?: unknown }).values)
		).toBe(false);
	});

	it("lets observed traits override defaults field by field", () => {
		const resolved = resolveFilterLabPassTraits({
			kind: "fog-blend",
			radius: 3.6,
			amount: 50,
			scale: 0.5,
			pixelFormat: "float16",
			intensityCurve: {
				kind: "piecewise",
				points: [
					[0, 0],
					[100, 0.5],
				],
			},
		} as FilterLabMultiPassOperation);
		expect(resolved.scale).toBe(0.5);
		expect(resolved.pixelFormat).toBe("float16");
		expect(resolved.intensityCurve).toEqual({
			kind: "piecewise",
			points: [
				[0, 0],
				[100, 0.5],
			],
		});
		// Unobserved fields stay at defaults.
		expect(resolved.mipLevels).toBe(1);
		expect(resolved.edgeMode).toBe("clamp");
		expect(resolved.timeVarying).toBe(false);
	});
});
