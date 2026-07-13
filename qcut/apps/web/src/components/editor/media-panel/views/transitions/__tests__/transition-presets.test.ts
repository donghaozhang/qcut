import { describe, expect, it } from "vitest";
import type { TransitionPreset } from "../transition-presets";
import {
	filterTransitionPresets,
	getClipTransitionPresetConfig,
	getTransitionPresetById,
	transitionPresets,
} from "../transition-presets";

function requirePreset({ presetId }: { presetId: string }): TransitionPreset {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) throw new Error(`Expected preset "${presetId}" to exist.`);
	return preset;
}

describe("transition presets", () => {
	it("ships at least 50 real presets across the requested families", () => {
		expect(transitionPresets.length).toBeGreaterThanOrEqual(50);
		expect(new Set(transitionPresets.map((preset) => preset.id)).size).toBe(
			transitionPresets.length
		);
		for (const category of [
			"natural",
			"split",
			"blur",
			"camera",
			"light",
			"glitch",
			"mg",
		] as const) {
			expect(
				filterTransitionPresets({ category, query: "" }).length
			).toBeGreaterThan(0);
		}
	});

	it("filters category, favorites, popular, and latest views", () => {
		const split = filterTransitionPresets({ category: "split", query: "" });
		expect(split).toHaveLength(12);
		expect(split.map((preset) => preset.id)).toContain("slide-left");
		expect(split.map((preset) => preset.id)).toContain("wipe-right");

		const favorites = filterTransitionPresets({
			category: "favorites",
			query: "",
			favoriteIds: new Set(["dissolve", "film-burn"]),
		});
		expect(favorites.map((preset) => preset.id)).toEqual([
			"dissolve",
			"film-burn",
		]);
		expect(
			filterTransitionPresets({ category: "popular", query: "" }).every(
				(preset) => preset.popular
			)
		).toBe(true);
		expect(
			filterTransitionPresets({ category: "latest", query: "" }).every(
				(preset) => preset.latest
			)
		).toBe(true);
	});

	it("searches English and Chinese names, descriptions, and tags", () => {
		expect(
			filterTransitionPresets({ category: "all", query: "bright" }).map(
				(preset) => preset.id
			)
		).toContain("fade-to-white");
		expect(
			filterTransitionPresets({ category: "all", query: "胶片" }).map(
				(preset) => preset.id
			)
		).toContain("film-burn");
	});
});

describe("getTransitionPresetById", () => {
	it("returns localized, versioned preset metadata", () => {
		expect(getTransitionPresetById({ presetId: "dissolve" })).toMatchObject({
			id: "dissolve",
			name: "Dissolve",
			localizedName: "叠化",
			category: "natural",
			version: 1,
		});
	});

	it("returns undefined for unknown ids", () => {
		expect(getTransitionPresetById({ presetId: "does-not-exist" })).toBe(
			undefined
		);
	});
});

describe("getClipTransitionPresetConfig", () => {
	it.each([
		["dissolve", { type: "dissolve" }],
		["fade-to-black", { type: "fade-black" }],
		["slide-left", { type: "slide", direction: "left" }],
		["wipe-up", { type: "wipe", direction: "up" }],
		["push-down", { type: "push", direction: "down" }],
		["zoom-blur", { type: "zoom-blur", tuning: { intensity: 0.85 } }],
		["whip-pan-left", { type: "whip-pan", direction: "left" }],
		["flash", { type: "flash", tuning: { intensity: 1, tint: "#ffffff" } }],
		[
			"rgb-glitch",
			{ type: "rgb-glitch", tuning: { intensity: 1, frequency: 1 } },
		],
		["camera-shake", { type: "shake", tuning: { intensity: 1, frequency: 1 } }],
	] as const)("maps %s to a real timeline configuration", (presetId, expected) => {
		expect(
			getClipTransitionPresetConfig({ preset: requirePreset({ presetId }) })
		).toEqual(expected);
	});

	it("exposes no visible preset without a timeline mapping", () => {
		expect(
			transitionPresets.every((preset) =>
				Boolean(getClipTransitionPresetConfig({ preset }))
			)
		).toBe(true);
	});

	it("keeps an unavailable asset out of the apply path", () => {
		const unavailable: TransitionPreset = {
			...requirePreset({ presetId: "dissolve" }),
			id: "unavailable",
			downloaded: false,
		};
		expect(getClipTransitionPresetConfig({ preset: unavailable })).toBeNull();
	});
});
