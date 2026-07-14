import { describe, expect, it } from "vitest";
import { buildTextAssetSourcePayload } from "../generate-text-assets";
import { getTextTemplateDefinitionsByCategory } from "../../src/lib/text/text-template-registry";

function firstDefinition({
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

describe("text asset generator payloads", () => {
	it("embeds multi-element template packs in template source payloads", () => {
		const definition = firstDefinition({ category: "headline-template" });
		const source = buildTextAssetSourcePayload({ definition });

		expect(source.templatePack).toMatchObject({
			category: "headline-template",
			elements: [
				expect.objectContaining({ content: "本期重点", type: "text" }),
				expect.objectContaining({ content: definition.content, type: "text" }),
				expect.objectContaining({ content: "三句话讲清楚", type: "text" }),
			],
			id: `pack-${definition.id}`,
		});
	});

	it("keeps single-style text assets as single-template payloads", () => {
		const source = buildTextAssetSourcePayload({
			definition: firstDefinition({ category: "red" }),
		});

		expect(source.templatePack).toBeUndefined();
		expect(source.template).toMatchObject({ type: "text" });
	});
});
