import { describe, expect, it } from "vitest";
import type { TransitionPreset } from "../transition-presets";
import {
	filterTransitionPresets,
	getClipTransitionPresetConfig,
	getTransitionPresetById,
} from "../transition-presets";

function requirePreset({ presetId }: { presetId: string }): TransitionPreset {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) {
		throw new Error(`Expected preset "${presetId}" to exist.`);
	}
	return preset;
}

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

	it("filters popular and latest virtual categories by preset flags", () => {
		const popular = filterTransitionPresets({ category: "popular", query: "" });
		const latest = filterTransitionPresets({ category: "latest", query: "" });

		expect(popular.map((preset) => preset.id)).toEqual([
			"dissolve",
			"fade-to-black",
			"zoom-blur",
		]);
		expect(latest.map((preset) => preset.id)).toEqual([
			"glitch-shift",
			"light-sweep",
		]);
	});

	it("returns every preset for the all category with an empty query", () => {
		const result = filterTransitionPresets({ category: "all", query: "  " });

		expect(result).toHaveLength(9);
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

describe("getTransitionPresetById", () => {
	it("returns the preset matching the id", () => {
		const preset = getTransitionPresetById({ presetId: "dissolve" });

		expect(preset).toMatchObject({
			id: "dissolve",
			name: "Dissolve",
			category: "fade",
		});
	});

	it("returns undefined for unknown ids", () => {
		expect(getTransitionPresetById({ presetId: "does-not-exist" })).toBe(
			undefined
		);
	});
});

describe("getClipTransitionPresetConfig", () => {
	it("maps dissolve to the dissolve clip transition", () => {
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "dissolve" }),
			})
		).toEqual({ type: "dissolve" });
	});

	it("maps fade-to-black to the fade-black clip transition", () => {
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "fade-to-black" }),
			})
		).toEqual({ type: "fade-black" });
	});

	it("maps slide presets to slide with their direction", () => {
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "slide-left" }),
			})
		).toEqual({ type: "slide", direction: "left" });
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "slide-right" }),
			})
		).toEqual({ type: "slide", direction: "right" });
	});

	it("maps wipe presets to wipe with their direction", () => {
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "wipe-left" }),
			})
		).toEqual({ type: "wipe", direction: "left" });
		expect(
			getClipTransitionPresetConfig({
				preset: requirePreset({ presetId: "wipe-right" }),
			})
		).toEqual({ type: "wipe", direction: "right" });
	});

	it("returns null for presets that are not downloaded", () => {
		const zoomBlur = requirePreset({ presetId: "zoom-blur" });

		expect(zoomBlur.downloaded).toBeFalsy();
		expect(getClipTransitionPresetConfig({ preset: zoomBlur })).toBe(null);
	});

	it("returns null for downloaded presets without a clip transition mapping", () => {
		const unmappedPreset: TransitionPreset = {
			id: "custom-unmapped",
			name: "Custom Unmapped",
			category: "zoom",
			type: "zoom",
			defaultDuration: 0.5,
			tags: ["custom"],
			description: "A downloaded preset without a clip transition mapping.",
			downloaded: true,
		};

		expect(getClipTransitionPresetConfig({ preset: unmappedPreset })).toBe(
			null
		);
	});
});
