import {
	mkdir,
	mkdtemp,
	realpath,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	collectJianyingScriptResourceReferences,
	resolveJianyingScriptResources,
} from "../jianying-text-runtime/script-dependencies.js";

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

async function createResourcePackage({
	cacheRoot,
	container,
	resourceId,
	version,
	modifiedAt,
	effectStyle,
	packageKind,
	files = {},
}: {
	cacheRoot: string;
	container: "artistEffect" | "effect";
	resourceId: string;
	version: string;
	modifiedAt: Date;
	effectStyle?: Record<string, unknown>;
	packageKind?: "AmazingFeature" | "InfoSticker";
	files?: Readonly<Record<string, string | Uint8Array>>;
}) {
	const packagePath = path.join(cacheRoot, container, resourceId, version);
	await writeJson({
		filePath: path.join(packagePath, "config.json"),
		value: effectStyle
			? { effect: { Link: [{ type: "TextStyle" }] } }
			: packageKind
				? { effect: { Link: [{ type: packageKind }] } }
				: { resourceId },
	});
	if (effectStyle) {
		await writeJson({
			filePath: path.join(packagePath, "effectStyle.json"),
			value: effectStyle,
		});
	}
	await Promise.all(
		Object.entries(files).map(([relativePath, contents]) =>
			writeFile(path.join(packagePath, relativePath), contents)
		)
	);
	await utimes(packagePath, modifiedAt, modifiedAt);
	return realpath(packagePath);
}

describe("Jianying script resource dependencies", () => {
	it("collects unique animation, sticker, effectStyle, and font references", () => {
		expect(
			collectJianyingScriptResourceReferences({
				value: {
					children: [
						{ anim_resource_id: "1001" },
						{
							children: [
								{ anim_resource_id: "1001" },
								{
									sticker_resource_id: "2002",
									richText:
										'<effectStyle id="3003" path=""><font id="4004" path="">[字]</font></effectStyle>',
								},
							],
						},
					],
				},
			})
		).toEqual([
			{ resourceId: "1001", role: "animation" },
			{ resourceId: "3003", role: "effect-style" },
			{ resourceId: "4004", role: "font" },
			{ resourceId: "2002", role: "sticker" },
		]);
	});

	it("resolves each cached template font and degrades only missing font slots", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-fonts-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					richText:
						'<font id="4004" path="">[标题]</font><font id="5005" path="">[说明]</font>',
				},
			});
			const fontPackage = await createResourcePackage({
				cacheRoot,
				container: "effect",
				resourceId: "4004",
				version: "font-v1",
				modifiedAt: new Date("2026-01-01T00:00:00Z"),
				files: {
					"title.ttf": new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x01]),
				},
			});

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});

			expect(result.fontPaths).toEqual({
				"4004": path.join(fontPackage, "title.ttf"),
			});
			expect(result.missing).toEqual([]);
			expect(result.degraded).toEqual([{ resourceId: "5005", role: "font" }]);
			expect(result.diagnostics).toMatchObject([
				{
					code: "template-font-missing",
					severity: "warning",
					resourceId: "5005",
				},
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("rejects malformed resource IDs instead of resolving arbitrary paths", () => {
		expect(() =>
			collectJianyingScriptResourceReferences({
				value: { anim_resource_id: "../outside" },
			})
		).toThrow("anim_resource_id is invalid");
	});

	it("resolves the newest readable animation and artist sticker packages", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-dependencies-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						children: [
							{ anim_resource_id: "1001", anim_resource_path: "" },
							{ sticker_resource_id: "2002", sticker_path: "" },
							{
								richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
							},
						],
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "extra.json"),
					value: {
						depend_resource_list: [
							{ resource_id: "2002", source: 1, type: "default" },
						],
					},
				}),
			]);
			const [oldAnimation, newAnimation, sticker, effectStyle] =
				await Promise.all([
					createResourcePackage({
						cacheRoot,
						container: "effect",
						resourceId: "1001",
						version: "old",
						modifiedAt: new Date("2024-01-01T00:00:00Z"),
					}),
					createResourcePackage({
						cacheRoot,
						container: "effect",
						resourceId: "1001",
						version: "new",
						modifiedAt: new Date("2025-01-01T00:00:00Z"),
						files: {
							"surface.mesh": "synthetic mesh",
							"visual.frag":
								"uniform sampler2D previousTexture; void main() {}",
						},
					}),
					createResourcePackage({
						cacheRoot,
						container: "artistEffect",
						resourceId: "2002",
						version: "sticker",
						modifiedAt: new Date("2025-02-01T00:00:00Z"),
					}),
					createResourcePackage({
						cacheRoot,
						container: "artistEffect",
						resourceId: "3003",
						version: "style",
						modifiedAt: new Date("2025-03-01T00:00:00Z"),
						effectStyle: {
							version: 3,
							textable: false,
							fill: {
								content: {
									render_type: "solid",
									solid: { alpha: 1, color: [1, 1, 1] },
								},
							},
							strokes: [],
							inner_shadows: [],
							shadows: [],
						},
					}),
				]);
			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});
			expect(result.missing).toEqual([]);
			expect(result.resourcePaths).toEqual({
				"1001": newAnimation,
				"2002": sticker,
				"3003": effectStyle,
			});
			expect(result.resourcePaths["1001"]).not.toBe(oldAnimation);
			expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
			expect(result.effectStyles).toMatchObject([
				{
					resourceId: "3003",
					fillKind: "solid",
					capabilities: {
						staticTexture: false,
						multipleStrokes: false,
						animationComponents: false,
						scriptInfoSticker: false,
						shaderComponents: false,
						threeDimensional: false,
						feedbackComponents: false,
					},
				},
			]);
			expect(result.components).toMatchObject([
				{
					resourceId: "1001",
					role: "animation",
					manifest: {
						shaderFileCount: 1,
						meshFileCount: 1,
						capabilities: {
							shaderComponents: true,
							threeDimensional: true,
							feedbackComponents: true,
						},
					},
				},
				expect.objectContaining({
					resourceId: "2002",
					role: "sticker",
				}),
			]);
			expect(result.capabilities).toEqual({
				staticTexture: false,
				multipleStrokes: false,
				animationComponents: true,
				scriptInfoSticker: true,
				shaderComponents: true,
				threeDimensional: true,
				feedbackComponents: true,
			});
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("resolves an InfoSticker component referenced as an effectStyle", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-runtime-component-style-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					children: [
						{
							type: "text",
							text_params: {
								richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
							},
						},
					],
				},
			});
			const componentPath = await createResourcePackage({
				cacheRoot,
				container: "artistEffect",
				resourceId: "3003",
				version: "component-style",
				modifiedAt: new Date("2026-01-01T00:00:00Z"),
				packageKind: "InfoSticker",
				files: {
					"effect.xshader":
						"uniform sampler2D previousTexture; uniform mat4 projectionMatrix;",
				},
			});

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});

			expect(result.missing).toEqual([]);
			expect(result.resourcePaths).toEqual({ "3003": componentPath });
			expect(result.components).toMatchObject([
				{
					resourceId: "3003",
					role: "effect-style",
					manifest: {
						shaderFileCount: 1,
						capabilities: {
							shaderComponents: true,
							threeDimensional: true,
							feedbackComponents: true,
						},
					},
				},
			]);
			expect(result.diagnostics).toMatchObject([
				{
					code: "effect-style-runtime-component",
					severity: "warning",
					resourceId: "3003",
				},
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("reports every unresolved dependency without storing a path", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-missing-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					children: [
						{ anim_resource_id: "1001" },
						{ sticker_resource_id: "2002" },
						{
							richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
						},
					],
				},
			});
			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot: path.join(temporary, "Cache"),
			});
			expect(result.resourcePaths).toEqual({});
			expect(result.missing).toEqual([
				{ resourceId: "1001", role: "animation" },
				{ resourceId: "3003", role: "effect-style" },
				{ resourceId: "2002", role: "sticker" },
			]);
			expect(result.diagnostics).toMatchObject([
				{
					code: "effect-style-package-missing",
					severity: "error",
					resourceId: "3003",
				},
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("degrades only unresolved shape animations owned exclusively by shape widgets", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-shape-fallback-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: {
						children: [
							{
								type: "shape",
								anims: [{ anim_resource_id: "1001" }],
							},
							{
								type: "text",
								anims: [{ anim_resource_id: "1002" }],
							},
						],
					},
				}),
				writeJson({
					filePath: path.join(packagePath, "extra.json"),
					value: {
						depend_resource_list: [
							{ resource_id: "1001", source: 2, type: "shape-animation" },
							{ resource_id: "1002", source: 2, type: "shape-animation" },
						],
					},
				}),
			]);

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot: path.join(temporary, "Cache"),
			});

			expect(result.degraded).toEqual([
				{ resourceId: "1001", role: "animation" },
			]);
			expect(result.missing).toEqual([
				{ resourceId: "1002", role: "animation" },
			]);
			expect(result.diagnostics).toMatchObject([
				{
					code: "runtime-dependency-unresolved",
					severity: "warning",
					resourceId: "1001",
				},
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("withholds an effectStyle whose required texture is missing", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-texture-fallback-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					children: [
						{
							richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
						},
					],
				},
			});
			await createResourcePackage({
				cacheRoot,
				container: "artistEffect",
				resourceId: "3003",
				version: "missing-texture",
				modifiedAt: new Date("2025-03-01T00:00:00Z"),
				effectStyle: {
					version: 3,
					fill: {
						content: {
							render_type: "texture",
							texture: { path: "missing.png" },
						},
					},
					strokes: [],
					inner_shadows: [],
					shadows: [],
				},
			});

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});

			expect(result.resourcePaths).toEqual({});
			expect(result.missing).toEqual([
				{ resourceId: "3003", role: "effect-style" },
			]);
			expect(result.capabilities.staticTexture).toBe(true);
			expect(result.diagnostics).toMatchObject([
				{
					code: "effect-style-texture-missing",
					severity: "warning",
					resourceId: "3003",
				},
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});

	it("falls back to an older complete effectStyle cache version", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-jianying-script-style-version-")
		);
		try {
			const packagePath = path.join(temporary, "script-package");
			const cacheRoot = path.join(temporary, "Cache");
			await writeJson({
				filePath: path.join(packagePath, "content.json"),
				value: {
					richText: '<effectStyle id="3003" path="">[字]</effectStyle>',
				},
			});
			const [complete] = await Promise.all([
				createResourcePackage({
					cacheRoot,
					container: "artistEffect",
					resourceId: "3003",
					version: "complete",
					modifiedAt: new Date("2025-01-01T00:00:00Z"),
					effectStyle: {
						version: 3,
						fill: {
							content: {
								render_type: "solid",
								solid: { alpha: 1, color: [1, 1, 1] },
							},
						},
						strokes: [],
						inner_shadows: [],
						shadows: [],
					},
				}),
				createResourcePackage({
					cacheRoot,
					container: "artistEffect",
					resourceId: "3003",
					version: "newer-invalid",
					modifiedAt: new Date("2025-02-01T00:00:00Z"),
				}),
			]);

			const result = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});

			expect(result.missing).toEqual([]);
			expect(result.resourcePaths).toEqual({ "3003": complete });
			expect(result.effectStyles).toMatchObject([
				{ resourceId: "3003", fillKind: "solid" },
			]);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
