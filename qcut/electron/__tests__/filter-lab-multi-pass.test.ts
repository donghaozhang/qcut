import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	detectJianyingMultiPassTopology,
	loadJianyingMultiPassRecipe,
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
