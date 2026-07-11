import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import {
	DEFAULT_COLOR_FILTER_APPLICATION,
	normalizeColorFilterApplication,
	resolveColorFilterSettings,
} from "../filter-resolver";

describe("filter resolver", () => {
	it("normalizes only serializable preset metadata", () => {
		expect(
			normalizeColorFilterApplication({
				filter: { presetId: " vivid ", presetVersion: 1.4, intensity: 140 },
			})
		).toEqual({ presetId: "vivid", presetVersion: 1, intensity: 100 });
	});

	it("leaves the manual LUT untouched when no library filter is active", () => {
		const settings = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			lut: {
				...DEFAULT_MEDIA_COLOR_SETTINGS.lut,
				enabled: true,
				presetId: "custom",
				name: "Project LUT",
			},
		};
		const resolved = resolveColorFilterSettings({ settings });
		expect(resolved.lut).toEqual(settings.lut);
	});

	it("resolves a library preset into a transient cube and scaled extras", () => {
		const settings = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			filter: { presetId: "hard-mono", presetVersion: 1, intensity: 50 },
		};
		const resolved = resolveColorFilterSettings({ settings });
		expect(resolved.filter).toEqual({
			presetId: "hard-mono",
			presetVersion: 1,
			intensity: 50,
		});
		expect(resolved.lut.enabled).toBe(true);
		expect(resolved.lut.cube?.values.length).toBe(17 ** 3 * 3);
		expect(resolved.basic.grain).toBe(8);
		expect(resolved.basic.vignette).toBe(6);
		expect(settings.lut.cube).toBeUndefined();
	});

	it("falls back safely when a project references a missing preset", () => {
		const settings = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			filter: { presetId: "removed-filter", presetVersion: 2, intensity: 75 },
		};
		const resolved = resolveColorFilterSettings({ settings });
		expect(resolved.filter).toEqual(DEFAULT_COLOR_FILTER_APPLICATION);
		expect(resolved.lut.cube).toBeUndefined();
	});
});
