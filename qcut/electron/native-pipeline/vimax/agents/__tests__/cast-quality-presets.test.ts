import { describe, expect, it } from "vitest";

import {
	castQualitySnippet,
	listCastQualityLevels,
	normalizeCastGender,
	parseCastQuality,
} from "../cast-quality-presets.js";

describe("parseCastQuality", () => {
	it("maps known slugs to the union", () => {
		expect(parseCastQuality("natural")).toBe("natural");
		expect(parseCastQuality("photogenic")).toBe("photogenic");
		expect(parseCastQuality("model-grade")).toBe("model-grade");
		expect(parseCastQuality("PHOTOGENIC")).toBe("photogenic");
	});

	it("returns undefined for unknown or empty input", () => {
		expect(parseCastQuality(undefined)).toBeUndefined();
		expect(parseCastQuality("")).toBeUndefined();
		expect(parseCastQuality("supermodel")).toBeUndefined();
	});
});

describe("normalizeCastGender", () => {
	it("maps English m/f/w prefixes to male/female", () => {
		expect(normalizeCastGender("male")).toBe("male");
		expect(normalizeCastGender("Male")).toBe("male");
		expect(normalizeCastGender("man")).toBe("male");
		expect(normalizeCastGender("female")).toBe("female");
		expect(normalizeCastGender("woman")).toBe("female");
	});

	it("maps Chinese 男 / 女 characters", () => {
		expect(normalizeCastGender("男")).toBe("male");
		expect(normalizeCastGender("女")).toBe("female");
	});

	it("falls back to unknown for blanks / other values", () => {
		expect(normalizeCastGender(undefined)).toBe("unknown");
		expect(normalizeCastGender("")).toBe("unknown");
		expect(normalizeCastGender("non-binary")).toBe("unknown");
	});
});

describe("castQualitySnippet", () => {
	it("returns empty string for natural (no-op)", () => {
		expect(castQualitySnippet("natural", "male")).toBe("");
		expect(castQualitySnippet("natural", "female")).toBe("");
		expect(castQualitySnippet("natural", "unknown")).toBe("");
	});

	it("returns short descriptors for photogenic", () => {
		expect(castQualitySnippet("photogenic", "male")).toContain("photogenic");
		expect(castQualitySnippet("photogenic", "female")).toContain("photogenic");
		// Male and female phrasings differ slightly (features descriptor) —
		// but both are ≤5 tokens to avoid adjective spam.
		const m = castQualitySnippet("photogenic", "male");
		const f = castQualitySnippet("photogenic", "female");
		expect(m).not.toBe(f);
	});

	it("returns stronger descriptors for model-grade, gendered", () => {
		expect(castQualitySnippet("model-grade", "male")).toMatch(/male-model/i);
		expect(castQualitySnippet("model-grade", "female")).toMatch(/K-pop|idol/i);
	});

	it("model-grade unknown gender uses neutral phrasing (no gendered terms)", () => {
		const unknown = castQualitySnippet("model-grade", "unknown");
		expect(unknown).not.toMatch(/male-model/i);
		expect(unknown).not.toMatch(/K-pop/i);
		expect(unknown).toMatch(/refined/i);
	});

	it("model-grade snippets never contain `editorial` (Gemini Image wraps the output in publication UI)", () => {
		// Regression guard for the 2026-04-15 fix where `editorial look`
		// caused nano-banana-pro to render the portrait as a fake
		// Instagram post. "cinematic portrait" replaced it as the
		// quality anchor. If this test fails, re-verify with a Stage 2
		// smoke run before landing.
		for (const gender of ["male", "female", "unknown"] as const) {
			expect(castQualitySnippet("model-grade", gender)).not.toMatch(
				/editorial/i
			);
		}
	});

	it("model-grade snippets end with `cinematic portrait` anchor", () => {
		for (const gender of ["male", "female", "unknown"] as const) {
			expect(castQualitySnippet("model-grade", gender)).toMatch(
				/cinematic portrait$/
			);
		}
	});
});

describe("listCastQualityLevels", () => {
	it("lists all three levels", () => {
		const list = listCastQualityLevels();
		expect(list).toContain("natural");
		expect(list).toContain("photogenic");
		expect(list).toContain("model-grade");
	});
});
