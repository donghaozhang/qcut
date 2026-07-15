import { describe, expect, it } from "vitest";
import {
	buildAIStickerPrompt,
	validateAIStickerPrompt,
} from "../ai-sticker-prompt";

describe("AI sticker prompt helpers", () => {
	it("validates prompt length boundaries", () => {
		expect(validateAIStickerPrompt({ prompt: " A " })).toBe(
			"请输入至少 2 个字符"
		);
		expect(validateAIStickerPrompt({ prompt: "ok" })).toBeNull();
		expect(validateAIStickerPrompt({ prompt: "x".repeat(501) })).toBe(
			"提示词不能超过 500 个字符"
		);
	});

	it("builds production sticker prompts with background instructions", () => {
		expect(
			buildAIStickerPrompt({
				prompt: "  cute summer badge  ",
				transparentBackground: true,
			})
		).toContain("fully transparent alpha background");
		expect(
			buildAIStickerPrompt({
				prompt: "cute summer badge",
				transparentBackground: false,
			})
		).toContain("clean solid background");
	});
});
