import { describe, expect, it } from "vitest";
import {
	editJianyingScriptContent,
	replaceJianyingRichTextSlots,
} from "../jianying-text-runtime/script-package-editor.js";

describe("Jianying script text package editing", () => {
	it("preserves rich-text tags and distributes code points across slots", () => {
		expect(
			replaceJianyingRichTextSlots({
				richText: "<color=red>[原]</color><size=12>[文]</size>",
				text: "新😀字",
			})
		).toBe("<color=red>[新]</color><size=12>[😀字]</size>");
	});

	it("keeps every slot non-empty and neutralizes bracket delimiters", () => {
		expect(
			replaceJianyingRichTextSlots({
				richText: "[a]-[b]-[c]",
				text: "[x]",
			})
		).toBe("[［]-[x]-[］]");
		expect(
			replaceJianyingRichTextSlots({ richText: "[a]-[b]", text: "" })
		).toBe("[ ]-[ ]");
	});

	it("maps lines to widgets and appends extra lines to the last widget", () => {
		const result = editJianyingScriptContent({
			content: "第一行\n第二行\n第三行",
			value: {
				children: [
					{ type: "text", text_params: { richText: "<b>[旧]</b>" } },
					{ type: "sticker" },
					{ type: "text", text_params: { richText: "[A][B]" } },
				],
			},
		});
		expect(result.textWidgetCount).toBe(2);
		expect(result.slotCount).toBe(3);
		expect(result.value).toMatchObject({
			children: [
				{ text_params: { richText: "<b>[第一行]</b>" } },
				{ type: "sticker" },
				{ text_params: { richText: "[第][二行\n第三行]" } },
			],
		});
	});

	it("rejects templates without editable text slots", () => {
		expect(() =>
			editJianyingScriptContent({
				content: "QCut",
				value: {
					children: [{ type: "text", text_params: { richText: "plain" } }],
				},
			})
		).toThrow("no editable rich-text slots");
	});
});
