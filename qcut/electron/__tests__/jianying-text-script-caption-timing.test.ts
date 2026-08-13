import { describe, expect, it } from "vitest";
import {
	createJianyingCaptionDurationInfo,
	injectJianyingCaptionTiming,
} from "../jianying-text-runtime/script-caption-timing.js";
import { editJianyingScriptContent } from "../jianying-text-runtime/script-package-editor.js";

describe("Jianying script caption timing", () => {
	it("generates deterministic grapheme timing and preserves separators", () => {
		const result = createJianyingCaptionDurationInfo({
			text: "花 👨‍👩‍👧‍👦\n字",
			durationSeconds: 3,
		});

		expect(result.words).toEqual([
			{ start_time: 0, end_time: 1000, text: "花" },
			{ start_time: 1000, end_time: 1000, text: " " },
			{ start_time: 1000, end_time: 2000, text: "👨‍👩‍👧‍👦" },
			{ start_time: 2000, end_time: 2000, text: "\n" },
			{ start_time: 2000, end_time: 3000, text: "字" },
		]);
		expect(result.words.map(({ text }) => text).join("")).toBe(result.text);
	});

	it("injects timing only into caption animation widgets", () => {
		const captionWidget: Record<string, unknown> = {
			start_time: 0.5,
			duration: 5,
			anims: [{ anim_type: "caption" }],
			text_params: {},
		};
		const ordinaryWidget: Record<string, unknown> = {
			anims: [{ anim_type: "loop" }],
			text_params: {},
		};

		expect(
			injectJianyingCaptionTiming({
				widget: captionWidget,
				text: "动态",
				templateDuration: 2,
			})
		).toBe(true);
		expect(captionWidget).toMatchObject({
			text_params: {
				caption_duration_info: {
					text: "动态",
					words: [
						{ start_time: 0, end_time: 750, text: "动" },
						{ start_time: 750, end_time: 1500, text: "态" },
					],
				},
			},
		});
		expect(
			injectJianyingCaptionTiming({
				widget: ordinaryWidget,
				text: "静态",
				templateDuration: 2,
			})
		).toBe(false);
		expect(ordinaryWidget).toEqual({
			anims: [{ anim_type: "loop" }],
			text_params: {},
		});
	});

	it("adds caption timing while editing a real ScriptTemplate-shaped payload", () => {
		const result = editJianyingScriptContent({
			content: "花😀",
			value: {
				root: { duration: 2 },
				children: [
					{
						type: "text",
						duration: 2.5,
						anims: [
							{
								anim_type: "caption",
								anim_resource_id: "7595489171007966491",
							},
						],
						text_params: { richText: "<size=12>[原文]</size>" },
					},
				],
			},
		});

		expect(result.value).toMatchObject({
			children: [
				{
					text_params: {
						richText: "<size=12>[花😀]</size>",
						caption_duration_info: {
							text: "花😀",
							words: [
								{ start_time: 0, end_time: 1000, text: "花" },
								{ start_time: 1000, end_time: 2000, text: "😀" },
							],
						},
					},
				},
			],
		});
	});
});
