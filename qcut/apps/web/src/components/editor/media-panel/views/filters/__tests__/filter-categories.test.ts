import { describe, expect, it } from "vitest";
import { FILTER_PRESETS } from "@/lib/filters/filter-registry";
import {
	FILTER_CATEGORIES,
	filterPresetMatchesCategory,
} from "../filter-categories";

const referenceCategoryIds = [
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
});
