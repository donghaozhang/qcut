import { describe, expect, it } from "vitest";
import { BUILT_IN_TEXT_PRESETS } from "../text-presets";
import {
	MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID,
	MIN_TEXT_TEMPLATES_PER_CATEGORY,
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATE_DEFINITIONS,
	TEXT_TEMPLATE_GROUPS,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
	TEXT_TEMPLATES,
	getTextTemplateDefinitionsByCategory,
	getTextTemplatesByCategory,
} from "../text-template-registry";

function getVariantIdsByCategory({
	category,
}: {
	category: (typeof TEXT_TEMPLATE_CATEGORIES)[number]["id"];
}): string[] {
	return getTextTemplateDefinitionsByCategory({ category }).map(
		(definition) => definition.variantId
	);
}

describe("text template registry", () => {
	it("uses unique template IDs and valid shared style presets", () => {
		const presetIds = new Set(BUILT_IN_TEXT_PRESETS.map((preset) => preset.id));
		const templateIds = TEXT_TEMPLATE_DEFINITIONS.map(
			(definition) => definition.id
		);

		expect(new Set(templateIds).size).toBe(templateIds.length);
		for (const definition of TEXT_TEMPLATE_DEFINITIONS) {
			expect(presetIds.has(definition.stylePresetId)).toBe(true);
		}
	});

	it("materializes every category from the shared style definitions", () => {
		expect(TEXT_TEMPLATES).toHaveLength(TEXT_TEMPLATE_DEFINITIONS.length);
		for (const category of TEXT_TEMPLATE_CATEGORIES.filter(
			(category) => !category.virtual
		)) {
			expect(
				getTextTemplatesByCategory({ category: category.id }).length
			).toBeGreaterThanOrEqual(MIN_TEXT_TEMPLATES_PER_CATEGORY);
		}
	});

	it("keeps every text library group populated with subcategories", () => {
		expect(TEXT_TEMPLATE_GROUPS.length).toBeGreaterThanOrEqual(6);
		for (const group of TEXT_TEMPLATE_GROUPS) {
			expect(group.categories.length).toBeGreaterThan(0);
			for (const category of group.categories) {
				if (category.virtual) continue;
				expect(
					getTextTemplatesByCategory({ category: category.id }).length
				).toBeGreaterThanOrEqual(MIN_TEXT_TEMPLATES_PER_CATEGORY);
			}
		}
	});

	it("keeps the visible marketplace catalog at the requested density", () => {
		expect(
			TEXT_TEMPLATE_LIBRARY_DEFINITIONS.every(
				(definition) => definition.catalogVisible
			)
		).toBe(true);
		for (const category of TEXT_TEMPLATE_CATEGORIES.filter(
			(category) => !category.virtual
		)) {
			const visibleCount = getTextTemplateDefinitionsByCategory({
				category: category.id,
			}).length;
			expect(visibleCount).toBeGreaterThanOrEqual(
				MIN_TEXT_TEMPLATES_PER_CATEGORY
			);
			expect(visibleCount).toBeLessThanOrEqual(30);
		}
	});

	it("curates visible fancy categories instead of reusing the same variant order", () => {
		const popularVariantIds = getVariantIdsByCategory({ category: "popular" });
		const redVariantIds = getVariantIdsByCategory({ category: "red" });
		const textureVariantIds = getVariantIdsByCategory({ category: "texture" });
		const gradientVariantIds = getVariantIdsByCategory({
			category: "gradient",
		});

		expect(redVariantIds.slice(0, 4)).toEqual([
			"red-burst",
			"lava",
			"fire",
			"comic",
		]);
		expect(textureVariantIds.slice(0, 4)).toEqual([
			"texture-grain",
			"torn-paper",
			"chrome",
			"pixel",
		]);
		expect(gradientVariantIds.slice(0, 4)).toEqual([
			"gradient-duotone",
			"gradient-shine",
			"glass",
			"purple-dream",
		]);
		expect(redVariantIds).not.toEqual(popularVariantIds);
		expect(textureVariantIds).not.toEqual(popularVariantIds);
		expect(gradientVariantIds).not.toEqual(popularVariantIds);
	});

	it("exposes a populated virtual recommended marketplace category", () => {
		const recommendedCategory = TEXT_TEMPLATE_CATEGORIES.find(
			(category) => category.id === MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID
		);
		const recommendedDefinitions = getTextTemplateDefinitionsByCategory({
			category: MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID,
		});

		expect(recommendedCategory).toMatchObject({
			groupId: "fancy",
			label: "推荐",
			virtual: true,
		});
		expect(recommendedDefinitions.length).toBeGreaterThanOrEqual(
			MIN_TEXT_TEMPLATES_PER_CATEGORY
		);
		expect(recommendedDefinitions.length).toBeLessThanOrEqual(30);
		expect(
			recommendedDefinitions.every((definition) => definition.catalogVisible)
		).toBe(true);
		expect(
			getTextTemplatesByCategory({
				category: MARKETPLACE_RECOMMENDED_TEXT_CATEGORY_ID,
			}).map((template) => template.id)
		).toEqual(recommendedDefinitions.map((definition) => definition.id));
	});

	it("ships searchable marketplace metadata for template cards", () => {
		expect(MIN_TEXT_TEMPLATES_PER_CATEGORY).toBeGreaterThanOrEqual(20);
		expect(
			TEXT_TEMPLATE_DEFINITIONS.some((definition) => definition.premium)
		).toBe(true);
		expect(
			TEXT_TEMPLATE_DEFINITIONS.some((definition) => definition.downloaded)
		).toBe(true);
		for (const definition of TEXT_TEMPLATE_DEFINITIONS) {
			expect(definition.variantId.length).toBeGreaterThan(0);
			expect(definition.keywords.length).toBeGreaterThanOrEqual(5);
		}
		for (const definition of TEXT_TEMPLATE_LIBRARY_DEFINITIONS) {
			expect(definition.resource?.assetId).toContain(definition.variantId);
			expect(definition.resource?.cacheKey).toContain("@1");
			expect(definition.resource?.entitlement).toBe(
				definition.premium ? "svip" : "free"
			);
		}
	});

	it("uses scenario-specific content for packaging, template, and smart text categories", () => {
		const scenarioCategoryIds = [
			"cover-pack",
			"headline-template",
			"summary",
			"key-point",
			"subtitle-title",
		] as const;

		for (const category of scenarioCategoryIds) {
			const definitions = getTextTemplateDefinitionsByCategory({ category });
			const contents = new Set(
				definitions.map((definition) => definition.content)
			);
			expect(contents.size).toBeGreaterThan(1);
		}

		expect(
			getTextTemplateDefinitionsByCategory({ category: "summary" }).some(
				(definition) => definition.keywords.includes("ai")
			)
		).toBe(true);
		expect(
			getTextTemplateDefinitionsByCategory({
				category: "headline-template",
			}).some((definition) => definition.keywords.includes("标题模板"))
		).toBe(true);
	});

	it("applies category overrides on top of shared style presets", () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.id === "glow-glow"
		);
		const preset = BUILT_IN_TEXT_PRESETS.find(
			(candidate) => candidate.id === definition?.stylePresetId
		);
		const template = TEXT_TEMPLATES.find(
			(candidate) => candidate.id === definition?.id
		);

		expect(definition?.stylePresetId).toBe("cyan-neon");
		expect(preset).toBeDefined();
		expect(template?.glowColor).toBe("#f0abfc");
		expect(template?.glowOpacity).toBe(0.9);
		expect(template?.strokeColor).toBe("#06b6d4");
	});
});
