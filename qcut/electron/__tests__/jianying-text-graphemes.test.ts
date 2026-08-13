import { describe, expect, it } from "vitest";
import { splitJianyingTextGraphemes } from "../jianying-text-runtime/graphemes.js";

const EXPECTED_GRAPHEMES = [
	"A",
	"e\u0301",
	"👨‍👩‍👧‍👦",
	"👍🏽",
	"🇦🇺",
	"1️⃣",
	"\r\n",
	"中",
];

describe("Jianying text graphemes", () => {
	it("keeps joined Unicode sequences intact with Intl segmentation", () => {
		expect(
			splitJianyingTextGraphemes({
				text: EXPECTED_GRAPHEMES.join(""),
			})
		).toEqual(EXPECTED_GRAPHEMES);
	});

	it("keeps joined Unicode sequences intact in the deterministic fallback", () => {
		expect(
			splitJianyingTextGraphemes({
				text: EXPECTED_GRAPHEMES.join(""),
				forceFallback: true,
			})
		).toEqual(EXPECTED_GRAPHEMES);
	});
});
