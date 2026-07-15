import { describe, expect, it } from "vitest";
import {
	applyTextTemplatePackCopy,
	buildTextTemplatePack,
	isTextTemplatePackDefinition,
} from "../text-template-packs";
import {
	buildTextTemplate,
	getTextTemplateDefinitionsByCategory,
} from "../text-template-registry";

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
		expect(pack?.copySlots).toEqual([
			{
				defaultContent: "本期重点",
				elementIndex: 0,
				id: "kicker",
				label: "眉标题",
			},
			{
				defaultContent: definition.content,
				elementIndex: 1,
				id: "headline",
				label: "主标题",
			},
			{
				defaultContent: "三句话讲清楚",
				elementIndex: 2,
				id: "subhead",
				label: "副标题",
			},
		]);
	});

	it("uses provided base templates when expanding pack slots", () => {
		const definition = getFirstDefinition({ category: "headline-template" });
		const baseTemplate = {
			...buildTextTemplate({ definition }),
			color: "#123456",
			duration: 9,
			fontSize: 70,
		};
		const pack = buildTextTemplatePack({
			baseTemplate,
			definition,
			currentTime: 3,
		});

		expect(pack?.elements[1]).toMatchObject({
			color: "#123456",
			content: definition.content,
			duration: 9,
			fontSize: 70,
			startTime: 3,
		});
		expect(pack?.elements[0]).toMatchObject({
			color: "#020617",
			duration: 9,
			fontSize: 28,
		});
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

	it("applies batch copy to pack copy slots without touching decorative elements", () => {
		const quotePack = buildTextTemplatePack({
			definition: getFirstDefinition({ category: "quote-template" }),
		});
		if (!quotePack) throw new Error("Expected quote pack");

		const updatedPack = applyTextTemplatePackCopy({
			contents: ["新的金句", "— Peter"],
			pack: quotePack,
		});

		expect(updatedPack.elements.map((element) => element.content)).toEqual([
			"“",
			"新的金句",
			"— Peter",
		]);
		expect(updatedPack.copySlots.map((slot) => slot.defaultContent)).toEqual([
			"新的金句",
			"— Peter",
		]);
	});

	it("ignores blank batch copy values instead of clearing existing slots", () => {
		const splitPack = buildTextTemplatePack({
			definition: getFirstDefinition({ category: "split-template" }),
		});
		if (!splitPack) throw new Error("Expected split pack");

		const updatedPack = applyTextTemplatePackCopy({
			contents: ["改版前", "   "],
			pack: splitPack,
		});

		expect(updatedPack.elements.map((element) => element.content)).toEqual([
			"改版前",
			"之后",
			"VS",
		]);
		expect(updatedPack.copySlots.map((slot) => slot.defaultContent)).toEqual([
			"改版前",
			"之后",
		]);
	});
});
