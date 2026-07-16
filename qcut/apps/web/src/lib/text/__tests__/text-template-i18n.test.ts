import { describe, expect, it } from "vitest";
import {
	getLocalizedTextTemplateCategoryLabel,
	getLocalizedTextTemplateDefinition,
	getLocalizedTextTemplateGroupLabel,
	getLocalizedTextTemplatePackSlotLabel,
} from "../text-template-i18n";
import {
	TEXT_TEMPLATE_GROUPS,
	TEXT_TEMPLATE_LIBRARY_DEFINITIONS,
} from "../text-template-registry";

const CHINESE_CHARACTER = /[\u3400-\u9fff]/;

describe("text template localization", () => {
	it("provides English labels for every built-in group and category", () => {
		for (const group of TEXT_TEMPLATE_GROUPS) {
			const groupLabel = getLocalizedTextTemplateGroupLabel({
				group,
				locale: "en",
			});
			expect(groupLabel).not.toMatch(CHINESE_CHARACTER);

			for (const category of group.categories) {
				const categoryLabel = getLocalizedTextTemplateCategoryLabel({
					category,
					locale: "en",
				});
				expect(categoryLabel).not.toMatch(CHINESE_CHARACTER);
			}
		}
	});

	it("localizes built-in template names and default copy", () => {
		for (const definition of TEXT_TEMPLATE_LIBRARY_DEFINITIONS) {
			const localized = getLocalizedTextTemplateDefinition({
				definition,
				locale: "en",
			});
			expect(localized.name).not.toMatch(CHINESE_CHARACTER);
			expect(localized.content).not.toMatch(CHINESE_CHARACTER);
		}
	});

	it("preserves Chinese registry copy in Chinese mode", () => {
		const definition = TEXT_TEMPLATE_LIBRARY_DEFINITIONS[0];
		if (!definition) throw new Error("Expected a built-in text template");

		expect(
			getLocalizedTextTemplateDefinition({ definition, locale: "zh" })
		).toBe(definition);
	});

	it("localizes template pack copy slot labels", () => {
		expect(
			getLocalizedTextTemplatePackSlotLabel({
				locale: "en",
				slot: { id: "headline", label: "主标题" },
			})
		).toBe("Headline");
	});
});
