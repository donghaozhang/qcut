// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JianyingTextRuntimeReference } from "../jianying-text-runtime-contract.js";
import { resolveJianyingTextPackage } from "../jianying-text-runtime/package-resolver.js";

const RESOURCE_ID = "7328639616670649634";
const PACKAGE_HASH = "a".repeat(32);

function createReference(): JianyingTextRuntimeReference {
	return {
		schemaVersion: 1,
		source: "jianying-cache",
		packageKind: "ScriptInfoSticker",
		resourceId: RESOURCE_ID,
		packageHash: PACKAGE_HASH,
		editMode: "runtime-with-preload-fallback",
		slotMapping: "line-to-widget",
		timeMapping: "stretch",
		templateDuration: 3,
	};
}

async function writeJson({
	filePath,
	value,
}: {
	filePath: string;
	value: unknown;
}) {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(value), "utf8");
}

describe("Jianying text package resolver", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("reports missing script dependencies as a first-class package state", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-package-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await mkdir(packagePath, { recursive: true });
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: {
						effect: { Link: [{ type: "ScriptInfoSticker" }] },
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						root: { duration: 3 },
						children: [{ anim_resource_id: "9999" }],
					},
				}),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);
			await expect(
				resolveJianyingTextPackage({ reference: createReference() })
			).rejects.toMatchObject({
				code: "dependency-missing",
				missingDependencies: [{ resourceId: "9999", role: "animation" }],
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("degrades a missing effectStyle package without dropping script animation", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-effect-style-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: {
						effect: { Link: [{ type: "ScriptInfoSticker" }] },
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						root: { duration: 3 },
						children: [
							{
								richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
							},
						],
					},
				}),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);
			await expect(
				resolveJianyingTextPackage({ reference: createReference() })
			).resolves.toMatchObject({
				packageKind: "ScriptInfoSticker",
				scriptResources: {
					missing: [{ resourceId: "3003", role: "effect-style" }],
					resourcePaths: {},
					diagnostics: [
						{
							code: "effect-style-package-missing",
							severity: "error",
							resourceId: "3003",
						},
					],
				},
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("keeps a shape-only animation dependency as an explicit degraded state", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-shape-animation-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: {
						effect: { Link: [{ type: "ScriptInfoSticker" }] },
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						root: { duration: 3 },
						children: [
							{
								type: "shape",
								anims: [{ anim_resource_id: "7153" }],
							},
						],
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "extra.json"),
					value: {
						depend_resource_list: [
							{
								resource_id: "7153",
								source: 2,
								type: "shape-animation",
							},
						],
					},
				}),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);

			await expect(
				resolveJianyingTextPackage({ reference: createReference() })
			).resolves.toMatchObject({
				packageKind: "ScriptInfoSticker",
				scriptResources: {
					missing: [],
					degraded: [{ resourceId: "7153", role: "animation" }],
					diagnostics: [
						{
							code: "runtime-dependency-unresolved",
							severity: "warning",
							resourceId: "7153",
						},
					],
				},
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("propagates advanced capabilities from an InfoSticker root component", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-info-sticker-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			await mkdir(packagePath, { recursive: true });
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: { effect: { Link: [{ type: "InfoSticker" }] } },
				}),
				writeFile(
					path.join(packagePath, "feedback.frag"),
					"uniform sampler2D historyTexture; void main() {}"
				),
				writeFile(path.join(packagePath, "surface.mesh"), "synthetic mesh"),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);
			const reference: JianyingTextRuntimeReference = {
				...createReference(),
				packageKind: "InfoSticker",
			};

			const resolved = await resolveJianyingTextPackage({ reference });
			expect(resolved).toMatchObject({
				packageKind: "InfoSticker",
				componentManifest: {
					shaderFileCount: 1,
					meshFileCount: 1,
					capabilities: {
						shaderComponents: true,
						threeDimensional: true,
						feedbackComponents: true,
					},
				},
				capabilities: {
					animationComponents: true,
					shaderComponents: true,
					threeDimensional: true,
					feedbackComponents: true,
				},
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("resolves TextStyle layers and refreshes diagnostics when a texture disappears", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-text-style-resolver-")
		);
		try {
			const cacheRoot = path.join(temporary, "Cache");
			const artistEffectRoot = path.join(cacheRoot, "artistEffect");
			const packagePath = path.join(
				artistEffectRoot,
				RESOURCE_ID,
				PACKAGE_HASH
			);
			const texturePath = path.join(packagePath, "textures", "outline.png");
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "config.json"),
					value: { effect: { Link: [{ type: "TextStyle" }] } },
				}),
				writeJson({
					filePath: path.join(packagePath, "effectStyle.json"),
					value: {
						version: 3,
						fill: {
							content: {
								render_type: "gradient",
								gradient: {
									color: [
										[1, 0, 0],
										[0, 0, 1],
									],
									alpha: [1, 1],
									percent: [0, 1],
								},
							},
						},
						strokes: [
							{
								content: {
									render_type: "solid",
									solid: { color: [1, 1, 1], alpha: 1 },
								},
							},
							{
								content: {
									render_type: "texture",
									texture: { path: "textures/outline.png" },
								},
							},
						],
						inner_shadows: [],
						shadows: [],
					},
				}),
				writeJson({ filePath: texturePath, value: { synthetic: true } }),
			]);
			vi.stubEnv("QCUT_JIANYING_TEXT_PACKAGE_ROOT", artistEffectRoot);
			vi.stubEnv("QCUT_JIANYING_CACHE_ROOT", cacheRoot);
			const reference: JianyingTextRuntimeReference = {
				...createReference(),
				packageKind: "TextStyle",
			};

			const ready = await resolveJianyingTextPackage({ reference });
			expect(ready).toMatchObject({
				packageKind: "TextStyle",
				capabilities: {
					staticTexture: true,
					multipleStrokes: true,
					animationComponents: false,
					scriptInfoSticker: false,
				},
				diagnostics: [],
				effectStyle: {
					fillKind: "gradient",
					strokeCount: 2,
					textureLayerCount: 1,
				},
			});

			await rm(texturePath);
			const degraded = await resolveJianyingTextPackage({ reference });
			expect(degraded.diagnostics).toMatchObject([
				{
					code: "effect-style-texture-missing",
					severity: "warning",
					relativePath: "textures/outline.png",
				},
			]);
			expect(degraded.effectStyle?.fingerprint).not.toBe(
				ready.effectStyle?.fingerprint
			);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
