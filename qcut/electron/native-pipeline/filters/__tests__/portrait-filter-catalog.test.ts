import { describe, expect, test } from "bun:test";
import { buildFilterCube } from "../../../../apps/web/src/lib/filters/filter-lut";
import { getFilterPresetsByCategory } from "../../../../apps/web/src/lib/filters/filter-registry";
import {
	DEFAULT_PORTRAIT_BEAUTY,
	DEFAULT_PORTRAIT_FILTER_ID,
	PORTRAIT_FILTER_PRESETS,
	resolvePortraitFilter,
} from "../portrait-filter-catalog";

describe("CLI portrait filter catalog", () => {
	test("stays byte-for-value aligned with QCut portrait filter cards", () => {
		const sourcePresets = getFilterPresetsByCategory({ category: "portrait" });
		expect(PORTRAIT_FILTER_PRESETS.map((preset) => preset.id)).toEqual(
			sourcePresets.map((preset) => preset.id)
		);
		for (const source of sourcePresets) {
			const generated = PORTRAIT_FILTER_PRESETS.find(
				(preset) => preset.id === source.id
			);
			expect(generated).toMatchObject({
				id: source.id,
				version: source.version,
				name: source.name,
				localizedName: source.localizedName,
				defaultIntensity: source.defaultIntensity,
				skinProtection: source.skinProtection ?? 0,
				extras: source.extras ?? {},
			});
			expect(generated?.cube).toEqual(buildFilterCube({ preset: source }));
		}
	});

	test("uses a restrained default and validates user amounts", () => {
		expect(resolvePortraitFilter({})).toMatchObject({
			presetId: DEFAULT_PORTRAIT_FILTER_ID,
			beauty: DEFAULT_PORTRAIT_BEAUTY,
			intensity: 70,
		});
		expect(
			resolvePortraitFilter({
				presetId: "none",
				beauty: 0,
				intensity: 0,
			})
		).toMatchObject({ presetId: "none", beauty: 0, intensity: 0 });
		expect(() => resolvePortraitFilter({ presetId: "missing" })).toThrow(
			"Unknown portrait filter"
		);
		expect(() => resolvePortraitFilter({ beauty: 101 })).toThrow("--beauty");
	});
});
