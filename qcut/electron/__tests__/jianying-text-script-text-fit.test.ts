import { describe, expect, it } from "vitest";
import { fitJianyingScriptTextWidget } from "../jianying-text-runtime/script-text-fit.js";

describe("Jianying script text fitting", () => {
	it("shrinks a CJK widget when edited text exceeds its original slot width", () => {
		const widget = { scale: [2.5, 2.5, 1] };
		expect(
			fitJianyingScriptTextWidget({
				widget,
				originalRichText: "<style>[整活]</style>",
				editedRichText: "<style>[签名通过]</style>",
			})
		).toBe(0.5);
		expect(widget.scale).toEqual([1.25, 1.25, 1]);
	});

	it("fits additional lines without changing the character aspect ratio", () => {
		const widget = { scale: [2, 3, 1] };
		expect(
			fitJianyingScriptTextWidget({
				widget,
				originalRichText: "[AB]",
				editedRichText: "[AB\nCD]",
			})
		).toBe(0.5);
		expect(widget.scale).toEqual([1, 1.5, 1]);
	});

	it("uses grapheme width and never enlarges shorter replacement text", () => {
		const emojiWidget = { scale: [2, 2, 1] };
		expect(
			fitJianyingScriptTextWidget({
				widget: emojiWidget,
				originalRichText: "[😀]",
				editedRichText: "[👨‍👩‍👧‍👦👨‍👩‍👧‍👦]",
			})
		).toBe(0.5);
		expect(emojiWidget.scale).toEqual([1, 1, 1]);

		const shorterWidget = { scale: [2, 2, 1] };
		expect(
			fitJianyingScriptTextWidget({
				widget: shorterWidget,
				originalRichText: "[签名通过]",
				editedRichText: "[通过]",
			})
		).toBe(1);
		expect(shorterWidget.scale).toEqual([2, 2, 1]);
	});

	it("counts joined emoji and flags as one visual unit", () => {
		const widget = { scale: [2, 2, 1] };
		expect(
			fitJianyingScriptTextWidget({
				widget,
				originalRichText: "[😀]",
				editedRichText: "[🇦🇺]",
			})
		).toBe(1);
		expect(widget.scale).toEqual([2, 2, 1]);
	});

	it("leaves templates without numeric scale metadata unchanged", () => {
		const widget = { position: [0, 0, 0] };
		expect(
			fitJianyingScriptTextWidget({
				widget,
				originalRichText: "[整活]",
				editedRichText: "[签名通过]",
			})
		).toBe(1);
		expect(widget).toEqual({ position: [0, 0, 0] });
	});
});
