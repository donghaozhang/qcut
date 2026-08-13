// @vitest-environment node
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareJianyingScriptContent } from "../jianying-text-runtime/script-package-editor.js";
import { resolveJianyingScriptResources } from "../jianying-text-runtime/script-dependencies.js";

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

function sanitizePathText({ text, roots }: { text: string; roots: string[] }) {
	let sanitized = text;
	for (const root of roots) {
		sanitized = sanitized.split(root).join("<cache>");
	}
	// Windows path separators inside sanitized cache paths must not leak
	// into the platform-stable snapshot.
	return sanitized.includes("<cache>")
		? sanitized.replaceAll("\\", "/")
		: sanitized;
}

/**
 * Walks the value structurally instead of string-replacing over
 * JSON.stringify output: there, Windows backslashes are escaped, so a raw
 * root path would never match and absolute temp paths would leak into the
 * snapshot.
 */
function normalizeTemporaryPaths({
	value,
	roots,
}: {
	value: unknown;
	roots: string[];
}): unknown {
	if (typeof value === "string") {
		return sanitizePathText({ text: value, roots });
	}
	if (Array.isArray(value)) {
		return value.map((entry) =>
			normalizeTemporaryPaths({ value: entry, roots })
		);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
				key,
				normalizeTemporaryPaths({ value: entry, roots }),
			])
		);
	}
	return value;
}

describe("Jianying effectStyle runtime snapshot", () => {
	it("pins the classified dependencies and hydrated runtime payload", async () => {
		const temporary = await mkdtemp(
			path.join(os.tmpdir(), "qcut-effect-style-runtime-snapshot-")
		);
		try {
			const resolvedTemporary = await realpath(temporary);
			const cacheRoot = path.join(temporary, "Cache");
			const packagePath = path.join(temporary, "script-package");
			const animationPath = path.join(cacheRoot, "effect", "1001", "anim-v1");
			const stickerPath = path.join(
				cacheRoot,
				"artistEffect",
				"2002",
				"sticker-v1"
			);
			const effectStylePath = path.join(
				cacheRoot,
				"artistEffect",
				"3003",
				"style-v1"
			);
			const content = {
				children: [
					{
						type: "text",
						anim_resource_id: "1001",
						anim_resource_path: "",
						text_params: {
							richText:
								'<effectStyle id="3003" path=""><font path="catalog-font">[原]</font></effectStyle>',
						},
					},
					{
						type: "sticker",
						sticker_resource_id: "2002",
						sticker_path: "",
					},
				],
			};
			await mkdir(effectStylePath, { recursive: true });
			await Promise.all([
				writeJson({
					filePath: path.join(packagePath, "content.json"),
					value: content,
				}),
				writeJson({
					filePath: path.join(animationPath, "config.json"),
					value: { effect: { Link: [{ type: "TextAnimation" }] } },
				}),
				writeJson({
					filePath: path.join(stickerPath, "config.json"),
					value: { effect: { Link: [{ type: "InfoSticker" }] } },
				}),
				writeJson({
					filePath: path.join(effectStylePath, "config.json"),
					value: { effect: { Link: [{ type: "TextStyle" }] } },
				}),
				writeJson({
					filePath: path.join(effectStylePath, "effectStyle.json"),
					value: {
						version: 3,
						textable: false,
						fill: {
							content: {
								render_type: "solid",
								solid: { alpha: 1, color: [1, 1, 1] },
							},
						},
						strokes: [
							{
								enable: true,
								width: 0.05,
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
									texture: { path: "border.texture", scale: 0.8 },
								},
							},
						],
						inner_shadows: [],
						shadows: [],
					},
				}),
				writeFile(path.join(effectStylePath, "border.texture"), "synthetic"),
			]);

			const resources = await resolveJianyingScriptResources({
				packagePath,
				cacheRoot,
			});
			const hydrated = prepareJianyingScriptContent({
				value: content,
				content: "花字验证",
				resourcePaths: resources.resourcePaths,
				fontPath: "/fonts/QCut-CJK.ttf",
			});
			const snapshot = normalizeTemporaryPaths({
				// Both forms can appear in resolved paths (macOS /var vs
				// /private/var symlinks; Windows raw temp paths).
				roots: [resolvedTemporary, temporary],
				value: {
					capabilities: resources.capabilities,
					diagnostics: resources.diagnostics,
					missing: resources.missing,
					effectStyles: resources.effectStyles.map((style) => ({
						resourceId: style.resourceId,
						fillKind: style.fillKind,
						strokeCount: style.strokeCount,
						textureLayerCount: style.textureLayerCount,
						textures: style.textures,
					})),
					hydrated,
				},
			});

			expect(snapshot).toMatchInlineSnapshot(`
				{
				  "capabilities": {
				    "animationComponents": true,
				    "feedbackComponents": false,
				    "multipleStrokes": true,
				    "scriptInfoSticker": true,
				    "shaderComponents": false,
				    "staticTexture": true,
				    "threeDimensional": false,
				  },
				  "diagnostics": [],
				  "effectStyles": [
				    {
				      "fillKind": "solid",
				      "resourceId": "3003",
				      "strokeCount": 2,
				      "textureLayerCount": 1,
				      "textures": [
				        {
				          "relativePath": "border.texture",
				          "state": "ready",
				        },
				      ],
				    },
				  ],
				  "hydrated": {
				    "children": [
				      {
				        "anim_resource_id": "1001",
				        "anim_resource_path": "<cache>/Cache/effect/1001/anim-v1",
				        "text_params": {
				          "richText": "<effectStyle id="3003" path="<cache>/Cache/artistEffect/3003/style-v1"><font path="/fonts/QCut-CJK.ttf">[花字验证]</font></effectStyle>",
				        },
				        "type": "text",
				      },
				      {
				        "sticker_path": "<cache>/Cache/artistEffect/2002/sticker-v1",
				        "sticker_resource_id": "2002",
				        "type": "sticker",
				      },
				    ],
				  },
				  "missing": [],
				}
			`);
		} finally {
			await rm(temporary, { recursive: true, force: true });
		}
	});
});
