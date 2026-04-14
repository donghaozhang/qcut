import { describe, expect, it } from "vitest";

import {
	detectRegion,
	parseRegion,
	regionDefaultEthnicity,
} from "../region-detection.js";

describe("parseRegion", () => {
	it("maps known slugs to the union", () => {
		expect(parseRegion("east-asian")).toBe("east-asian");
		expect(parseRegion("EAST-ASIAN")).toBe("east-asian");
		expect(parseRegion(" european ")).toBe("european");
	});

	it("returns undefined for blank or unknown input", () => {
		expect(parseRegion(undefined)).toBeUndefined();
		expect(parseRegion("")).toBeUndefined();
		expect(parseRegion("atlantis")).toBeUndefined();
	});
});

describe("regionDefaultEthnicity", () => {
	it("returns readable descriptors for each region", () => {
		expect(regionDefaultEthnicity("east-asian")).toBe("East Asian");
		expect(regionDefaultEthnicity("european")).toBe("European");
		expect(regionDefaultEthnicity("middle-eastern")).toBe("Middle Eastern");
	});

	it("returns empty string for mixed (no single default)", () => {
		expect(regionDefaultEthnicity("mixed")).toBe("");
	});
});

describe("detectRegion", () => {
	it("identifies Chinese CJK content as east-asian", () => {
		const novel = "沈念安走进宴会厅，她的未婚夫顾承泽正在等她。".repeat(30);
		expect(detectRegion(novel)).toBe("east-asian");
	});

	it("identifies Japanese kana content as east-asian", () => {
		const novel = "ひらがなとカタカナの物語。主人公は東京に住んでいる。".repeat(
			30
		);
		expect(detectRegion(novel)).toBe("east-asian");
	});

	it("identifies Korean hangul content as east-asian", () => {
		const novel = "서울에서 시작되는 이야기. 주인공은 대학생이다.".repeat(30);
		expect(detectRegion(novel)).toBe("east-asian");
	});

	it("identifies Arabic content as middle-eastern", () => {
		const novel = "في يوم من الأيام، كانت هناك قصة جميلة.".repeat(30);
		expect(detectRegion(novel)).toBe("middle-eastern");
	});

	it("identifies Devanagari content as south-asian", () => {
		const novel = "यह एक कहानी है जो हमारे नायक के बारे में है।".repeat(30);
		expect(detectRegion(novel)).toBe("south-asian");
	});

	it("identifies Cyrillic content as european", () => {
		const novel =
			"Это история о молодом человеке, который жил в Москве.".repeat(30);
		expect(detectRegion(novel)).toBe("european");
	});

	it("returns undefined for pure English text (too ambiguous to guess)", () => {
		const novel =
			"Alice walked into the grand ballroom where her fiance was waiting.".repeat(
				50
			);
		expect(detectRegion(novel)).toBeUndefined();
	});

	it("returns undefined below the 3% noise floor", () => {
		// Mostly English with a single Chinese name — the name shouldn't
		// force the whole cast to east-asian.
		const novel = "Alice walked into the grand ballroom. ".repeat(500) + "某某";
		expect(detectRegion(novel)).toBeUndefined();
	});

	it("prefers strongest script when multiple are present", () => {
		// Heavy Chinese + trace Cyrillic — should still pick east-asian.
		const novel = "沈念安走进宴会厅".repeat(50) + " Москва";
		expect(detectRegion(novel)).toBe("east-asian");
	});

	it("returns undefined for empty / whitespace-only text", () => {
		expect(detectRegion("")).toBeUndefined();
		expect(detectRegion("   \n\n   ")).toBeUndefined();
	});

	it("uses the style header as an additional signal", () => {
		// Pure Latin names but a Chinese Visual Style header should still
		// flag east-asian — the header is the authoritative setting cue.
		// Long novel text pads the CJK ratio to clear the 3% floor.
		const novel = "Alice was a drama student.".repeat(5);
		const header = "真人写实, 电视风格, 暖色调";
		expect(detectRegion(novel, header)).toBe("east-asian");
	});
});
