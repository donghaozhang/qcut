import { describe, expect, it } from "vitest";
import {
	inspectLoadedFontGlyphCoverage,
	type FontGlyphLookup,
} from "../font-glyph-coverage.js";

function createFont({
	supportedCodePoints,
}: {
	supportedCodePoints: number[];
}): FontGlyphLookup {
	const supported = new Set(supportedCodePoints);
	return {
		familyName: "QCut Test Sans",
		fullName: "QCut Test Sans Regular",
		hasGlyphForCodePoint: (codePoint) => supported.has(codePoint),
		postscriptName: "QCutTestSans-Regular",
	};
}

describe("font glyph coverage", () => {
	it("checks Unicode scalars instead of UTF-16 code units", () => {
		const report = inspectLoadedFontGlyphCoverage({
			font: createFont({
				supportedCodePoints: [0x526a, 0x6620, 0x1f3ac],
			}),
			fontPath: "/fonts/qcut-test.ttf",
			text: "剪映🎬",
		});

		expect(report.missing).toEqual([]);
		expect(report).toMatchObject({
			familyName: "QCut Test Sans",
			postscriptName: "QCutTestSans-Regular",
			text: "剪映🎬",
		});
	});

	it("reports every missing character with its scalar index and Unicode label", () => {
		const report = inspectLoadedFontGlyphCoverage({
			font: createFont({
				supportedCodePoints: [0x526a, 0x6620, 0x771f, 0x5165],
			}),
			fontPath: "/fonts/incomplete-cjk.ttf",
			text: "剪映真实导入测试",
		});

		expect(report.missing).toEqual([
			{ character: "实", codePoint: 0x5b9e, index: 3, unicode: "U+5B9E" },
			{ character: "导", codePoint: 0x5bfc, index: 4, unicode: "U+5BFC" },
			{ character: "测", codePoint: 0x6d4b, index: 6, unicode: "U+6D4B" },
			{ character: "试", codePoint: 0x8bd5, index: 7, unicode: "U+8BD5" },
		]);
	});
});
