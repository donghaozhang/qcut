import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	FILTER_PRESETS,
	getFilterPreset,
	getFilterPresetsByCategory,
} from "../filter-registry";
import type { FilterCategory } from "../filter-types";

const categories: FilterCategory[] = [
	"basic",
	"summer",
	"landscape",
	"food",
	"camera",
	"night",
	"cinematic",
	"outdoor",
	"stylized",
	"film",
	"monochrome",
	"portrait",
	"hd",
	"indoor",
];

describe("filter registry", () => {
	it("ships a populated local library with stable unique identifiers", () => {
		expect(FILTER_PRESETS).toHaveLength(36);
		expect(new Set(FILTER_PRESETS.map((preset) => preset.id)).size).toBe(36);
		expect(
			new Set(FILTER_PRESETS.map((preset) => preset.lutAssetId)).size
		).toBe(36);
	});

	it("provides at least two working presets in every filter category", () => {
		for (const category of categories) {
			expect(
				getFilterPresetsByCategory({ category }).length
			).toBeGreaterThanOrEqual(2);
		}
	});

	it("keeps cinematic and night looks in their intended collections", () => {
		expect(getFilterPreset({ presetId: "teal-gold" })?.category).toBe(
			"cinematic"
		);
		expect(getFilterPreset({ presetId: "night-blue" })?.category).toBe("night");
	});

	it("keeps every preset local and searchable in both languages", () => {
		for (const preset of FILTER_PRESETS) {
			expect(preset.thumbnail).toMatch(/^\/images\/filter-previews\/.+\.webp$/);
			expect(
				existsSync(
					resolve(__dirname, "../../../../public", preset.thumbnail.slice(1))
				)
			).toBe(true);
			expect(preset.tags.length).toBeGreaterThanOrEqual(4);
			expect(preset.localizedName.length).toBeGreaterThan(0);
			expect(preset.defaultIntensity).toBeGreaterThanOrEqual(0);
			expect(preset.defaultIntensity).toBeLessThanOrEqual(100);
			expect(getFilterPreset({ presetId: preset.id })).toBe(preset);
		}
	});
});
