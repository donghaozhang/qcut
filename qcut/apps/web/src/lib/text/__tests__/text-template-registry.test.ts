import { describe, expect, it } from "vitest";
import { BUILT_IN_TEXT_PRESETS } from "../text-presets";
import {
	MIN_TEXT_TEMPLATES_PER_CATEGORY,
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATE_DEFINITIONS,
	TEXT_TEMPLATE_GROUPS,
	TEXT_TEMPLATES,
	getTextTemplatesByCategory,
} from "../text-template-registry";

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
		for (const category of TEXT_TEMPLATE_CATEGORIES) {
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
				expect(
					getTextTemplatesByCategory({ category: category.id }).length
				).toBeGreaterThanOrEqual(MIN_TEXT_TEMPLATES_PER_CATEGORY);
			}
		}
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
