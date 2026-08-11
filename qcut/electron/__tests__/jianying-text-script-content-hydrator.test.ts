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
						richText: '<font path="catalog-font">[原]</font>',
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
			},
			fontPath: '/private/fonts/QCut & "CJK".ttf',
		});
		expect(result).toMatchObject({
			children: [
				{
					anim_resource_id: "1001",
					anim_resource_path: "/private/cache/effect/1001/version",
					text_params: {
						richText:
							'<font path="/private/fonts/QCut &amp; &quot;CJK&quot;.ttf">[原]</font>',
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

	it("fails explicitly when a referenced package is unavailable", () => {
		expect(() =>
			hydrateJianyingScriptContent({
				value: { anim_resource_id: "1001" },
				resourcePaths: {},
			})
		).toThrow("Missing resolved Jianying resource 1001");
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
