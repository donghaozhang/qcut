import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	compareTextTemplatesByMarketplaceOrder,
	getRecommendedTextTemplateDefinitions,
	getTextTemplateMarketplaceMetadata,
	loadTextTemplateMarketplaceRemoteConfig,
	parseTextTemplateMarketplaceRemoteConfig,
	parseTextTemplateMarketplaceRemoteConfigPayload,
	TEXT_MARKETPLACE_REMOTE_CONFIG_STORAGE_KEY,
} from "../text-marketplace-metadata";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	getTextTemplateDefinitionsByCategory,
} from "../text-template-registry";

const WEB_PUBLIC_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../../..",
	"public"
);
const BUNDLED_MARKETPLACE_CONFIG_PATH = join(
	WEB_PUBLIC_DIR,
	"text-assets/marketplace.json"
);

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

	it("uses marketplace sections as the operator-defined recommendation order", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		const plain = definitions.find(
			(definition) => definition.variantId === "plain"
		);
		const redBurst = definitions.find(
			(definition) => definition.variantId === "red-burst"
		);
		if (!plain || !redBurst) {
			throw new Error("Expected red marketplace fixtures");
		}

		expect(
			getRecommendedTextTemplateDefinitions({
				definitions,
				sections: [
					{
						id: "recommended",
						templateIds: [plain.id, "missing-template", redBurst.id, plain.id],
						title: "推荐",
					},
				],
			}).map((definition) => definition.id)
		).toEqual([plain.id, redBurst.id]);
	});

	it("parses remote marketplace sections beside asset overrides", () => {
		expect(
			parseTextTemplateMarketplaceRemoteConfigPayload({
				value: {
					assets: [
						{
							heatScore: 88,
							templateId: "template-a",
						},
					],
					schemaVersion: 1,
					sections: [
						{
							id: "recommended",
							templateIds: ["template-a", "template-b", "template-a"],
							title: "推荐",
						},
					],
				},
			})
		).toEqual({
			overrides: {
				"template-a": { heatScore: 88 },
			},
			sections: [
				{
					id: "recommended",
					templateIds: ["template-a", "template-b"],
					title: "推荐",
				},
			],
		});
	});

	it("ships bundled marketplace heat, tags, aliases, and sections for every text asset", () => {
		const payload = JSON.parse(
			readFileSync(BUNDLED_MARKETPLACE_CONFIG_PATH, "utf8")
		) as {
			assets: Array<{
				assetId?: string;
				editorialRank?: number;
				heatScore?: number;
				remoteTags?: string[];
				searchAliases?: string[];
				templateId?: string;
			}>;
			sections: Array<{
				id: string;
				templateIds: string[];
				title: string;
			}>;
		};
		const parsed = parseTextTemplateMarketplaceRemoteConfigPayload({
			value: payload,
		});
		const templateIds = new Set(
			TEXT_TEMPLATE_DEFINITIONS.map((definition) => definition.id)
		);
		const definitionsById = new Map(
			TEXT_TEMPLATE_DEFINITIONS.map((definition) => [definition.id, definition])
		);
		const bundledTemplateIds = new Set(
			payload.assets.map((asset) => asset.templateId)
		);

		expect(payload.assets).toHaveLength(TEXT_TEMPLATE_DEFINITIONS.length);
		for (const definition of TEXT_TEMPLATE_DEFINITIONS) {
			expect(bundledTemplateIds.has(definition.id)).toBe(true);
		}
		for (const asset of payload.assets) {
			const definition = definitionsById.get(asset.templateId ?? "");
			expect(asset.assetId).toMatch(/^text-/);
			expect(asset.templateId).toEqual(expect.any(String));
			expect(definition).toBeDefined();
			expect(asset.editorialRank).toEqual(expect.any(Number));
			expect(asset.heatScore).toEqual(expect.any(Number));
			expect(asset.remoteTags).toEqual(
				expect.arrayContaining([`category:${definition?.category}`])
			);
			expect(asset.remoteTags?.length ?? 0).toBeGreaterThanOrEqual(3);
		}
		expect(parsed.sections.map((section) => section.id)).toEqual([
			"recommended",
			"commerce",
			"cover",
			"premium-look",
		]);
		for (const section of parsed.sections) {
			expect(section.templateIds.length).toBeGreaterThan(0);
			for (const templateId of section.templateIds) {
				expect(templateIds.has(templateId)).toBe(true);
			}
		}
		expect(
			payload.assets.some((asset) => (asset.searchAliases?.length ?? 0) > 0)
		).toBe(true);
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
		expect(() =>
			parseTextTemplateMarketplaceRemoteConfigPayload({
				value: {
					assets: [],
					schemaVersion: 1,
					sections: [{ id: "recommended", title: "推荐" }],
				},
			})
		).toThrow("invalid templateIds");
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
					sections: [
						{
							id: "recommended",
							templateIds: ["template-remote"],
							title: "推荐",
						},
					],
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
			sections: [
				{
					id: "recommended",
					templateIds: ["template-remote"],
					title: "推荐",
				},
			],
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
			sections: [],
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
