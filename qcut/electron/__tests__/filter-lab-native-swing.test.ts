// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
	inspectJianyingNativeSwingRenderer,
	resolveJianyingNativeSwingPackagePath,
} from "../native-pipeline/filters/filter-lab-native-swing.js";

async function withTempDirectory<T>({
	run,
}: {
	run: (directory: string) => Promise<T>;
}) {
	const directory = await mkdtemp(join(tmpdir(), "qcut-native-swing-test-"));
	try {
		return await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

async function fixture({
	algorithmConfig,
	dualLut = "complete",
	includeAlgorithmConfig = true,
	omit,
}: {
	algorithmConfig?: string;
	dualLut?: "complete" | "partial" | "none";
	includeAlgorithmConfig?: boolean;
	omit?: string | string[];
} = {}) {
	return withTempDirectory({
		run: async (directory) => {
			const files = new Map<string, string>([
				["AmazingFeature/main.scene", "scene"],
				["AmazingFeature/lua/main.lua", "script"],
				["AmazingFeature/material/pass0.material", "material"],
				["AmazingFeature/material/pass1.material", "material"],
				["AmazingFeature/shader/filter.xshader", "shader"],
				["AmazingFeature/shader/gles2/filter.frag", "fragment"],
				["AmazingFeature/shader/gles2/filter.vert", "vertex"],
			]);
			if (includeAlgorithmConfig) {
				files.set(
					"algorithmConfig.json",
					algorithmConfig ??
						JSON.stringify({
							nodes: [{ type: "skin_seg" }, { type: "face" }, { type: "blit" }],
						})
				);
			}
			if (dualLut !== "none") {
				files.set("AmazingFeature/image/filter_bg.png", "background");
			}
			if (dualLut === "complete") {
				files.set("AmazingFeature/image/filter_skin.png", "skin");
			}
			const omittedPaths = Array.isArray(omit) ? omit : omit ? [omit] : [];
			for (const omittedPath of omittedPaths) files.delete(omittedPath);
			await Promise.all(
				[...files].map(async ([relativePath, content]) => {
					const filePath = join(directory, relativePath);
					await mkdir(dirname(filePath), { recursive: true });
					await writeFile(filePath, content);
				})
			);
			return inspectJianyingNativeSwingRenderer({
				container: "artistEffect",
				packageIdentifier: "complex-dual",
				paths: [...files.keys()].map((filePath) =>
					relative(directory, join(directory, filePath)).split(sep).join("/")
				),
				root: directory,
				version: "v1",
			});
		},
	});
}

describe("Jianying native Swing dual-LUT renderer", () => {
	it("recognizes the complete supported topology", async () => {
		await expect(fixture()).resolves.toEqual({
			kind: "native-swing-dual-lut",
			container: "artistEffect",
			packageIdentifier: "complex-dual",
			version: "v1",
			passCount: 2,
			algorithmTypes: ["blit", "face", "skin_seg"],
		});
	});

	it("recognizes shader graphs with or without an algorithm config", async () => {
		await expect(
			fixture({
				dualLut: "none",
				algorithmConfig: JSON.stringify({
					nodes: [
						{ type: "blit" },
						{ type: "face" },
						{ type: "kira" },
						{ type: "matting" },
						{ type: "sky_seg" },
					],
				}),
			})
		).resolves.toMatchObject({
			kind: "native-swing-shader",
			passCount: 2,
			algorithmTypes: ["blit", "face", "kira", "matting", "sky_seg"],
		});
		await expect(
			fixture({ dualLut: "none", includeAlgorithmConfig: false })
		).resolves.toMatchObject({
			kind: "native-swing-shader",
			algorithmTypes: [],
		});
	});

	it("recognizes the exercised Face AI algorithm nodes", async () => {
		await expect(
			fixture({
				dualLut: "none",
				algorithmConfig: JSON.stringify({
					nodes: [
						{ type: "blit" },
						{ type: "face" },
						{ type: "matting" },
						{ type: "scene_recognition" },
						{ type: "script" },
						{ type: "skin_seg" },
						{ type: "structxt" },
					],
				}),
			})
		).resolves.toMatchObject({
			kind: "native-swing-shader",
			algorithmTypes: [
				"blit",
				"face",
				"matting",
				"scene_recognition",
				"script",
				"skin_seg",
				"structxt",
			],
		});
		await expect(
			fixture({
				omit: "AmazingFeature/image/filter_bg.png",
				algorithmConfig: JSON.stringify({
					nodes: [
						{ type: "blit" },
						{ type: "face" },
						{ type: "matting" },
						{ type: "skin_seg" },
						{ type: "structxt" },
					],
				}),
			})
		).resolves.toMatchObject({
			kind: "native-swing-shader",
			algorithmTypes: ["blit", "face", "matting", "skin_seg", "structxt"],
		});
	});

	it.each([
		"AmazingFeature/image/filter_bg.png",
		"AmazingFeature/image/filter_skin.png",
		"AmazingFeature/main.scene",
		"AmazingFeature/lua/main.lua",
		"AmazingFeature/shader/filter.xshader",
	])("rejects an incomplete graph without %s", async (omit) => {
		await expect(fixture({ omit })).resolves.toBeNull();
	});

	it("requires at least one material and reports the actual pass count", async () => {
		await expect(
			fixture({ omit: "AmazingFeature/material/pass1.material" })
		).resolves.toMatchObject({ passCount: 1 });
		await expect(
			fixture({
				omit: [
					"AmazingFeature/material/pass0.material",
					"AmazingFeature/material/pass1.material",
				],
			})
		).resolves.toBeNull();
	});

	it("rejects malformed, missing, and unknown algorithm nodes", async () => {
		await expect(fixture({ algorithmConfig: "{" })).resolves.toBeNull();
		await expect(
			fixture({
				algorithmConfig: JSON.stringify({ nodes: [{ type: "face" }] }),
			})
		).resolves.toBeNull();
		await expect(
			fixture({
				algorithmConfig: JSON.stringify({
					nodes: [{ type: "skin_seg" }, { type: "unknown_runtime" }],
				}),
			})
		).resolves.toBeNull();
	});

	it("rejects partial dual LUTs and shader graphs without compiled stages", async () => {
		await expect(fixture({ dualLut: "partial" })).resolves.toBeNull();
		await expect(
			fixture({
				dualLut: "none",
				omit: "AmazingFeature/shader/gles2/filter.frag",
			})
		).resolves.toBeNull();
		await expect(
			fixture({
				dualLut: "none",
				omit: "AmazingFeature/shader/gles2/filter.vert",
			})
		).resolves.toBeNull();
	});

	it("resolves only safe package identities", () => {
		const renderer = {
			kind: "native-swing-dual-lut" as const,
			container: "artistEffect" as const,
			packageIdentifier: "complex-dual",
			version: "v1",
			passCount: 2,
			algorithmTypes: ["skin_seg"],
		};
		expect(
			resolveJianyingNativeSwingPackagePath({
				cacheRoot: "/cache",
				renderer,
			})
		).toBe(join("/cache", "artistEffect", "complex-dual", "v1"));
		for (const unsafe of [".", "..", "../escape", "nested/path"]) {
			expect(() =>
				resolveJianyingNativeSwingPackagePath({
					cacheRoot: "/cache",
					renderer: { ...renderer, version: unsafe },
				})
			).toThrow("Invalid local Swing filter identity");
		}
	});
});
