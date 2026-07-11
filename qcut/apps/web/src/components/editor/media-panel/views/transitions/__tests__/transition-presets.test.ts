import { describe, expect, it } from "vitest";
import { filterTransitionPresets } from "../transition-presets";

describe("transition presets", () => {
	it("filters by category", () => {
		const result = filterTransitionPresets({ category: "slide", query: "" });

		expect(result.map((preset) => preset.id)).toEqual([
			"slide-left",
			"slide-right",
		]);
	});

	it("treats basic as immediately usable presets", () => {
		const result = filterTransitionPresets({ category: "basic", query: "" });

		expect(result.map((preset) => preset.id)).toEqual(
			expect.arrayContaining(["dissolve", "fade-to-black"])
		);
	});

	it("searches names, descriptions, types, categories, and tags", () => {
		const result = filterTransitionPresets({
			category: "all",
			query: "rgb",
		});

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("glitch-shift");
	});
});
