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
});
