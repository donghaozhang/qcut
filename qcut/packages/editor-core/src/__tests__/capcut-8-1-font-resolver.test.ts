import { describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_APP_VERSION,
	CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS,
	CAPCUT_8_1_VERIFIED_HAN_RANGES,
	resolveCapCut81Font,
} from "../jianying-draft/index.js";

function resolveFont({
	appVersion = CAPCUT_8_1_APP_VERSION,
	content = "剪映真实导入测试 ABC123",
	fontRuns,
	requestedFamily,
	targetPlatform = "macos",
}: {
	appVersion?: string;
	content?: string;
	fontRuns?: readonly { end: number; family: string; start: number }[];
	requestedFamily?: string;
	targetPlatform?: "macos" | "windows";
} = {}) {
	return resolveCapCut81Font({
		appVersion,
		content,
		fontRuns,
		requestedFamily,
		targetPlatform,
	});
}

describe("CapCut 8.1 font resolver", () => {
	it("resolves the verified macOS system default without serializing font fields", () => {
		const resolution = resolveFont();

		expect(resolution).toEqual({
			appVersion: CAPCUT_8_1_APP_VERSION,
			coverage: {
				emoji: false,
				systemFallbackAllowlist: [
					"latin",
					"verified-bmp-han",
					"common",
					"inherited",
				],
				verifiedHanRanges: CAPCUT_8_1_VERIFIED_HAN_RANGES,
				verifiedScripts: ["latin", "simplified-chinese"],
			},
			draftFields: CAPCUT_8_1_SYSTEM_DEFAULT_FONT_DRAFT_FIELDS,
			kind: "system-default",
			ok: true,
			requestedFamily: null,
			resolvedFamily: "system",
			targetPlatform: "macos",
			warnings: [],
		});
	});

	it("allows only the conservative system-fallback script range", () => {
		const resolution = resolveFont({ content: "A剪 1\u0301" });

		expect(resolution.ok).toBe(true);
	});

	it.each([
		{ character: "\u4db6", unicode: "U+4DB6" },
		{ character: "\u9fd1", unicode: "U+9FD1" },
		{ character: "\uf900", unicode: "U+F900" },
	])("blocks a Han code point outside verified cmap ranges: $unicode", ({
		character,
		unicode,
	}) => {
		const resolution = resolveFont({ content: character });

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors).toContainEqual(
			expect.objectContaining({
				code: "UNVERIFIED_CAPCUT_TEXT_SCRIPT",
				message: expect.stringContaining(unicode),
			})
		);
	});

	it.each(["\u4db5", "\u9fd0"])(
		"accepts a Han code point at a verified cmap boundary: %s",
		(character) => {
			expect(resolveFont({ content: character }).ok).toBe(true);
		}
	);

	it("treats an explicit system request as the verified default", () => {
		const resolution = resolveFont({ requestedFamily: " System " });

		expect(resolution.ok).toBe(true);
		if (!resolution.ok) return;
		expect(resolution.requestedFamily).toBe("System");
		expect(resolution.warnings).toEqual([]);
	});

	it("reports that the legacy Arial default is substituted", () => {
		const resolution = resolveFont({ requestedFamily: "Arial" });

		expect(resolution.ok).toBe(true);
		if (!resolution.ok) return;
		expect(resolution.resolvedFamily).toBe("system");
		expect(resolution.warnings).toEqual([
			{
				code: "CAPCUT_FONT_FAMILY_SUBSTITUTED",
				message:
					"Arial is not preserved by the verified CapCut 8.1 export path; CapCut substitutes its system-default font stack.",
				requestedFamily: "Arial",
				resolvedFamily: "system",
				severity: "warning",
			},
		]);
	});

	it("blocks an explicit font family without a reference mapping", () => {
		const resolution = resolveFont({ requestedFamily: "Inter" });

		expect(resolution).toEqual({
			errors: [
				{
					code: "UNVERIFIED_CAPCUT_EXPLICIT_FONT",
					message: "Font family Inter has no verified CapCut 8.1 mapping.",
					severity: "error",
				},
			],
			kind: "unsupported",
			ok: false,
		});
	});

	it.each([
		{
			code: "UNSUPPORTED_CAPCUT_FONT_PLATFORM",
			overrides: { targetPlatform: "windows" as const },
		},
		{
			code: "UNSUPPORTED_CAPCUT_FONT_VERSION",
			overrides: { appVersion: "8.2.0" },
		},
	])("blocks an unverified platform or version: $code", ({
		code,
		overrides,
	}) => {
		const resolution = resolveFont(overrides);

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors.map((error) => error.code)).toEqual([code]);
	});

	it("blocks emoji fallback without a verified reference", () => {
		const resolution = resolveFont({ content: "剪映测试 😀" });

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors).toContainEqual({
			code: "UNVERIFIED_CAPCUT_EMOJI_FONT",
			message: "Emoji fallback has no verified CapCut 8.1 reference draft.",
			severity: "error",
		});
	});

	it.each([
		{ character: "Ж", codePoint: "U+0416", content: "Журнал" },
		{ character: "م", codePoint: "U+0645", content: "مرحبا" },
		{ character: "न", codePoint: "U+0928", content: "नमस्ते" },
		{ character: "𠀀", codePoint: "U+20000", content: "𠀀" },
	])("blocks an unverified script beginning with $character", ({
		character,
		codePoint,
		content,
	}) => {
		const resolution = resolveFont({ content });

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors).toContainEqual({
			code: "UNVERIFIED_CAPCUT_TEXT_SCRIPT",
			message: `Character ${JSON.stringify(character)} (${codePoint}) is outside the conservative CapCut 8.1 system-fallback allowlist (Latin, Common, Inherited, and the verified Han ranges ${CAPCUT_8_1_VERIFIED_HAN_RANGES.join(", ")}).`,
			severity: "error",
		});
	});

	it("blocks per-range and multi-font requests", () => {
		const resolution = resolveFont({
			fontRuns: [
				{ end: 2, family: "system", start: 0 },
				{ end: 5, family: "Arial", start: 2 },
			],
		});

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors).toContainEqual({
			code: "UNVERIFIED_CAPCUT_FONT_RUNS",
			message:
				"Per-range and multi-font text have no verified CapCut 8.1 reference draft.",
			severity: "error",
		});
	});

	it("reports every independent blocking reason in one result", () => {
		const resolution = resolveFont({
			appVersion: "9.0.0",
			content: "emoji 🧪",
			fontRuns: [{ end: 8, family: "Inter", start: 0 }],
			requestedFamily: "Inter",
			targetPlatform: "windows",
		});

		expect(resolution.ok).toBe(false);
		if (resolution.ok) return;
		expect(resolution.errors.map((error) => error.code)).toEqual([
			"UNSUPPORTED_CAPCUT_FONT_PLATFORM",
			"UNSUPPORTED_CAPCUT_FONT_VERSION",
			"UNVERIFIED_CAPCUT_FONT_RUNS",
			"UNVERIFIED_CAPCUT_EMOJI_FONT",
			"UNVERIFIED_CAPCUT_EXPLICIT_FONT",
		]);
	});
});
