// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJianyingEffectStylePackage } from "../jianying-text-effect-style-parser.js";

const RESOURCE_ID = "7328648540438154511";
const temporaryDirectories: string[] = [];

async function createTemporaryPackage() {
	const packagePath = await mkdtemp(
		path.join(os.tmpdir(), "qcut-effect-style-parser-")
	);
	temporaryDirectories.push(packagePath);
	await writeFile(
		path.join(packagePath, "config.json"),
		JSON.stringify({ effect: { Link: [{ type: "TextStyle" }] } }),
		"utf8"
	);
	return packagePath;
}

async function writeStyle({
	packagePath,
	style,
}: {
	packagePath: string;
	style: unknown;
}) {
	await writeFile(
		path.join(packagePath, "effectStyle.json"),
		JSON.stringify(style),
		"utf8"
	);
}

function layeredStyle({ texturePath }: { texturePath: string }) {
	return {
		version: 3,
		textable: false,
		future_field: { preserve: true },
		fill: {
			alpha: 0.9,
			content: {
				render_type: "gradient",
				gradient: {
					alpha: [1, 0.8],
					color: [
						[1, 0, 0],
						[0, 0, 1],
					],
					percent: [0, 1],
					angle: 90,
				},
			},
		},
		strokes: [
			{
				enable: true,
				width: 0.06,
				content: {
					render_type: "solid",
					solid: { alpha: 1, color: [0, 1, 0] },
				},
			},
			{
				enable: true,
				width: 0.4,
				content: {
					render_type: "texture",
					texture: {
						path: texturePath,
						alpha: 1,
						scale: 0.85,
						wrapMode: "repeat",
					},
				},
			},
		],
		inner_shadows: [
			{
				enable: false,
				content: {
					render_type: "texture",
					texture: { path: "disabled-missing.png" },
				},
			},
		],
		shadows: [
			{
				enable: true,
				distance: 4,
				content: {
					render_type: "solid",
					solid: { alpha: 0.5, color: [0, 0, 0] },
				},
			},
		],
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying effectStyle parser", () => {
	it("normalizes layered styles and preserves versioned source parameters", async () => {
		const packagePath = await createTemporaryPackage();
		await mkdir(path.join(packagePath, "textures"), { recursive: true });
		await Promise.all([
			writeStyle({
				packagePath,
				style: layeredStyle({ texturePath: "textures/border.png" }),
			}),
			writeFile(
				path.join(packagePath, "textures", "border.png"),
				Buffer.from([0x89, 0x50, 0x4e, 0x47])
			),
		]);

		const result = await parseJianyingEffectStylePackage({
			packagePath,
			resourceId: RESOURCE_ID,
		});

		expect(result.state).toBe("ready");
		expect(result.canHydrate).toBe(true);
		expect(result.diagnostics).toEqual([]);
		expect(result.manifest).toMatchObject({
			schemaVersion: 1,
			resourceId: RESOURCE_ID,
			packageVersion: "3",
			textable: false,
			fillKind: "gradient",
			strokeCount: 2,
			innerShadowCount: 0,
			shadowCount: 1,
			textureLayerCount: 1,
			gradientLayerCount: 1,
			textures: [{ relativePath: "textures/border.png", state: "ready" }],
			capabilities: {
				staticTexture: true,
				multipleStrokes: true,
				animationComponents: false,
				scriptInfoSticker: false,
				shaderComponents: false,
				threeDimensional: false,
				feedbackComponents: false,
			},
			source: { future_field: { preserve: true } },
		});
		expect(result.manifest?.layers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					path: "$.fill",
					role: "fill",
					renderType: "gradient",
				}),
				expect.objectContaining({
					path: "$.strokes[1]",
					role: "stroke",
					renderType: "texture",
					texturePath: "textures/border.png",
				}),
			])
		);
		expect(result.manifest?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	it("reports missing and escaping textures without discarding valid layers", async () => {
		const missingPackage = await createTemporaryPackage();
		const escapingPackage = await createTemporaryPackage();
		await Promise.all([
			writeStyle({
				packagePath: missingPackage,
				style: layeredStyle({ texturePath: "textures/missing.png" }),
			}),
			writeStyle({
				packagePath: escapingPackage,
				style: layeredStyle({ texturePath: "../outside.png" }),
			}),
		]);

		const [missing, escaping] = await Promise.all([
			parseJianyingEffectStylePackage({
				packagePath: missingPackage,
				resourceId: RESOURCE_ID,
			}),
			parseJianyingEffectStylePackage({
				packagePath: escapingPackage,
				resourceId: RESOURCE_ID,
			}),
		]);

		expect(missing).toMatchObject({
			state: "degraded",
			canHydrate: false,
			manifest: {
				textureLayerCount: 1,
				textures: [{ relativePath: "textures/missing.png", state: "missing" }],
			},
			diagnostics: [
				{
					code: "effect-style-texture-missing",
					severity: "warning",
					relativePath: "textures/missing.png",
				},
			],
		});
		expect(escaping).toMatchObject({
			state: "degraded",
			canHydrate: false,
			manifest: {
				textures: [{ relativePath: "../outside.png", state: "invalid" }],
			},
			diagnostics: [
				{
					code: "effect-style-texture-outside-package",
					severity: "warning",
					relativePath: "../outside.png",
				},
			],
		});
	});

	it("returns explicit invalid states for malformed or non-TextStyle packages", async () => {
		const malformedPackage = await createTemporaryPackage();
		const wrongKindPackage = await createTemporaryPackage();
		await Promise.all([
			writeFile(path.join(malformedPackage, "effectStyle.json"), "{", "utf8"),
			writeFile(
				path.join(wrongKindPackage, "config.json"),
				JSON.stringify({ effect: { Link: [{ type: "InfoSticker" }] } }),
				"utf8"
			),
		]);

		const [malformed, wrongKind] = await Promise.all([
			parseJianyingEffectStylePackage({
				packagePath: malformedPackage,
				resourceId: RESOURCE_ID,
			}),
			parseJianyingEffectStylePackage({
				packagePath: wrongKindPackage,
				resourceId: RESOURCE_ID,
			}),
		]);

		expect(malformed).toMatchObject({
			state: "invalid",
			canHydrate: false,
			diagnostics: [{ code: "effect-style-manifest-invalid" }],
		});
		expect(wrongKind).toMatchObject({
			state: "invalid",
			canHydrate: false,
			diagnostics: [{ code: "effect-style-config-invalid" }],
		});
	});
});
