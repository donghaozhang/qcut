import { describe, expect, it } from "vitest";
import {
	buildTextMarketplaceConfigWithAnalytics,
	parseTextMarketplaceAnalyticsPayload,
} from "../apply-text-marketplace-analytics";
import { getTextTemplateResource } from "../../src/lib/text/text-resource-catalog";
import { getTextTemplateDefinitionsByCategory } from "../../src/lib/text/text-template-registry";

function requiredDefinition({
	category,
}: {
	category: Parameters<
		typeof getTextTemplateDefinitionsByCategory
	>[0]["category"];
}) {
	const definition = getTextTemplateDefinitionsByCategory({ category })[0];
	if (!definition) throw new Error(`Missing text category ${category}`);
	return definition;
}

describe("text marketplace analytics applier", () => {
	it("promotes analytics-backed templates into recommended and trending sections", () => {
		const popular = requiredDefinition({ category: "red" });
		const secondary = requiredDefinition({ category: "blue" });
		const payload = buildTextMarketplaceConfigWithAnalytics({
			analytics: {
				events: [
					{
						favorites: 1,
						remoteTags: ["campaign:launch"],
						searchAliases: ["hero title"],
						templateId: secondary.id,
					},
					{
						searchClicks: 4,
						templateId: popular.id,
						uses: 12,
					},
				],
				schemaVersion: 1,
			},
			definitions: [secondary, popular],
		});

		expect(payload.sections.map((section) => section.id).slice(0, 2)).toEqual([
			"recommended",
			"trending",
		]);
		expect(payload.sections[0]?.templateIds[0]).toBe(popular.id);
		expect(payload.sections[1]?.templateIds).toEqual([
			popular.id,
			secondary.id,
		]);
		expect(
			payload.assets.find((asset) => asset.templateId === secondary.id)
		).toMatchObject({
			remoteTags: expect.arrayContaining([
				"analytics:observed",
				"analytics:trending",
				"campaign:launch",
			]),
			searchAliases: expect.arrayContaining(["hero title"]),
		});
	});

	it("aggregates repeated analytics events without duplicating trending entries", () => {
		const definition = requiredDefinition({ category: "green" });
		const resource = getTextTemplateResource({ definition });
		const payload = buildTextMarketplaceConfigWithAnalytics({
			analytics: {
				events: [
					{
						remoteTags: ["source:template"],
						templateId: definition.id,
						uses: 2,
					},
					{
						assetId: resource.assetId,
						remoteTags: ["source:asset"],
						searchAliases: ["green title"],
						uses: 3,
					},
				],
				schemaVersion: 1,
			},
			definitions: [definition],
		});
		const asset = payload.assets.find(
			(candidate) => candidate.templateId === definition.id
		);

		expect(payload.sections[1]?.templateIds).toEqual([definition.id]);
		expect(asset).toMatchObject({
			heatScore: 100,
			remoteTags: expect.arrayContaining(["source:template", "source:asset"]),
			searchAliases: expect.arrayContaining(["green title"]),
		});
	});

	it("rejects malformed analytics payloads before writing marketplace config", () => {
		expect(() =>
			parseTextMarketplaceAnalyticsPayload({
				value: { events: [{ uses: 1 }], schemaVersion: 1 },
			})
		).toThrow(/requires templateId or assetId/);
		expect(() =>
			parseTextMarketplaceAnalyticsPayload({
				value: {
					events: [{ templateId: "red-red-burst", uses: -1 }],
					schemaVersion: 1,
				},
			})
		).toThrow(/invalid uses/);
	});
});
