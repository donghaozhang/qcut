import { describe, expect, it } from "vitest";

import { composeStylePrefix } from "../portrait-prefix-composer.js";

describe("composeStylePrefix", () => {
	it("returns style verbatim when level is natural (or omitted)", () => {
		expect(
			composeStylePrefix({
				style: "Modern anime film, soft cel-shading, expressive eyes",
				castQuality: "natural",
				gender: "female",
			})
		).toBe("Modern anime film, soft cel-shading, expressive eyes");

		expect(
			composeStylePrefix({
				style: "Modern anime film, soft cel-shading, expressive eyes",
			})
		).toBe("Modern anime film, soft cel-shading, expressive eyes");
	});

	it("prepends the photogenic snippet in gender-specific form", () => {
		const male = composeStylePrefix({
			style: "Modern anime film",
			castQuality: "photogenic",
			gender: "male",
		});
		const female = composeStylePrefix({
			style: "Modern anime film",
			castQuality: "photogenic",
			gender: "female",
		});
		expect(male.startsWith("photogenic")).toBe(true);
		expect(female.startsWith("photogenic")).toBe(true);
		expect(male.endsWith("Modern anime film")).toBe(true);
		expect(male).not.toBe(female);
	});

	it("prepends model-grade with K-pop idol styling for female leads", () => {
		const prefix = composeStylePrefix({
			style: "真人写实, 电视风格, 暖色调",
			castQuality: "model-grade",
			gender: "female",
		});
		expect(prefix).toMatch(/K-pop|idol/i);
		expect(prefix).toContain("真人写实, 电视风格, 暖色调");
	});

	it("works with only a style (no cast quality)", () => {
		expect(composeStylePrefix({ style: "Modern anime film" })).toBe(
			"Modern anime film"
		);
	});

	it("works with only a snippet (no style)", () => {
		const prefix = composeStylePrefix({
			castQuality: "photogenic",
			gender: "male",
		});
		expect(prefix).toMatch(/photogenic/);
	});

	it("returns empty when both style and snippet are empty", () => {
		expect(composeStylePrefix({})).toBe("");
		expect(composeStylePrefix({ style: "   ", castQuality: "natural" })).toBe(
			""
		);
	});

	it("defaults to unknown gender when not provided", () => {
		// Should still produce a non-empty output for non-natural levels.
		const prefix = composeStylePrefix({
			style: "Modern anime film",
			castQuality: "model-grade",
		});
		// Anchors with `cinematic portrait` (the quality signal after
		// `editorial` was dropped in the 2026-04-15 fix).
		expect(prefix).toMatch(/cinematic portrait/i);
	});
});
