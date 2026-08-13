import { describe, expect, it } from "vitest";
import {
	hydrateJianyingScriptContent,
	replaceJianyingRichTextFontPaths,
} from "../jianying-text-runtime/script-content-hydrator.js";

describe("Jianying script content hydration", () => {
	it("injects absolute dependency paths without mutating catalog content", () => {
		const source = {
			children: [
				{
					anim_resource_id: "1001",
					anim_resource_path: "",
					text_params: {
						richText:
							'<effectStyle id="3003" path=""><font path="catalog-font">[原]</font></effectStyle>',
					},
				},
				{
					sticker_resource_id: "2002",
					sticker_path: "",
				},
			],
		};
		const result = hydrateJianyingScriptContent({
			value: source,
			resourcePaths: {
				"1001": "/private/cache/effect/1001/version",
				"2002": "/private/cache/artistEffect/2002/version",
				"3003": "/private/cache/artistEffect/3003/version",
			},
			fontOverridePath: '/private/fonts/QCut & "CJK".ttf',
		});
		expect(result).toMatchObject({
			children: [
				{
					anim_resource_id: "1001",
					anim_resource_path: "/private/cache/effect/1001/version",
					text_params: {
						richText:
							'<effectStyle id="3003" path="/private/cache/artistEffect/3003/version"><font path="/private/fonts/QCut &amp; &quot;CJK&quot;.ttf">[原]</font></effectStyle>',
					},
				},
				{
					sticker_resource_id: "2002",
					sticker_path: "/private/cache/artistEffect/2002/version",
				},
			],
		});
		expect(source.children[0].anim_resource_path).toBe("");
		expect(source.children[1].sticker_path).toBe("");
	});

	it("preserves mixed template fonts and falls back only missing slots", () => {
		const result = hydrateJianyingScriptContent({
			value: {
				text_params: {
					richText:
						'<font id="7001" path="">[主标题]</font><font id="7002" path="">[副标题]</font><font id="7003" path="">[缺失]</font>',
				},
			},
			resourcePaths: {},
			fontPaths: {
				"7001": "/private/fonts/title.ttf",
				"7002": "/private/fonts/caption.otf",
			},
			fallbackFontPath: "/System/Library/Fonts/STHeiti Medium.ttc",
		});

		expect(result).toMatchObject({
			text_params: {
				richText:
					'<font id="7001" path="/private/fonts/title.ttf">[主标题]</font><font id="7002" path="/private/fonts/caption.otf">[副标题]</font><font id="7003" path="/System/Library/Fonts/STHeiti Medium.ttc">[缺失]</font>',
			},
		});
	});

	it("overrides every template font only when a timeline font is explicit", () => {
		const result = hydrateJianyingScriptContent({
			value: {
				richText:
					'<font id="7001" path="">[甲]</font><font id="7002" path="">[乙]</font>',
			},
			resourcePaths: {},
			fontPaths: {
				"7001": "/private/fonts/title.ttf",
				"7002": "/private/fonts/caption.otf",
			},
			fallbackFontPath: "/private/fonts/fallback.ttf",
			fontOverridePath: "/private/fonts/selected.ttf",
		});

		expect(result).toMatchObject({
			richText:
				'<font id="7001" path="/private/fonts/selected.ttf">[甲]</font><font id="7002" path="/private/fonts/selected.ttf">[乙]</font>',
		});
	});

	it("preserves self-closing font tags when adding a font path", () => {
		expect(
			replaceJianyingRichTextFontPaths({
				richText: '<font id="7001"/>',
				fontPath: "/private/fonts/title.ttf",
			})
		).toBe('<font id="7001" path="/private/fonts/title.ttf"/>');
	});

	it("fails explicitly when a referenced package is unavailable", () => {
		expect(() =>
			hydrateJianyingScriptContent({
				value: { anim_resource_id: "1001" },
				resourcePaths: {},
			})
		).toThrow("Missing resolved Jianying resource 1001");
	});

	it("removes a shape with a degraded animation while preserving sibling layers", () => {
		expect(
			hydrateJianyingScriptContent({
				value: {
					children: [
						{
							type: "text",
							anims: [
								{
									anim_resource_id: "2002",
									anim_resource_path: "",
								},
							],
						},
						{
							type: "shape",
							shape_params: { shape_type: 4 },
							anims: [
								{
									anim_resource_id: "1001",
									anim_resource_path: "/untrusted/catalog/path",
								},
							],
						},
					],
				},
				resourcePaths: {
					"2002": "/private/cache/effect/2002/version",
				},
				degradedResourceIds: new Set(["1001"]),
			})
		).toEqual({
			children: [
				{
					type: "text",
					anims: [
						{
							anim_resource_id: "2002",
							anim_resource_path: "/private/cache/effect/2002/version",
						},
					],
				},
			],
		});
	});

	it("clears an unresolved effectStyle path while preserving editable text", () => {
		expect(
			hydrateJianyingScriptContent({
				value: {
					text_params: {
						richText:
							'<effectStyle id="3003" path="/untrusted/catalog/path">[保留文字]</effectStyle>',
					},
				},
				resourcePaths: {},
			})
		).toMatchObject({
			text_params: {
				richText: '<effectStyle id="3003" path="">[保留文字]</effectStyle>',
			},
		});
	});

	it("requires absolute dependency and font paths", () => {
		expect(() =>
			hydrateJianyingScriptContent({
				value: { sticker_resource_id: "2002" },
				resourcePaths: { "2002": "relative/package" },
			})
		).toThrow("Missing resolved Jianying resource 2002");
		expect(() =>
			replaceJianyingRichTextFontPaths({
				richText: '<font path="old">[原]</font>',
				fontPath: "relative/font.ttf",
			})
		).toThrow("font path must be absolute");
	});
});
