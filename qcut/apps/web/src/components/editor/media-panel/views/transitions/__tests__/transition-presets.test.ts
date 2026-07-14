import { describe, expect, it } from "vitest";
import { getClipTransitionLayerPresentation } from "@/lib/transitions/clip-transition-presentation";
import type { TransitionPreset } from "../transition-presets";
import {
	filterTransitionPresets,
	getClipTransitionPresetConfig,
	getTransitionPresetById,
	TRANSITION_CONTENT_CATEGORIES,
	transitionPresets,
} from "../transition-presets";
import { TRANSITION_CATEGORY_EXPANSIONS } from "../transition-category-expansions";

function requirePreset({ presetId }: { presetId: string }): TransitionPreset {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) throw new Error(`Expected preset "${presetId}" to exist.`);
	return preset;
}

describe("transition presets", () => {
	it("adds five real presets to every content category", () => {
		expect(transitionPresets.length).toBeGreaterThanOrEqual(132);
		expect(new Set(transitionPresets.map((preset) => preset.id)).size).toBe(
			transitionPresets.length
		);
		for (const category of TRANSITION_CONTENT_CATEGORIES) {
			const categoryExpansions = TRANSITION_CATEGORY_EXPANSIONS.filter(
				(preset) => preset.category === category
			);
			expect(categoryExpansions).toHaveLength(5);
			expect(
				filterTransitionPresets({ category, query: "" }).length
			).toBeGreaterThanOrEqual(7);

			const productionSignatures = categoryExpansions.map((preset) =>
				JSON.stringify({
					config: getClipTransitionPresetConfig({ preset }),
					defaultDuration: preset.defaultDuration,
				})
			);
			expect(new Set(productionSignatures).size).toBe(5);
		}
	});

	it("filters category, favorites, popular, and latest views", () => {
		const split = filterTransitionPresets({ category: "split", query: "" });
		expect(split).toHaveLength(17);
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
			category: "dissolve",
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
		["soft-dissolve", { type: "dissolve" }],
		["fade-to-black", { type: "fade-black" }],
		["page-turn-left", { type: "wipe", direction: "left" }],
		[
			"shutter-flash",
			{ type: "flash", tuning: { intensity: 1.35, tint: "#ffffff" } },
		],
		["liquid-warp", { type: "zoom-blur", tuning: { intensity: 1.25 } }],
		["comic-pop", { type: "zoom-blur", tuning: { intensity: 0.7 } }],
		["heart-pulse", { type: "zoom-blur", tuning: { intensity: 0.45 } }],
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
		[
			"warm-dissolve",
			{
				type: "light-leak",
				tuning: { intensity: 0.35, frequency: 0.55, tint: "#ffbf8a" },
			},
		],
		["sunrise-fade", { type: "fade-white" }],
		["album-slide-left", { type: "slide", direction: "left" }],
		[
			"split-signal",
			{ type: "rgb-glitch", tuning: { intensity: 0.45, frequency: 2.1 } },
		],
		[
			"horizontal-smear",
			{
				type: "whip-pan",
				direction: "left",
				tuning: { intensity: 0.45 },
			},
		],
		["crash-zoom", { type: "zoom-blur", tuning: { intensity: 1.8 } }],
		[
			"exposure-pop",
			{ type: "flash", tuning: { intensity: 0.75, tint: "#fff2d6" } },
		],
		[
			"digital-twist",
			{ type: "rgb-glitch", tuning: { intensity: 0.5, frequency: 3 } },
		],
		[
			"prism-flare",
			{
				type: "light-leak",
				tuning: { intensity: 0.8, frequency: 1.5, tint: "#d8c4ff" },
			},
		],
		[
			"data-mosh",
			{ type: "rgb-glitch", tuning: { intensity: 1.65, frequency: 0.35 } },
		],
		["sticker-swipe", { type: "push", direction: "right" }],
		[
			"kinetic-jump",
			{ type: "shake", tuning: { intensity: 0.75, frequency: 2.35 } },
		],
		[
			"love-flash",
			{ type: "flash", tuning: { intensity: 0.7, tint: "#ff9fbd" } },
		],
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

	it("previews every visible preset through the production presentation", () => {
		for (const preset of transitionPresets) {
			const config = getClipTransitionPresetConfig({ preset });
			if (!config)
				throw new Error(`${preset.id} is missing its preview mapping`);
			for (const role of ["from", "to"] as const) {
				const presentation = getClipTransitionLayerPresentation({
					transition: {
						id: `preview-${preset.id}`,
						fromElementId: "from",
						toElementId: "to",
						presetId: preset.id,
						type: config.type,
						direction: config.direction,
						tuning: config.tuning,
						duration: preset.defaultDuration,
						easing: "easeInOut",
					},
					role,
					progress: 0.5,
					canvasWidth: 1_920,
					canvasHeight: 1_080,
				});
				expect(Number.isFinite(presentation.opacity)).toBe(true);
				expect(Number.isFinite(presentation.offsetX)).toBe(true);
				expect(Number.isFinite(presentation.offsetY)).toBe(true);
			}
		}
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
