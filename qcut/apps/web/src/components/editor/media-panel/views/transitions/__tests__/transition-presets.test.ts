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
import { TRANSITION_PARITY_CASES } from "../transition-parity-ten";

function requirePreset({ presetId }: { presetId: string }): TransitionPreset {
	const preset = getTransitionPresetById({ presetId });
	if (!preset) throw new Error(`Expected preset "${presetId}" to exist.`);
	return preset;
}

describe("transition presets", () => {
	it("keeps every content category dense and every advanced engine distinct", () => {
		expect(transitionPresets.length).toBeGreaterThanOrEqual(260);
		expect(new Set(transitionPresets.map((preset) => preset.id)).size).toBe(
			transitionPresets.length
		);
		for (const category of TRANSITION_CONTENT_CATEGORIES) {
			const categoryExpansions = TRANSITION_CATEGORY_EXPANSIONS.filter(
				(preset) => preset.category === category
			);
			expect(categoryExpansions.length).toBeGreaterThanOrEqual(5);
			const categoryCount = filterTransitionPresets({
				category,
				query: "",
			}).length;
			expect(categoryCount).toBeGreaterThanOrEqual(20);
			expect(categoryCount).toBeLessThanOrEqual(40);

			const productionSignatures = categoryExpansions.map((preset) =>
				JSON.stringify({
					config: getClipTransitionPresetConfig({ preset }),
					defaultDuration: preset.defaultDuration,
				})
			);
			expect(new Set(productionSignatures).size).toBe(
				categoryExpansions.length
			);
		}

		for (const clipType of [
			"motion-blur",
			"pixelate",
			"water-ripple",
			"particle-dissolve",
			"glass-refraction",
			"page-flip",
			"texture-mask",
			"lens-flare",
		] as const) {
			expect(
				transitionPresets.filter((preset) => preset.clipType === clipType)
					.length
			).toBeGreaterThanOrEqual(8);
		}
		expect(
			new Set(
				transitionPresets.map(
					(preset) => `${preset.preview.from}|${preset.preview.to}`
				)
			).size
		).toBeGreaterThanOrEqual(24);
		expect(
			transitionPresets.every(
				(preset) =>
					preset.preview.from.endsWith(".webp") &&
					preset.preview.to.endsWith(".webp")
			)
		).toBe(true);
	});

	it("filters category, favorites, popular, and latest views", () => {
		const split = filterTransitionPresets({ category: "split", query: "" });
		expect(split.length).toBeGreaterThanOrEqual(17);
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

	it.each(
		TRANSITION_PARITY_CASES
	)("finds the selected JianYing name $jianyingName", ({
		jianyingName,
		qcutPresetId,
	}) => {
		expect(
			filterTransitionPresets({
				category: "all",
				query: jianyingName,
			}).map((preset) => preset.id)
		).toContain(qcutPresetId);
		expect(requirePreset({ presetId: qcutPresetId }).localizedName).toBe(
			jianyingName
		);
	});

	it.each([
		["圆圈扩散", "circle-expand"],
		["爱心扩散", "heart-expand"],
		["向左翻页", "page-flip"],
		["横向拖影", "horizontal-motion-blur"],
	] as const)("keeps the former localized term %s searchable", (query, presetId) => {
		expect(
			filterTransitionPresets({ category: "all", query }).map(
				(preset) => preset.id
			)
		).toContain(presetId);
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
		[
			"directional-smear-left",
			{
				type: "motion-blur",
				direction: "left",
				tuning: { intensity: 0.65 },
			},
		],
		["pixel-collapse", { type: "pixelate", tuning: { intensity: 0.55 } }],
		[
			"pond-ripple",
			{
				type: "water-ripple",
				tuning: { intensity: 0.45, frequency: 0.65 },
			},
		],
		[
			"dust-dissolve",
			{
				type: "particle-dissolve",
				tuning: { intensity: 0.65, frequency: 0.8 },
			},
		],
		[
			"glass-slice",
			{
				type: "glass-refraction",
				direction: "left",
				tuning: { intensity: 0.7, frequency: 1 },
			},
		],
		[
			"page-flip-left",
			{
				type: "page-flip",
				direction: "left",
				tuning: { intensity: 0.7 },
			},
		],
		[
			"paper-grain-reveal",
			{
				type: "texture-mask",
				tuning: { intensity: 0.55, frequency: 0.7 },
			},
		],
		[
			"golden-lens-flare",
			{
				type: "lens-flare",
				tuning: { intensity: 0.7, tint: "#ffd38a" },
			},
		],
		[
			"circle-expand",
			{
				type: "texture-mask",
				maskShape: "circle",
			},
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
						maskShape: config.maskShape,
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
				if (config.maskShape && role === "to") {
					expect(
						presentation.clipPath ?? presentation.maskImage,
						`${preset.id} did not use its ${config.maskShape} mask`
					).toBeDefined();
				}
			}
		}
	});

	it("keeps engine mapping independent from mutable download state", () => {
		const unavailable: TransitionPreset = {
			...requirePreset({ presetId: "dissolve" }),
			id: "unavailable",
			downloaded: false,
		};
		expect(getClipTransitionPresetConfig({ preset: unavailable })).toEqual({
			type: "dissolve",
		});
	});
});
