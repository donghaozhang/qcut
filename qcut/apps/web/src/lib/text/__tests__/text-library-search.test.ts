import { describe, expect, it } from "vitest";
import { EMPTY_TEXT_LIBRARY_STATE } from "../text-library-state";
import {
	buildWeightedSearchTerms,
	rankTextTemplateSearchResults,
} from "../text-library-search";
import type { TextTemplateDefinition } from "../text-template-registry";

function createDefinition({
	category,
	content,
	downloaded = false,
	id,
	keywords = [],
	premium = false,
	variantId,
}: {
	category: TextTemplateDefinition["category"];
	content: string;
	downloaded?: boolean;
	id: string;
	keywords?: readonly string[];
	premium?: boolean;
	variantId: TextTemplateDefinition["variantId"];
}): TextTemplateDefinition {
	return {
		id,
		name: id,
		category,
		groupId: "fancy",
		variantId,
		content,
		stylePresetId: "clean-white",
		keywords: [id, category, variantId, ...keywords],
		premium,
		downloaded,
		resource: {
			assetId: `text-fancy-${category}-${variantId}`,
			packageId: `text-fancy-${category}`,
			version: 1,
			entitlement: premium ? "svip" : "free",
			cacheKey: `text-assets/text-fancy-${category}/${variantId}@1`,
			sizeKb: 128,
		},
		catalogVisible: true,
	};
}

describe("text library search", () => {
	it("expands bilingual query synonyms with stable weights", () => {
		expect(buildWeightedSearchTerms({ query: "Neon" })).toEqual(
			expect.arrayContaining([
				{ term: "neon", weight: 1 },
				{ term: "发光", weight: 0.72 },
				{ term: "faguang", weight: 0.64 },
				{ term: "fg", weight: 0.5888 },
				{ term: "霓虹", weight: 0.72 },
				{ term: "流光", weight: 0.72 },
			])
		);
	});

	it("adds pinyin full and acronym aliases for Chinese queries", () => {
		expect(buildWeightedSearchTerms({ query: "红色" })).toEqual(
			expect.arrayContaining([
				{ term: "红色", weight: 1 },
				{ term: "hongse", weight: 0.95 },
				{ term: "hs", weight: 0.874 },
			])
		);
		expect(buildWeightedSearchTerms({ query: "开业促销" })).toEqual(
			expect.arrayContaining([
				{ term: "kaiyecuxiao", weight: 0.95 },
				{ term: "kycx", weight: 0.874 },
			])
		);
		expect(buildWeightedSearchTerms({ query: "直播封面" })).toEqual(
			expect.arrayContaining([
				{ term: "zhibofengmian", weight: 0.95 },
				{ term: "zbfm", weight: 0.874 },
			])
		);
	});

	it("adds common Chinese typo correction aliases", () => {
		const terms = buildWeightedSearchTerms({ query: "兰色" });
		expect(terms).toEqual(
			expect.arrayContaining([
				{ term: "兰色", weight: 1 },
				{ term: "蓝色", weight: 0.7 },
				{ term: "lanse", weight: 0.95 },
				{ term: "ls", weight: 0.874 },
			])
		);
		expect(terms).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ term: "se" }),
				expect.objectContaining({ term: "s" }),
			])
		);
		expect(buildWeightedSearchTerms({ query: "文理" })).toEqual(
			expect.arrayContaining([{ term: "纹理", weight: 0.7 }])
		);
		expect(buildWeightedSearchTerms({ query: "封免" })).toEqual(
			expect.arrayContaining([
				{ term: "封面", weight: 0.7 },
				{ term: "fengmian", weight: 0.616 },
			])
		);
	});

	it("adds marketplace phrase pinyin aliases beyond the base character map", () => {
		expect(buildWeightedSearchTerms({ query: "带货" })).toEqual(
			expect.arrayContaining([
				{ term: "daihuo", weight: 0.95 },
				{ term: "dh", weight: 0.874 },
			])
		);
		expect(buildWeightedSearchTerms({ query: "信息条" })).toEqual(
			expect.arrayContaining([
				{ term: "xinxitiao", weight: 0.95 },
				{ term: "xxt", weight: 0.874 },
			])
		);
	});

	it("ranks matching text templates with state-aware boosts", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "发光标题",
				id: "plain-glow",
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "发光标题",
				id: "favorite-glow",
				variantId: "shadow",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "发光",
				state: {
					...EMPTY_TEXT_LIBRARY_STATE,
					favoriteIds: ["favorite-glow"],
					recentIds: ["favorite-glow"],
				},
			}).map((definition) => definition.id)
		).toEqual(["favorite-glow", "plain-glow"]);
	});

	it("returns the original definition order for empty queries", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "First",
				id: "first",
				variantId: "plain",
			}),
			createDefinition({
				category: "popular",
				content: "Second",
				id: "second",
				variantId: "red-burst",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "   ",
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toEqual(definitions);
	});

	it("matches Chinese template metadata through pinyin and acronym queries", () => {
		const definitions = [
			createDefinition({
				category: "red",
				content: "红色花字",
				id: "red-style",
				keywords: ["红色", "花字"],
				variantId: "red-burst",
			}),
			createDefinition({
				category: "blue",
				content: "蓝色花字",
				id: "blue-style",
				keywords: ["蓝色", "花字"],
				variantId: "blue-ice",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "hongse",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["red-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "hs",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["red-style"]);
	});

	it("tolerates small latin typos for pinyin searches", () => {
		const definitions = [
			createDefinition({
				category: "glow",
				content: "发光花字",
				id: "glow-style",
				keywords: ["发光", "霓虹"],
				variantId: "glow",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "faguagn",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["glow-style"]);
	});

	it("tolerates small latin typos inside longer pinyin metadata", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "红色花字",
				id: "red-style",
				keywords: ["红色", "花字"],
				variantId: "red-burst",
			}),
			createDefinition({
				category: "blue",
				content: "直播价格",
				id: "live-sale-style",
				keywords: ["直播", "价格", "优惠"],
				variantId: "blue-ice",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "hongze",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["red-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "zhibl",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["live-sale-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "zb",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["live-sale-style"]);
	});

	it("matches common Chinese typo queries against corrected marketplace terms", () => {
		const definitions = [
			createDefinition({
				category: "blue",
				content: "蓝色花字",
				id: "blue-style",
				keywords: ["蓝色", "科技"],
				variantId: "blue-ice",
			}),
			createDefinition({
				category: "texture",
				content: "纹理质感",
				id: "texture-style",
				keywords: ["纹理", "质感"],
				variantId: "sticker",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "兰色",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["blue-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "文理",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["texture-style"]);
	});

	it("matches marketplace remote tags and uses heat metadata for ranking", () => {
		const definitions = [
			createDefinition({
				category: "red",
				content: "花字",
				id: "plain-red",
				variantId: "plain",
			}),
			createDefinition({
				category: "red",
				content: "花字",
				id: "hero-red",
				premium: true,
				variantId: "red-burst",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "hero",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["hero-red"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "花字",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["hero-red", "plain-red"]);
	});

	it("uses marketplace overrides for remote tags and heat ranking", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "花字",
				id: "standard-campaign",
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "花字",
				id: "remote-campaign",
				variantId: "shadow",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides: {
					"remote-campaign": {
						heatScore: 100,
						remoteTags: ["campaign:launch", "scene:retail"],
						searchAliases: ["开业活动"],
					},
				},
				query: "launch",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides: {
					"remote-campaign": {
						editorialRank: 1,
						heatScore: 100,
					},
				},
				query: "花字",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign", "standard-campaign"]);
	});

	it("matches marketplace campaign aliases through pinyin queries", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "花字",
				id: "standard-campaign",
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "花字",
				id: "remote-campaign",
				variantId: "shadow",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides: {
					"remote-campaign": {
						remoteTags: ["campaign:launch"],
						searchAliases: ["开业活动"],
					},
				},
				query: "kaiye",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign"]);
	});

	it("matches localized operation terms from remote marketplace tags", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "花字",
				id: "standard-style",
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "花字",
				id: "remote-commerce-style",
				variantId: "shadow",
			}),
			createDefinition({
				category: "basic",
				content: "花字",
				id: "remote-cover-style",
				variantId: "sticker",
			}),
		];
		const marketplaceOverrides = {
			"remote-commerce-style": {
				remoteTags: ["scene:commerce"],
			},
			"remote-cover-style": {
				remoteTags: ["market:hero"],
			},
		};

		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "电商",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-commerce-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "dianshang",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-commerce-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "maihuo",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-commerce-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "fengmian",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-cover-style"]);
	});

	it("matches remote marketplace phrase aliases through pinyin and acronyms", () => {
		const definitions = [
			createDefinition({
				category: "basic",
				content: "花字",
				id: "standard-campaign",
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "花字",
				id: "remote-campaign",
				variantId: "shadow",
			}),
		];
		const marketplaceOverrides = {
			"remote-campaign": {
				searchAliases: ["带货标牌", "信息条", "同款链接"],
			},
		};

		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "daihuo",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "xxt",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				marketplaceOverrides,
				query: "tklj",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["remote-campaign"]);
	});

	it("matches built-in operation aliases through pinyin queries", () => {
		const definitions = [
			createDefinition({
				category: "blue",
				content: "蓝色花字",
				id: "blue-style",
				variantId: "blue-ice",
			}),
			createDefinition({
				category: "red",
				content: "红色花字",
				id: "red-style",
				variantId: "red-burst",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "cuxiao",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["red-style"]);
	});

	it("matches expanded creator commerce aliases through pinyin and typo queries", () => {
		const definitions = [
			createDefinition({
				category: "red",
				content: "直播价格",
				id: "live-sale-style",
				keywords: ["直播", "价格", "优惠"],
				variantId: "red-burst",
			}),
			createDefinition({
				category: "basic",
				content: "封面标题",
				id: "cover-title-style",
				keywords: ["封面", "爆款", "标题"],
				variantId: "plain",
			}),
			createDefinition({
				category: "basic",
				content: "探店美食",
				id: "store-review-style",
				keywords: ["探店", "种草", "美食"],
				variantId: "shadow",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "zhibo",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["live-sale-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "fengmian",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["cover-title-style", "live-sale-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "tandian",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["store-review-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "价各",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["live-sale-style"]);
	});

	it("matches default marketplace scene aliases without template keywords", () => {
		const definitions = [
			createDefinition({
				category: "green",
				content: "清新花字",
				id: "green-marketplace-style",
				variantId: "plain",
			}),
			createDefinition({
				category: "popular",
				content: "热门花字",
				id: "cover-marketplace-style",
				variantId: "comic",
			}),
			createDefinition({
				category: "blue",
				content: "科技花字",
				id: "tech-marketplace-style",
				variantId: "blue-ice",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "tandian",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["green-marketplace-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "fengmian",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["cover-marketplace-style"]);
	});

	it("matches creator phrase pinyin aliases that are not covered character by character", () => {
		const definitions = [
			createDefinition({
				category: "popular",
				content: "高能预警",
				id: "warning-title-style",
				keywords: ["高能预警"],
				variantId: "comic",
			}),
			createDefinition({
				category: "red",
				content: "同款链接",
				id: "shopping-link-style",
				keywords: ["同款链接"],
				variantId: "red-burst",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "gnyj",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["warning-title-style"]);
		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "tongkuanlianjie",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["shopping-link-style"]);
	});

	it("prioritizes templates that match every token in multi-intent searches", () => {
		const definitions = [
			createDefinition({
				category: "red",
				content: "红色花字",
				id: "red-only-style",
				keywords: ["红色", "爆款"],
				variantId: "red-burst",
			}),
			createDefinition({
				category: "blue",
				content: "直播价格",
				id: "live-only-style",
				keywords: ["直播", "价格", "促销"],
				variantId: "blue-ice",
			}),
			createDefinition({
				category: "red",
				content: "直播价格",
				id: "live-red-style",
				keywords: ["直播", "价格", "促销", "红色"],
				variantId: "red-burst",
			}),
		];

		expect(
			rankTextTemplateSearchResults({
				definitions,
				query: "直播 红色",
				state: EMPTY_TEXT_LIBRARY_STATE,
			}).map((definition) => definition.id)
		).toEqual(["live-red-style", "red-only-style", "live-only-style"]);
	});

	it("splits marketplace separator queries into searchable intent tokens", () => {
		const definitions = [
			createDefinition({
				category: "blue",
				content: "直播价格",
				id: "live-blue-style",
				keywords: ["直播", "价格", "促销"],
				variantId: "blue-ice",
			}),
			createDefinition({
				category: "red",
				content: "直播价格",
				id: "live-red-style",
				keywords: ["直播", "价格", "促销", "红色"],
				variantId: "red-burst",
			}),
			createDefinition({
				category: "red",
				content: "封面标题",
				id: "cover-red-style",
				keywords: ["封面", "红色"],
				variantId: "red-burst",
			}),
		];

		const latinSeparatorResults = rankTextTemplateSearchResults({
			definitions,
			query: "zhibo-red",
			state: EMPTY_TEXT_LIBRARY_STATE,
		}).map((definition) => definition.id);
		const chineseSeparatorResults = rankTextTemplateSearchResults({
			definitions,
			query: "直播/红色",
			state: EMPTY_TEXT_LIBRARY_STATE,
		}).map((definition) => definition.id);

		expect(latinSeparatorResults[0]).toBe("live-red-style");
		expect(new Set(latinSeparatorResults)).toEqual(
			new Set(["live-red-style", "live-blue-style", "cover-red-style"])
		);
		expect(chineseSeparatorResults[0]).toBe("live-red-style");
		expect(new Set(chineseSeparatorResults)).toEqual(
			new Set(["live-red-style", "live-blue-style", "cover-red-style"])
		);
	});
});
