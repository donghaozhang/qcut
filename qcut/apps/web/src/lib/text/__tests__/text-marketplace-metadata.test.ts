import { describe, expect, it } from "vitest";
import {
	compareTextTemplatesByMarketplaceOrder,
	getRecommendedTextTemplateDefinitions,
	getTextTemplateMarketplaceMetadata,
	loadTextTemplateMarketplaceRemoteConfig,
	parseTextTemplateMarketplaceRemoteConfig,
	TEXT_MARKETPLACE_REMOTE_CONFIG_STORAGE_KEY,
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

	it("builds an operator recommendation set from heat and remote overrides", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		const basicPlain = getTextTemplateDefinitionsByCategory({
			category: "basic",
		}).find((definition) => definition.variantId === "plain");
		if (!basicPlain) {
			throw new Error("Expected basic marketplace fixtures");
		}

		const recommendedIds = getRecommendedTextTemplateDefinitions({
			definitions,
		}).map((definition) => definition.id);
		expect(recommendedIds).toContain("red-red-burst");

		expect(
			getRecommendedTextTemplateDefinitions({
				definitions: [basicPlain],
			})
		).toHaveLength(0);
		expect(
			getRecommendedTextTemplateDefinitions({
				definitions: [basicPlain],
				overrides: {
					[basicPlain.id]: {
						remoteTags: ["market:recommended"],
					},
				},
			}).map((definition) => definition.id)
		).toEqual([basicPlain.id]);
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

	it("loads remote marketplace config and caches the raw payload", async () => {
		const storage = new MapStorage();
		const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe("https://cdn.example.test/marketplace.json");
			expect(init).toMatchObject({ cache: "no-store" });
			return new Response(
				JSON.stringify({
					assets: [
						{
							heatScore: 88,
							remoteTags: ["campaign:remote"],
							templateId: "template-remote",
						},
					],
					schemaVersion: 1,
				}),
				{ status: 200 }
			);
		};

		await expect(
			loadTextTemplateMarketplaceRemoteConfig({
				fetchImpl,
				storage,
				url: "https://cdn.example.test/marketplace.json",
			})
		).resolves.toMatchObject({
			overrides: {
				"template-remote": {
					heatScore: 88,
					remoteTags: ["campaign:remote"],
				},
			},
			source: "remote",
		});
		expect(
			storage.getItem(TEXT_MARKETPLACE_REMOTE_CONFIG_STORAGE_KEY)
		).toContain("template-remote");
	});

	it("falls back to cached marketplace config when the remote request fails", async () => {
		const storage = new MapStorage();
		storage.setItem(
			TEXT_MARKETPLACE_REMOTE_CONFIG_STORAGE_KEY,
			JSON.stringify({
				assets: [{ editorialRank: 3, templateId: "cached-template" }],
				schemaVersion: 1,
			})
		);

		await expect(
			loadTextTemplateMarketplaceRemoteConfig({
				fetchImpl: async () => new Response("missing", { status: 503 }),
				storage,
			})
		).resolves.toMatchObject({
			error: "Text marketplace config request failed (503)",
			overrides: {
				"cached-template": {
					editorialRank: 3,
				},
			},
			source: "cache",
		});
	});

	it("falls back to bundled marketplace config when remote and cache are unavailable", async () => {
		const storage = new MapStorage();
		const requestedUrls: string[] = [];
		const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
			requestedUrls.push(String(input));
			if (String(input) === "/text-assets/marketplace.json") {
				expect(init).toMatchObject({ cache: "force-cache" });
				return new Response(
					JSON.stringify({
						assets: [
							{
								heatScore: 91,
								remoteTags: ["campaign:bundled"],
								templateId: "bundled-template",
							},
						],
						schemaVersion: 1,
					}),
					{ status: 200 }
				);
			}
			return new Response("missing", { status: 503 });
		};

		await expect(
			loadTextTemplateMarketplaceRemoteConfig({
				fetchImpl,
				storage,
				url: "https://cdn.example.test/marketplace.json",
			})
		).resolves.toMatchObject({
			error: "Text marketplace config request failed (503)",
			overrides: {
				"bundled-template": {
					heatScore: 91,
					remoteTags: ["campaign:bundled"],
				},
			},
			source: "bundled",
		});
		expect(requestedUrls).toEqual([
			"https://cdn.example.test/marketplace.json",
			"/text-assets/marketplace.json",
		]);
		expect(
			storage.getItem(TEXT_MARKETPLACE_REMOTE_CONFIG_STORAGE_KEY)
		).toContain("bundled-template");
	});

	it("returns an empty marketplace config when remote and cache are unavailable", async () => {
		await expect(
			loadTextTemplateMarketplaceRemoteConfig({
				bundledUrl: null,
				fetchImpl: async () => new Response("missing", { status: 404 }),
				storage: new MapStorage(),
			})
		).resolves.toEqual({
			error: "Text marketplace config request failed (404)",
			overrides: {},
			source: "empty",
		});
	});
});

class MapStorage {
	private readonly values = new Map<string, string>();

	getItem(key: string) {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
}
