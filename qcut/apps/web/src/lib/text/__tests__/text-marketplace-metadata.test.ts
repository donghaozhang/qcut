import { describe, expect, it } from "vitest";
import {
	compareTextTemplatesByMarketplaceOrder,
	getTextTemplateMarketplaceMetadata,
} from "../text-marketplace-metadata";
import { getTextTemplateDefinitionsByCategory } from "../text-template-registry";

describe("text marketplace metadata", () => {
	it("adds heat, editorial rank, remote tags, and aliases for market sorting", () => {
		const redBurst = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((definition) => definition.variantId === "red-burst");

		expect(redBurst).toBeDefined();
		expect(
			getTextTemplateMarketplaceMetadata({ definition: redBurst! })
		).toMatchObject({
			editorialRank: 2,
			heatScore: expect.any(Number),
			remoteTags: expect.arrayContaining([
				"category:red",
				"effect:burst",
				"market:hero",
			]),
			searchAliases: expect.arrayContaining(["爆红", "爆款", "促销"]),
		});
	});

	it("orders normal browsing by editorial rank and heat", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		const redBurst = definitions.find(
			(definition) => definition.variantId === "red-burst"
		);
		const plain = definitions.find(
			(definition) => definition.variantId === "plain"
		);

		expect(redBurst).toBeDefined();
		expect(plain).toBeDefined();
		expect(
			compareTextTemplatesByMarketplaceOrder({
				left: redBurst!,
				right: plain!,
			})
		).toBeLessThan(0);
	});
});
