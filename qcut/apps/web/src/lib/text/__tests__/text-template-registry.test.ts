import { describe, expect, it } from "vitest";
import { BUILT_IN_TEXT_PRESETS } from "../text-presets";
import {
	TEXT_TEMPLATE_CATEGORIES,
	TEXT_TEMPLATE_DEFINITIONS,
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
			expect(getTextTemplatesByCategory({ category: category.id }).length).toBe(
				4
			);
		}
	});

	it("keeps style values synchronized with the properties-panel preset", () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.id === "cyan-neon"
		);
		const preset = BUILT_IN_TEXT_PRESETS.find(
			(candidate) => candidate.id === definition?.stylePresetId
		);
		const template = TEXT_TEMPLATES.find(
			(candidate) => candidate.id === definition?.id
		);

		expect(template?.glowColor).toBe(preset?.updates.glowColor);
		expect(template?.glowOpacity).toBe(preset?.updates.glowOpacity);
		expect(template?.strokeColor).toBe(preset?.updates.strokeColor);
	});
});
