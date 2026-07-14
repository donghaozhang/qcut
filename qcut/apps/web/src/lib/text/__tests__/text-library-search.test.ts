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
		expect(buildWeightedSearchTerms({ query: "Neon" })).toEqual([
			{ term: "neon", weight: 1 },
			{ term: "发光", weight: 0.72 },
			{ term: "霓虹", weight: 0.72 },
			{ term: "流光", weight: 0.72 },
		]);
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
});
