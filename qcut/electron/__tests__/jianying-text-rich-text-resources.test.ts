import { describe, expect, it } from "vitest";
import {
	collectJianyingRichTextEffectStyleIds,
	replaceJianyingRichTextEffectStylePaths,
} from "../jianying-text-runtime/rich-text-resources.js";

describe("Jianying rich-text resources", () => {
	it("collects unique effectStyle IDs across attribute layouts", () => {
		expect(
			collectJianyingRichTextEffectStyleIds({
				richText:
					'<effectStyle path="" id="3003">[甲]</effectStyle>' +
					"<effectStyle id='2002' path='old'>[乙]</effectStyle>" +
					'<effectStyle id="3003">[丙]</effectStyle>',
			})
		).toEqual(["2002", "3003"]);
	});

	it("replaces or adds escaped absolute effectStyle paths", () => {
		expect(
			replaceJianyingRichTextEffectStylePaths({
				richText:
					'<effectStyle path="catalog" id="3003">[甲]</effectStyle>' +
					'<effectStyle id="2002">[乙]</effectStyle>',
				resourcePaths: {
					"2002": "/private/cache/artistEffect/2002/version",
					"3003": '/private/cache/artistEffect/3003/A & "B"',
				},
			})
		).toBe(
			'<effectStyle path="/private/cache/artistEffect/3003/A &amp; &quot;B&quot;" id="3003">[甲]</effectStyle>' +
				'<effectStyle id="2002" path="/private/cache/artistEffect/2002/version">[乙]</effectStyle>'
		);
	});

	it("rejects malformed IDs and unresolved paths", () => {
		expect(() =>
			collectJianyingRichTextEffectStyleIds({
				richText: '<effectStyle id="../outside" path="">[甲]</effectStyle>',
			})
		).toThrow("effectStyle id is invalid");
		expect(() =>
			replaceJianyingRichTextEffectStylePaths({
				richText: '<effectStyle id="3003" path="">[甲]</effectStyle>',
				resourcePaths: { "3003": "relative/package" },
			})
		).toThrow("Missing resolved Jianying resource 3003");
	});

	it("can explicitly clear unresolved paths for runtime fallback", () => {
		expect(
			replaceJianyingRichTextEffectStylePaths({
				richText:
					'<effectStyle id="3003" path="/catalog/path">[甲]</effectStyle>',
				resourcePaths: {},
				missingBehavior: "clear-path",
			})
		).toBe('<effectStyle id="3003" path="">[甲]</effectStyle>');
	});
});
