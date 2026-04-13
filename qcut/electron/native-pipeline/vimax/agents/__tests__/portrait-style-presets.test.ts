import { describe, it, expect } from "vitest";
import {
	PORTRAIT_STYLE_PRESETS,
	findPortraitStylePreset,
	resolvePortraitStyle,
	listPortraitStyleSlugs,
	rewritePortraitPromptStyle,
} from "../portrait-style-presets";

describe("PORTRAIT_STYLE_PRESETS", () => {
	it("contains exactly 8 presets", () => {
		expect(PORTRAIT_STYLE_PRESETS).toHaveLength(8);
	});

	it("every slug is lowercase ASCII kebab-case", () => {
		for (const preset of PORTRAIT_STYLE_PRESETS) {
			expect(preset.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		}
	});

	it("every prompt is ≤ 10 words and ≤ ~120 chars", () => {
		for (const preset of PORTRAIT_STYLE_PRESETS) {
			// Count both comma-separated phrases and whitespace-separated tokens
			const phrases = preset.prompt.split(/[,，]/);
			expect(phrases.length, `${preset.slug} phrases`).toBeLessThanOrEqual(10);
			expect(preset.prompt.length, `${preset.slug} char length`).toBeLessThan(
				120
			);
		}
	});

	it("every preset has both language labels", () => {
		for (const preset of PORTRAIT_STYLE_PRESETS) {
			expect(preset.label_en.length).toBeGreaterThan(0);
			expect(preset.label_zh.length).toBeGreaterThan(0);
		}
	});
});

describe("findPortraitStylePreset", () => {
	it("returns undefined for empty/undefined input", () => {
		expect(findPortraitStylePreset(undefined)).toBeUndefined();
		expect(findPortraitStylePreset("")).toBeUndefined();
		expect(findPortraitStylePreset("   ")).toBeUndefined();
	});

	it("matches a known slug exactly", () => {
		const p = findPortraitStylePreset("anime");
		expect(p?.slug).toBe("anime");
	});

	it("is case-insensitive and trims whitespace", () => {
		expect(findPortraitStylePreset("ANIME")?.slug).toBe("anime");
		expect(findPortraitStylePreset("  Photorealistic  ")?.slug).toBe(
			"photorealistic"
		);
	});

	it("returns undefined for an unknown slug", () => {
		expect(findPortraitStylePreset("not-a-real-style")).toBeUndefined();
	});
});

describe("resolvePortraitStyle", () => {
	it("expands a preset slug to its prompt", () => {
		expect(resolvePortraitStyle("anime")).toContain("Modern anime film");
		expect(resolvePortraitStyle("photorealistic")).toContain("真人写实");
	});

	it("passes free-form text through unchanged", () => {
		expect(
			resolvePortraitStyle("neon pastel, soft gradient, 2.5D")
		).toBe("neon pastel, soft gradient, 2.5D");
	});

	it("prefers styleInput over fallback when non-empty", () => {
		expect(resolvePortraitStyle("anime", "some fallback")).toContain(
			"Modern anime film"
		);
	});

	it("falls back when styleInput is missing or empty", () => {
		expect(resolvePortraitStyle(undefined, "fallback style")).toBe(
			"fallback style"
		);
		expect(resolvePortraitStyle("", "fallback style")).toBe("fallback style");
		expect(resolvePortraitStyle("   ", "fallback style")).toBe(
			"fallback style"
		);
	});

	it("returns undefined when both inputs are empty", () => {
		expect(resolvePortraitStyle(undefined, undefined)).toBeUndefined();
		expect(resolvePortraitStyle("", "")).toBeUndefined();
	});
});

describe("rewritePortraitPromptStyle", () => {
	const baked =
		"真人写实, 电视风格, 暖色调, early 20s female, long dark hair, pale skin";

	it("returns prompt unchanged when newStyle is missing", () => {
		expect(rewritePortraitPromptStyle(baked, "真人写实, 电视风格, 暖色调", undefined)).toBe(
			baked
		);
		expect(rewritePortraitPromptStyle(baked, "真人写实, 电视风格, 暖色调", "")).toBe(
			baked
		);
	});

	it("returns prompt unchanged when oldStyle equals newStyle", () => {
		expect(
			rewritePortraitPromptStyle(baked, "真人写实, 电视风格, 暖色调", "真人写实, 电视风格, 暖色调")
		).toBe(baked);
	});

	it("swaps a known leading style prefix for the new one", () => {
		const out = rewritePortraitPromptStyle(
			baked,
			"真人写实, 电视风格, 暖色调",
			"Modern anime film, soft cel-shading, expressive eyes, cinematic light"
		);
		expect(out).toBe(
			"Modern anime film, soft cel-shading, expressive eyes, cinematic light, early 20s female, long dark hair, pale skin"
		);
	});

	it("prepends newStyle when prompt does not start with oldStyle", () => {
		const out = rewritePortraitPromptStyle(
			"some other prefix, character description",
			"unrelated old style",
			"anime"
		);
		expect(out).toBe("anime, some other prefix, character description");
	});

	it("prepends newStyle when oldStyle is missing", () => {
		const out = rewritePortraitPromptStyle(
			"character description only",
			undefined,
			"anime"
		);
		expect(out).toBe("anime, character description only");
	});
});

describe("listPortraitStyleSlugs", () => {
	it("returns a pipe-separated string of every slug", () => {
		const list = listPortraitStyleSlugs();
		expect(list).toContain("anime");
		expect(list).toContain("photorealistic");
		expect(list).toContain("chinese-ink");
		expect(list.split("|")).toHaveLength(PORTRAIT_STYLE_PRESETS.length);
	});
});
