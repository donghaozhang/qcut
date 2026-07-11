import { describe, expect, it } from "vitest";
import { FILTER_PRESETS, getFilterPreset } from "../filter-registry";

describe("filter registry", () => {
	it("ships twenty local presets with stable unique identifiers", () => {
		expect(FILTER_PRESETS).toHaveLength(20);
		expect(new Set(FILTER_PRESETS.map((preset) => preset.id)).size).toBe(20);
		expect(new Set(FILTER_PRESETS.map((preset) => preset.lutAssetId)).size).toBe(
			20
		);
	});

	it("keeps every preset local and searchable in both languages", () => {
		for (const preset of FILTER_PRESETS) {
			expect(preset.thumbnail).toMatch(/^\/images\/filter-previews\/.+\.webp$/);
			expect(preset.tags.length).toBeGreaterThanOrEqual(4);
			expect(preset.localizedName.length).toBeGreaterThan(0);
			expect(preset.defaultIntensity).toBeGreaterThanOrEqual(0);
			expect(preset.defaultIntensity).toBeLessThanOrEqual(100);
			expect(getFilterPreset({ presetId: preset.id })).toBe(preset);
		}
	});
});
