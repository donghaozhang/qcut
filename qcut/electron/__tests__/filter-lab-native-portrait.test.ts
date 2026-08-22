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
}: {
	skinSeg?: boolean;
	tiledPng?: boolean;
} = {}) {
	return withTempDirectory({
		run: async (directory) => {
			const feature = join(directory, "AmazingFeature");
			const texture = join(feature, "texture");
			const material = join(feature, "material");
			const shader = join(feature, "xshader");
			const lua = join(feature, "lua");
			await Promise.all([
				mkdir(texture, { recursive: true }),
				mkdir(material, { recursive: true }),
				mkdir(shader, { recursive: true }),
				mkdir(lua, { recursive: true }),
			]);
			const paths = [
				join(directory, "algorithmConfig.json"),
				join(texture, tiledPng ? "filter_bg.png" : "filter_bg.3dl.vf"),
				join(texture, tiledPng ? "filter_skin.png" : "filter_skin.3dl.vf"),
				join(material, "Filter.material"),
				join(shader, "Filter.xshader"),
				join(lua, "SeekModeScript.lua"),
			];
			await Promise.all([
				writeFile(
					paths[0],
					JSON.stringify({ nodes: [{ type: skinSeg ? "skin_seg" : "face" }] })
				),
				...paths
					.slice(1)
					.map((filePath, index) =>
						writeFile(
							filePath,
							tiledPng && index < 2 ? tiledLutPngHeader() : "fixture"
						)
					),
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
		});
	});

	it("rejects packages without skin segmentation", async () => {
		await expect(fixture({ skinSeg: false })).resolves.toBeNull();
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
