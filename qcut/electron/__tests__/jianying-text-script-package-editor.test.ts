import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	editJianyingScriptContent,
	getEditedJianyingScriptPackage,
	replaceJianyingRichTextSlots,
} from "../jianying-text-runtime/script-package-editor.js";

describe("Jianying script text package editing", () => {
	it("preserves rich-text tags and distributes graphemes across slots", () => {
		expect(
			replaceJianyingRichTextSlots({
				richText: "<color=red>[原]</color><size=12>[文]</size>",
				text: "新😀字",
			})
		).toBe("<color=red>[新]</color><size=12>[😀字]</size>");
	});

	it("never splits joined emoji or combining sequences between slots", () => {
		expect(
			replaceJianyingRichTextSlots({
				richText: "[a]-[b]-[c]",
				text: "👨‍👩‍👧‍👦e\u0301🇦🇺",
			})
		).toBe("[👨‍👩‍👧‍👦]-[é]-[🇦🇺]");
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

	it("preserves mixed-style proportions when replacement text is longer", () => {
		expect(
			replaceJianyingRichTextSlots({
				richText:
					'<font id="a">[ABCD]</font><color=red>[E]</color><font id="b">[FG]</font>',
				text: "1234567890",
			})
		).toBe(
			'<font id="a">[12345]</font><color=red>[67]</color><font id="b">[890]</font>'
		);
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
				{ text_params: { richText: "[第二行][\n第三行]" } },
			],
		});
	});

	it("normalizes legacy carriage returns before mapping lines", () => {
		const result = editJianyingScriptContent({
			content: "第一行\r第二行\r\n第三行",
			value: {
				children: [
					{ type: "text", text_params: { richText: "[甲]" } },
					{ type: "text", text_params: { richText: "[乙]" } },
				],
			},
		});
		expect(result.value).toMatchObject({
			children: [
				{ text_params: { richText: "[第一行]" } },
				{ text_params: { richText: "[第二行\n第三行]" } },
			],
		});
	});

	it("edits nested slots without assigning lines to literal text layers", () => {
		const result = editJianyingScriptContent({
			content: "主标题\n副标题",
			value: {
				children: [
					{
						type: "group",
						children: [
							{ type: "text", text_params: { richText: "固定装饰" } },
							{
								type: "text",
								text_params: { richText: "<b>[原主标题]</b>" },
							},
						],
					},
					{ type: "text", text_params: { richText: "[原副标题]" } },
				],
			},
		});
		expect(result.textWidgetCount).toBe(2);
		expect(result.slotCount).toBe(2);
		expect(result.value).toMatchObject({
			children: [
				{
					children: [
						{ text_params: { richText: "固定装饰" } },
						{ text_params: { richText: "<b>[主标题]</b>" } },
					],
				},
				{ text_params: { richText: "[副标题]" } },
			],
		});
	});

	it("repeats one line across layered text widgets", () => {
		const result = editJianyingScriptContent({
			content: "同层文字",
			value: {
				children: [
					{ type: "text", text_params: { richText: "<b>[左]</b>" } },
					{ type: "text", text_params: { richText: "[主][题]" } },
				],
			},
		});
		expect(result.value).toMatchObject({
			children: [
				{ text_params: { richText: "<b>[同层文字]</b>" } },
				{ text_params: { richText: "[同层][文字]" } },
			],
		});
	});

	it("edits the dominant template text while preserving smaller decorations", () => {
		const result = editJianyingScriptContent({
			content: "脚本花字",
			value: {
				children: [
					{
						type: "text",
						original_size: [159, 243],
						scale: [0.258, 0.258, 1],
						text_params: { richText: "[DE\\nDI\\nFANG]" },
					},
					{
						type: "text",
						original_size: [201, 330],
						scale: [1.664, 1.664, 1],
						text_params: { richText: "<b>[去有风\\n的地方]</b>" },
					},
					{
						type: "text",
						original_size: [323, 104],
						scale: [1, 1, 1],
						text_params: { richText: "[spring]" },
					},
				],
			},
		});

		expect(result.textWidgetCount).toBe(1);
		expect(result.slotCount).toBe(1);
		expect(result.value).toMatchObject({
			children: [
				{ text_params: { richText: "[DE\\nDI\\nFANG]" } },
				{ text_params: { richText: "<b>[脚本花字]</b>" } },
				{ text_params: { richText: "[spring]" } },
			],
		});
	});

	it("fits longer text without moving or scaling sibling decorations", () => {
		const result = editJianyingScriptContent({
			content: "签名通过",
			value: {
				children: [
					{
						type: "sticker",
						position: [-243.5, -37, 0],
						scale: [0.675, 0.675, 1],
					},
					{
						type: "text",
						position: [-4.5, 0, 0],
						scale: [2.5, 2.5, 1],
						text_params: {
							richText: '<effectStyle id="3003" path="">[整活]</effectStyle>',
						},
					},
				],
			},
		});
		expect(result.value).toMatchObject({
			children: [
				{
					position: [-243.5, -37, 0],
					scale: [0.675, 0.675, 1],
				},
				{
					position: [-4.5, 0, 0],
					scale: [1.25, 1.25, 1],
					text_params: {
						richText: '<effectStyle id="3003" path="">[签名通过]</effectStyle>',
					},
				},
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

	it("copies runtime dependencies inside the editable script package", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-script-package-"));
		const sourcePackage = path.join(root, "package");
		const sourceDependency = path.join(root, "animation");
		const packageHash = `test-${randomUUID()}`;
		let copiedPackage: string | undefined;
		try {
			await Promise.all([
				mkdir(sourcePackage, { recursive: true }),
				mkdir(sourceDependency, { recursive: true }),
			]);
			await Promise.all([
				writeFile(
					path.join(sourcePackage, "content.json"),
					JSON.stringify({
						children: [
							{
								anims: [
									{
										anim_resource_id: "animation-1",
										anim_resource_path: "",
									},
								],
								text_params: { richText: "[old]" },
								type: "text",
							},
						],
						root: { duration: 3 },
					}),
					"utf8"
				),
				writeFile(
					path.join(sourceDependency, "extra.json"),
					'{"animation":true}\n',
					"utf8"
				),
			]);

			copiedPackage = await getEditedJianyingScriptPackage({
				packagePath: sourcePackage,
				packageHash,
				content: "new",
				resourcePaths: { "animation-1": sourceDependency },
				resourceFingerprint: "test-fingerprint",
				templateFontPaths: {},
				fallbackFontPath: path.join(root, "fallback.ttf"),
			});
			const content = JSON.parse(
				await readFile(path.join(copiedPackage, "content.json"), "utf8")
			) as {
				children: Array<{ anims: Array<{ anim_resource_path: string }> }>;
			};
			const localizedPath = content.children[0].anims[0].anim_resource_path;
			expect(path.relative(copiedPackage, localizedPath)).not.toMatch(/^\.\./);
			expect(
				await readFile(path.join(localizedPath, "extra.json"), "utf8")
			).toBe('{"animation":true}\n');
		} finally {
			await rm(root, { recursive: true, force: true });
			if (copiedPackage) {
				await rm(path.dirname(copiedPackage), {
					recursive: true,
					force: true,
				});
			}
		}
	});
});
