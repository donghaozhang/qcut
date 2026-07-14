import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import {
	FILTER_PRESETS,
	getFilterPreset,
	getFilterPresetsByCategory,
} from "../filter-registry";
import { resolveColorFilterSettings } from "../filter-resolver";
import { FILTER_CONTENT_CATEGORIES } from "../filter-types";

function resolveThumbnailPath({ thumbnail }: { thumbnail: string }) {
	return resolve(__dirname, "../../../../public", thumbnail.slice(1));
}

describe("filter registry", () => {
	it("ships a populated local library with stable unique identifiers", () => {
		expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(126);
		expect(new Set(FILTER_PRESETS.map((preset) => preset.id)).size).toBe(
			FILTER_PRESETS.length
		);
		expect(
			new Set(FILTER_PRESETS.map((preset) => preset.lutAssetId)).size
		).toBe(FILTER_PRESETS.length);
		expect(new Set(FILTER_PRESETS.map((preset) => preset.thumbnail)).size).toBe(
			FILTER_PRESETS.length
		);
	});

	it("provides at least nine working presets in every filter category", () => {
		for (const category of FILTER_CONTENT_CATEGORIES) {
			expect(
				getFilterPresetsByCategory({ category }).length
			).toBeGreaterThanOrEqual(9);
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
			const thumbnailPath = resolveThumbnailPath({
				thumbnail: preset.thumbnail,
			});
			expect(existsSync(thumbnailPath)).toBe(true);
			expect(statSync(thumbnailPath).size).toBeGreaterThan(100);
			expect(preset.tags.length).toBeGreaterThanOrEqual(4);
			expect(preset.localizedName.length).toBeGreaterThan(0);
			expect(preset.defaultIntensity).toBeGreaterThanOrEqual(0);
			expect(preset.defaultIntensity).toBeLessThanOrEqual(100);
			expect(getFilterPreset({ presetId: preset.id })).toBe(preset);
		}
	});

	it("uses a distinct rendered preview for every preset", () => {
		const previewHashes = FILTER_PRESETS.map((preset) =>
			createHash("sha256")
				.update(
					readFileSync(resolveThumbnailPath({ thumbnail: preset.thumbnail }))
				)
				.digest("hex")
		);

		expect(new Set(previewHashes).size).toBe(FILTER_PRESETS.length);
	});

	it("resolves every visible preset through the production LUT path", () => {
		for (const preset of FILTER_PRESETS) {
			const resolved = resolveColorFilterSettings({
				settings: {
					...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
					filter: {
						presetId: preset.id,
						presetVersion: preset.version,
						intensity: preset.defaultIntensity,
					},
				},
			});
			expect(resolved.lut.presetId).toBe(`filter:${preset.id}`);
			expect(resolved.lut.cube?.values.length).toBe(17 ** 3 * 3);
		}
	});
});
