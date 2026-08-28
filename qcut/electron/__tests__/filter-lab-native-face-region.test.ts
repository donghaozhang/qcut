// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
	inspectJianyingNativeFaceRegionRenderer,
	resolveJianyingNativeFaceRegionPackagePath,
} from "../native-pipeline/filters/filter-lab-native-face-region.js";

async function withTempDirectory<T>({
	run,
}: {
	run: (directory: string) => Promise<T>;
}) {
	const directory = await mkdtemp(join(tmpdir(), "qcut-face-region-test-"));
	try {
		return await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function fixture({
	faceNode = true,
	skinSeg = false,
	includeMask = true,
	shaderSource = "lipsMaskTexture filterBg filterLips uniAlpha",
	compiledShaderSource,
	scriptSource = 'get("intensity") set("uniAlpha")',
}: {
	faceNode?: boolean;
	skinSeg?: boolean;
	includeMask?: boolean;
	shaderSource?: string;
	compiledShaderSource?: string;
	scriptSource?: string;
} = {}) {
	return withTempDirectory({
		run: async (directory) => {
			const featureRoot = "AmazingFeature/FaceMakeupV2System";
			const files = new Map<string, string>([
				[
					"algorithmConfig.json",
					JSON.stringify({
						nodes: [
							...(faceNode ? [{ type: "face" }] : []),
							...(skinSeg ? [{ type: "skin_seg" }] : []),
						],
					}),
				],
				[`${featureRoot}/texture/filter_bg.3dl.vf`, "background"],
				[`${featureRoot}/texture/filter_lips.3dl.vf`, "lips"],
				[`${featureRoot}/mesh/mask_faceuv22994_mesh.mesh`, "mesh"],
				[`${featureRoot}/main.scene`, "scene"],
				[`${featureRoot}/material/background.material`, "material"],
				[`${featureRoot}/material/lips.material`, "material"],
				[`${featureRoot}/shader/lips.xshader`, shaderSource],
				[`${featureRoot}/lua/SeekModeScript.lua`, scriptSource],
			]);
			if (includeMask) {
				files.set(`${featureRoot}/texture/lipsMask.png`, "mask");
			}
			if (compiledShaderSource) {
				files.set(
					`${featureRoot}/shaders/Filter/gles2/filter.frag`,
					compiledShaderSource
				);
			}
			await Promise.all(
				[...files].map(async ([relativePath, content]) => {
					const filePath = join(directory, relativePath);
					await mkdir(dirname(filePath), { recursive: true });
					await writeFile(filePath, content);
				})
			);
			return inspectJianyingNativeFaceRegionRenderer({
				container: "artistEffect",
				packageIdentifier: "face-region",
				paths: [...files.keys()].map((filePath) =>
					relative(directory, join(directory, filePath)).split(sep).join("/")
				),
				root: directory,
				version: "v1",
			});
		},
	});
}

describe("Jianying native face-region renderer", () => {
	it("recognizes the strict lips/background topology", async () => {
		await expect(fixture()).resolves.toEqual({
			kind: "native-face-region-effect",
			container: "artistEffect",
			packageIdentifier: "face-region",
			version: "v1",
			region: "lips",
			backgroundLutRelativePath:
				"AmazingFeature/FaceMakeupV2System/texture/filter_bg.3dl.vf",
			regionLutRelativePath:
				"AmazingFeature/FaceMakeupV2System/texture/filter_lips.3dl.vf",
			maskRelativePath:
				"AmazingFeature/FaceMakeupV2System/texture/lipsMask.png",
			requiresFlippedInputRoundTrip: true,
		});
	});

	it("requires face analysis without a skin segmentation graph", async () => {
		await expect(fixture({ faceNode: false })).resolves.toBeNull();
		await expect(fixture({ skinSeg: true })).resolves.toBeNull();
	});

	it("requires the region mask, shader bindings, and intensity script", async () => {
		await expect(fixture({ includeMask: false })).resolves.toBeNull();
		await expect(
			fixture({ shaderSource: "filterBg filterLips uniAlpha" })
		).resolves.toBeNull();
		await expect(fixture({ scriptSource: "intensity" })).resolves.toBeNull();
	});

	it("reads generated fragment shaders when xshader metadata is binary", async () => {
		await expect(
			fixture({
				shaderSource: "serialized-binary",
				compiledShaderSource: "lipsMaskTexture filterBg filterLips uniAlpha",
			})
		).resolves.toMatchObject({ kind: "native-face-region-effect" });
	});

	it("resolves only validated package identities", () => {
		const renderer = {
			kind: "native-face-region-effect" as const,
			container: "artistEffect" as const,
			packageIdentifier: "face-region",
			version: "v1",
			region: "lips" as const,
			backgroundLutRelativePath: "texture/filter_bg.3dl.vf",
			regionLutRelativePath: "texture/filter_lips.3dl.vf",
			maskRelativePath: "texture/lipsMask.png",
			requiresFlippedInputRoundTrip: true as const,
		};
		expect(
			resolveJianyingNativeFaceRegionPackagePath({
				cacheRoot: "/cache",
				renderer,
			})
		).toBe(join("/cache", "artistEffect", "face-region", "v1"));
		expect(() =>
			resolveJianyingNativeFaceRegionPackagePath({
				cacheRoot: "/cache",
				renderer: { ...renderer, version: "../escape" },
			})
		).toThrow("Invalid local face-region renderer identity");
	});
});
