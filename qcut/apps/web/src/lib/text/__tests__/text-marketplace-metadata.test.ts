import { describe, expect, it } from "vitest";
import {
	compareTextTemplatesByMarketplaceOrder,
	getTextTemplateMarketplaceMetadata,
	parseTextTemplateMarketplaceRemoteConfig,
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

	it("applies remote config overrides by asset and template identifiers", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		const redBurst = definitions.find(
			(definition) => definition.variantId === "red-burst"
		);
		const plain = definitions.find(
			(definition) => definition.variantId === "plain"
		);
		if (!redBurst || !plain?.resource) {
			throw new Error("Expected red marketplace fixtures");
		}
		const overrides = parseTextTemplateMarketplaceRemoteConfig({
			value: {
				assets: [
					{
						assetId: plain.resource.assetId,
						editorialRank: 77.4,
						heatScore: 140,
						remoteTags: ["campaign:asset", "campaign:shared"],
						searchAliases: ["asset alias"],
					},
					{
						templateId: plain.id,
						editorialRank: 1,
						remoteTags: ["campaign:template", "campaign:shared"],
						searchAliases: ["template alias"],
					},
				],
				schemaVersion: 1,
			},
		});

		expect(
			getTextTemplateMarketplaceMetadata({
				definition: plain,
				overrides,
			})
		).toMatchObject({
			editorialRank: 1,
			heatScore: 100,
			remoteTags: expect.arrayContaining([
				"campaign:asset",
				"campaign:template",
				"campaign:shared",
			]),
			searchAliases: expect.arrayContaining(["asset alias", "template alias"]),
		});
		expect(
			compareTextTemplatesByMarketplaceOrder({
				left: plain,
				overrides,
				right: redBurst,
			})
		).toBeLessThan(0);
	});

	it("rejects malformed remote marketplace configs", () => {
		expect(() =>
			parseTextTemplateMarketplaceRemoteConfig({
				value: { assets: [], schemaVersion: 2 },
			})
		).toThrow("schemaVersion 1");
		expect(() =>
			parseTextTemplateMarketplaceRemoteConfig({
				value: {
					assets: [{ heatScore: 10 }],
					schemaVersion: 1,
				},
			})
		).toThrow("requires templateId or assetId");
		expect(() =>
			parseTextTemplateMarketplaceRemoteConfig({
				value: {
					assets: [{ heatScore: Number.NaN, templateId: "template-a" }],
					schemaVersion: 1,
				},
			})
		).toThrow("invalid heatScore");
	});
});
