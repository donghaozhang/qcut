// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
	inspectJianyingNativePortraitRenderer,
	resolveJianyingNativePortraitPackagePath,
} from "../native-pipeline/filters/filter-lab-native-portrait.js";

async function withTempDirectory<T>({
	run,
}: {
	run: (directory: string) => Promise<T>;
}) {
	const directory = await mkdtemp(join(tmpdir(), "qcut-native-portrait-test-"));
	try {
		return await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

function tiledLutPngHeader() {
	const header = Buffer.alloc(24);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
	header.writeUInt32BE(512, 16);
	header.writeUInt32BE(512, 20);
	return header;
}

async function fixture({
	skinSeg = true,
	tiledPng = false,
	family = "filter",
	decoyAlgorithm = false,
	face = true,
}: {
	skinSeg?: boolean;
	tiledPng?: boolean;
	family?: "filter" | "skin-filter";
	decoyAlgorithm?: boolean;
	face?: boolean;
} = {}) {
	return withTempDirectory({
		run: async (directory) => {
			const skinFilter = family === "skin-filter";
			const feature = join(
				directory,
				skinFilter ? "SkinFilter" : "AmazingFeature"
			);
			const texture = join(feature, skinFilter ? "image" : "texture");
			const material = join(feature, "material");
			const shader = join(feature, "xshader");
			const lua = join(feature, "lua");
			await Promise.all([
				mkdir(texture, { recursive: true }),
				mkdir(material, { recursive: true }),
				mkdir(shader, { recursive: true }),
				mkdir(lua, { recursive: true }),
			]);
			const algorithmConfig = join(directory, "algorithmConfig.json");
			const decoyAlgorithmConfig = join(feature, "algorithmConfig.json");
			const background = join(
				texture,
				tiledPng ? "filter_bg.png" : "filter_bg.3dl.vf"
			);
			const skin = join(
				texture,
				tiledPng ? "filter_skin.png" : "filter_skin.3dl.vf"
			);
			const materialPath = join(
				material,
				skinFilter ? "SkinSeg.material" : "Filter.material"
			);
			const shaderPath = join(
				shader,
				skinFilter ? "skinseg.xshader" : "Filter.xshader"
			);
			const seekModeScript = join(lua, "SeekModeScript.lua");
			const paths = [
				...(decoyAlgorithm ? [decoyAlgorithmConfig] : []),
				algorithmConfig,
				background,
				skin,
				materialPath,
				shaderPath,
				seekModeScript,
			];
			await Promise.all([
				writeFile(
					algorithmConfig,
					JSON.stringify({
						nodes: [
							...(skinSeg ? [{ type: "skin_seg" }] : []),
							...(face ? [{ type: "face" }] : []),
						],
					})
				),
				...(decoyAlgorithm
					? [
							writeFile(
								decoyAlgorithmConfig,
								JSON.stringify({ nodes: [{ type: "blit" }] })
							),
						]
					: []),
				writeFile(background, tiledPng ? tiledLutPngHeader() : "fixture"),
				writeFile(skin, tiledPng ? tiledLutPngHeader() : "fixture"),
				writeFile(materialPath, "fixture"),
				writeFile(shaderPath, "fixture"),
				writeFile(seekModeScript, "fixture"),
			]);
			return inspectJianyingNativePortraitRenderer({
				container: "artistEffect",
				packageIdentifier: "portrait",
				paths: paths.map((filePath) => relative(directory, filePath)),
				root: directory,
				version: "v1",
			});
		},
	});
}

describe("Jianying native portrait renderer", () => {
	it("recognizes a dual asset package with a skin segmentation graph", async () => {
		await expect(fixture()).resolves.toEqual({
			kind: "native-portrait-effect",
			container: "artistEffect",
			packageIdentifier: "portrait",
			version: "v1",
			faceDetection: true,
		});
	});

	it("rejects packages without skin segmentation", async () => {
		await expect(fixture({ skinSeg: false })).resolves.toBeNull();
	});

	it("keeps face analysis disabled when the graph has no face node", async () => {
		await expect(fixture({ face: false })).resolves.not.toHaveProperty(
			"faceDetection"
		);
	});

	it("checks every algorithm graph when a basic blit config sorts first", async () => {
		await expect(fixture({ decoyAlgorithm: true })).resolves.toMatchObject({
			kind: "native-portrait-effect",
		});
	});

	it("recognizes the SkinFilter material and shader family", async () => {
		await expect(
			fixture({ family: "skin-filter", tiledPng: true })
		).resolves.toMatchObject({
			kind: "native-portrait-effect",
			backgroundLutRelativePath: "SkinFilter/image/filter_bg.png",
			skinLutRelativePath: "SkinFilter/image/filter_skin.png",
		});
	});

	it("exposes valid tiled PNG assets for the editor fallback", async () => {
		await expect(fixture({ tiledPng: true })).resolves.toMatchObject({
			backgroundLutRelativePath: "AmazingFeature/texture/filter_bg.png",
			skinLutRelativePath: "AmazingFeature/texture/filter_skin.png",
		});
	});

	it("resolves only validated cache identities", () => {
		expect(
			resolveJianyingNativePortraitPackagePath({
				cacheRoot: "/cache",
				renderer: {
					kind: "native-portrait-effect",
					container: "artistEffect",
					packageIdentifier: "portrait",
					version: "v1",
				},
			})
		).toBe(join("/cache", "artistEffect", "portrait", "v1"));
	});
});
