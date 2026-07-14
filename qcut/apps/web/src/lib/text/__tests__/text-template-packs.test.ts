import { describe, expect, it } from "vitest";
import {
	buildTextTemplatePack,
	isTextTemplatePackDefinition,
} from "../text-template-packs";
import { getTextTemplateDefinitionsByCategory } from "../text-template-registry";

function getFirstDefinition({
	category,
}: {
	category: Parameters<
		typeof getTextTemplateDefinitionsByCategory
	>[0]["category"];
}) {
	const definition = getTextTemplateDefinitionsByCategory({ category })[0];
	if (!definition)
		throw new Error(`Missing text template category ${category}`);
	return definition;
}

describe("text template packs", () => {
	it("recognizes only text template categories as multi-element packs", () => {
		expect(
			isTextTemplatePackDefinition({
				definition: getFirstDefinition({ category: "headline-template" }),
			})
		).toBe(true);
		expect(
			isTextTemplatePackDefinition({
				definition: getFirstDefinition({ category: "quote-template" }),
			})
		).toBe(true);
		expect(
			isTextTemplatePackDefinition({
				definition: getFirstDefinition({ category: "popular" }),
			})
		).toBe(false);
	});

	it("builds headline packs with kicker, headline, and subhead elements", () => {
		const definition = getFirstDefinition({ category: "headline-template" });
		const pack = buildTextTemplatePack({ definition, currentTime: 12 });

		expect(pack?.elements).toHaveLength(3);
		expect(pack?.elements.map((element) => element.name)).toEqual([
			`${definition.name} Kicker`,
			`${definition.name} Headline`,
			`${definition.name} Subhead`,
		]);
		expect(
			pack?.elements.every(
				(element) => element.type === "text" && element.startTime === 12
			)
		).toBe(true);
		expect(pack?.elements[1].content).toBe(definition.content);
	});

	it("builds category-specific layouts instead of cloning one text element", () => {
		const quotePack = buildTextTemplatePack({
			definition: getFirstDefinition({ category: "quote-template" }),
		});
		const splitPack = buildTextTemplatePack({
			definition: getFirstDefinition({ category: "split-template" }),
		});
		const timelinePack = buildTextTemplatePack({
			definition: getFirstDefinition({ category: "timeline-template" }),
		});

		expect(quotePack?.elements.map((element) => element.content)).toContain(
			"“"
		);
		expect(splitPack?.elements.map((element) => element.content)).toEqual([
			"之前",
			"之后",
			"VS",
		]);
		expect(timelinePack?.elements.map((element) => element.content)).toEqual([
			"阶段 1",
			getFirstDefinition({ category: "timeline-template" }).content,
			"结果",
		]);
	});
});
