import { describe, expect, it } from "vitest";
import { FILTER_PRESETS } from "@/lib/filters/filter-registry";
import {
	FILTER_CATEGORIES,
	filterPresetMatchesCategory,
	type FilterCategoryId,
} from "../filter-categories";

const referenceCategoryIds: FilterCategoryId[] = [
	"summer",
	"portrait",
	"landscape",
	"food",
	"camera",
	"latest",
	"night",
	"cinematic",
	"outdoor",
	"stylized",
	"monochrome",
	"hd",
	"film",
	"basic",
	"indoor",
];

describe("filter categories", () => {
	it("exposes every category from the reference library", () => {
		const ids = new Set(FILTER_CATEGORIES.map((category) => category.id));
		for (const categoryId of referenceCategoryIds) {
			expect(ids.has(categoryId)).toBe(true);
		}
	});

	it("keeps Latest as a populated cross-category collection", () => {
		const latest = FILTER_PRESETS.filter((preset) =>
			filterPresetMatchesCategory({ preset, category: "latest" })
		);
		expect(latest.length).toBeGreaterThanOrEqual(8);
		expect(
			new Set(latest.map((preset) => preset.category)).size
		).toBeGreaterThan(4);
	});

	it("matches every preset for the all category", () => {
		for (const preset of FILTER_PRESETS) {
			expect(filterPresetMatchesCategory({ preset, category: "all" })).toBe(
				true
			);
		}
	});

	it("never matches built-in presets for the mine category", () => {
		for (const preset of FILTER_PRESETS) {
			expect(filterPresetMatchesCategory({ preset, category: "mine" })).toBe(
				false
			);
		}
	});

	it("matches concrete categories by the preset category field", () => {
		const summerPreset = FILTER_PRESETS.find(
			(preset) => preset.category === "summer"
		);
		expect(summerPreset).toBeDefined();
		if (!summerPreset) return;
		expect(
			filterPresetMatchesCategory({ preset: summerPreset, category: "summer" })
		).toBe(true);
		expect(
			filterPresetMatchesCategory({ preset: summerPreset, category: "night" })
		).toBe(false);
	});
});
