import { describe, expect, it } from "vitest";

import {
	composePortraitPrompt,
	type PortraitAttributes,
} from "../character.js";

const MIN_ATTRS: PortraitAttributes = {
	age: "early 20s",
	gender: "female",
	hair: "long dark hair",
	expression: "calm",
	clothing: "white gown",
};

describe("composePortraitPrompt", () => {
	it("always emits the framing prefix, even with a custom style", () => {
		// Regression: previously `style` replaced the framing clause, so
		// a drama-style string made the model wander into editorial
		// scenes / diptychs. Framing must stay present.
		const out = composePortraitPrompt(MIN_ATTRS, {
			style: "真人写实, 电视风格, 暖色调",
		});
		expect(out.startsWith("front portrait")).toBe(true);
		expect(out).toContain("single subject");
		expect(out).toContain("真人写实, 电视风格, 暖色调");
	});

	it("always emits the quality suffix, even with a custom style", () => {
		// Regression: the suffix was dropped when a custom style was
		// supplied, so prompts lost "plain background" guidance.
		const out = composePortraitPrompt(MIN_ATTRS, {
			style: "Modern anime film, soft cel-shading",
		});
		expect(out).toContain("plain background");
		expect(out).toContain("sharp focus");
	});

	it("falls back to photorealistic aesthetic when no style is given", () => {
		const out = composePortraitPrompt(MIN_ATTRS);
		expect(out.startsWith("front portrait")).toBe(true);
		expect(out).toContain("photorealistic");
		expect(out).toContain("plain background");
	});

	it("builds the subject descriptor with ethnicity when present", () => {
		const out = composePortraitPrompt(
			{ ...MIN_ATTRS, ethnicity: "East Asian" },
			{ style: "cinematic" }
		);
		expect(out).toContain("East Asian");
		expect(out).toContain("female");
	});

	it("skips ethnicity in the subject descriptor when empty", () => {
		const out = composePortraitPrompt(MIN_ATTRS);
		// Subject descriptor should be "early 20s female" — ethnicity
		// missing, so no dangling "undefined" or double comma.
		expect(out).not.toContain("undefined");
		expect(out).not.toMatch(/,\s*,/);
	});

	it("includes clothing prefixed with 'wearing'", () => {
		const out = composePortraitPrompt({
			...MIN_ATTRS,
			clothing: "a white silk gown",
		});
		expect(out).toContain("wearing a white silk gown");
	});

	it("ends with the quality suffix when style is provided", () => {
		const out = composePortraitPrompt(MIN_ATTRS, {
			style: "Modern anime film",
		});
		// Quality suffix sits at the tail of the prompt after the
		// subject descriptor.
		const tail = out.slice(out.length - 50);
		expect(tail).toContain("2K");
	});
});
