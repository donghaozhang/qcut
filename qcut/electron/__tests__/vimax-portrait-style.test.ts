/**
 * Unit tests for portrait style plumbing.
 *
 * Covers the fix from this session — the pipeline used to bury every
 * portrait in a hardcoded "LinkedIn headshot" template that stripped the
 * novel's visual style and any non-Western ethnicity. These tests lock
 * in the new behaviour: novel headers + --style flag drive the actual
 * prompt, and ethnicity is preserved.
 */

import { describe, expect, it } from "vitest";
import { composePortraitPrompt } from "../native-pipeline/vimax/types/character.js";
import { extractNovelStyleHeader } from "../native-pipeline/cli/vimax-cli-handlers/pipeline-handlers.js";

// ---------------------------------------------------------------------------
// composePortraitPrompt — default behaviour (back-compat)
// ---------------------------------------------------------------------------

describe("composePortraitPrompt (default style, back-compat)", () => {
	it("prefixes with the original photorealistic wrapper when no style is given", () => {
		const prompt = composePortraitPrompt({
			age: "30",
			gender: "female",
			hair: "long black hair",
			expression: "calm",
			clothing: "black dress",
		});
		// Both the prefix and suffix must appear so existing deployments
		// keep producing the same portraits they did before the refactor.
		expect(prompt.startsWith("photorealistic front portrait")).toBe(true);
		expect(prompt).toContain(
			"plain white background, soft studio lighting, sharp focus, high detail, 2K"
		);
	});

	it("still handles the no-ethnicity path without inserting the word 'undefined'", () => {
		const prompt = composePortraitPrompt({
			age: "30",
			gender: "female",
			hair: "long black hair",
			expression: "calm",
			clothing: "black dress",
		});
		expect(prompt).not.toContain("undefined");
	});
});

// ---------------------------------------------------------------------------
// composePortraitPrompt — style override (fix)
// ---------------------------------------------------------------------------

describe("composePortraitPrompt (custom style)", () => {
	const base = {
		age: "late twenties",
		gender: "female",
		ethnicity: "Japanese",
		hair: "bob cut caramel brown",
		expression: "confident",
		clothing: "tailored charcoal blazer",
		accessories: "stylish glasses",
	};
	const style = "Japanese TV drama, natural light, muted palette";

	it("replaces the default LinkedIn wrapper with the caller's style", () => {
		const prompt = composePortraitPrompt(base, { style });
		expect(prompt.startsWith(style)).toBe(true);
		// Old LinkedIn-style hints must NOT leak through when a custom style
		// is requested.
		expect(prompt).not.toContain("plain white background");
		expect(prompt).not.toContain("soft studio lighting");
		expect(prompt).not.toContain("shot on professional camera");
	});

	it("preserves ethnicity in the subject descriptor", () => {
		const prompt = composePortraitPrompt(base, { style });
		expect(prompt).toContain("late twenties Japanese female");
	});

	it("ignores an empty/whitespace style (falls back to default)", () => {
		const prompt = composePortraitPrompt(base, { style: "   " });
		expect(prompt.startsWith("photorealistic front portrait")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// extractNovelStyleHeader — header parsing
// ---------------------------------------------------------------------------

describe("extractNovelStyleHeader", () => {
	it("extracts the Japanese 画像スタイル line", () => {
		const novel = `# 東京、九月の約束
**映像スタイル：** 日本のテレビドラマ風
**画像スタイル：** Japanese TV drama aesthetic, soft natural lighting
**アスペクト比：** 16:9

---

本文ここから...`;
		expect(extractNovelStyleHeader(novel)).toBe("日本のテレビドラマ風");
	});

	it("extracts the Simplified Chinese 视频风格 line", () => {
		const novel = `# 从弃女到巅峰
**视频风格：** 真人写实, 电视风格, 暖色调
**画面比例：** 16:9`;
		expect(extractNovelStyleHeader(novel)).toBe("真人写实, 电视风格, 暖色调");
	});

	it("extracts the English Image Style line", () => {
		const novel = `# Some Novel
**Image Style:** gritty noir, deep shadows, 35mm film grain
**Aspect:** 16:9`;
		expect(extractNovelStyleHeader(novel)).toBe(
			"gritty noir, deep shadows, 35mm film grain"
		);
	});

	it("prefers 画像スタイル over 映像スタイル when both exist (first match wins)", () => {
		// The JP regex matches both; whichever appears first in the text wins.
		const novel = `**画像スタイル：** first-line style
**映像スタイル：** second-line style`;
		expect(extractNovelStyleHeader(novel)).toBe("first-line style");
	});

	it("returns undefined when no recognised style line is present", () => {
		const novel = `# A Novel
Some content without a style declaration.`;
		expect(extractNovelStyleHeader(novel)).toBeUndefined();
	});

	it("only scans the first 2000 characters (not the body)", () => {
		const filler = "x".repeat(2_500);
		const novel = `# Novel\n${filler}\n**Image Style:** should-not-be-seen`;
		expect(extractNovelStyleHeader(novel)).toBeUndefined();
	});
});
