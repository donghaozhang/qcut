import { describe, expect, it } from "vitest";
import {
	EMPTY_TEXT_LIBRARY_STATE,
	getTextDefinitionsForLibraryCategory,
	markTextTemplateDownloaded,
	markTextTemplateUsed,
	parseTextLibraryState,
	toggleFavoriteTextTemplate,
} from "../text-library-state";
import type { TextTemplateDefinition } from "../text-template-registry";

const templateDefinitions = [
	createDefinition({ id: "first", category: "basic", downloaded: true }),
	createDefinition({ id: "second", category: "basic" }),
	createDefinition({ id: "third", category: "favorites" }),
] as const;

function createDefinition({
	id,
	category,
	downloaded = false,
}: {
	id: string;
	category: TextTemplateDefinition["category"];
	downloaded?: boolean;
}): TextTemplateDefinition {
	return {
		id,
		name: id,
		category,
		groupId: "new-text",
		variantId: "plain",
		content: id,
		stylePresetId: "clean-white",
		keywords: [id, category, "text", "template", "test"],
		premium: false,
		downloaded,
		catalogVisible: true,
	};
}

describe("text library state", () => {
	it("parses persisted state defensively", () => {
		expect(parseTextLibraryState({ value: null })).toEqual(
			EMPTY_TEXT_LIBRARY_STATE
		);
		expect(
			parseTextLibraryState({
				value: {
					favoriteIds: ["first", "first", "", 3],
					downloadedIds: ["second"],
					recentIds: ["third", "first"],
				},
			})
		).toEqual({
			favoriteIds: ["first"],
			downloadedIds: ["second"],
			recentIds: ["third", "first"],
			downloadRecords: [],
			hasSvipAccess: false,
		});
	});

	it("toggles favorites, downloads, and recent usage without duplicates", () => {
		const favorited = toggleFavoriteTextTemplate({
			state: EMPTY_TEXT_LIBRARY_STATE,
			templateId: "first",
		});
		expect(favorited.favoriteIds).toEqual(["first"]);
		expect(
			toggleFavoriteTextTemplate({ state: favorited, templateId: "first" })
				.favoriteIds
		).toEqual([]);

		const downloaded = markTextTemplateDownloaded({
			state: EMPTY_TEXT_LIBRARY_STATE,
			templateId: "second",
		});
		expect(
			markTextTemplateDownloaded({ state: downloaded, templateId: "second" })
		).toBe(downloaded);

		const recent = markTextTemplateUsed({
			state: { ...EMPTY_TEXT_LIBRARY_STATE, recentIds: ["first", "second"] },
			templateId: "second",
		});
		expect(recent.recentIds).toEqual(["second", "first"]);
	});

	it("resolves virtual categories from user state", () => {
		const state = {
			...EMPTY_TEXT_LIBRARY_STATE,
			favoriteIds: ["second", "missing"],
			downloadedIds: ["third"],
			recentIds: ["third", "first"],
		};

		expect(
			getTextDefinitionsForLibraryCategory({
				category: "favorites",
				definitions: templateDefinitions,
				state,
			}).map((definition) => definition.id)
		).toEqual(["second"]);
		expect(
			getTextDefinitionsForLibraryCategory({
				category: "downloaded",
				definitions: templateDefinitions,
				state,
			}).map((definition) => definition.id)
		).toEqual(["first", "third"]);
		expect(
			getTextDefinitionsForLibraryCategory({
				category: "recent",
				definitions: templateDefinitions,
				state,
			}).map((definition) => definition.id)
		).toEqual(["third", "first"]);
		expect(
			getTextDefinitionsForLibraryCategory({
				category: "brand-kit",
				definitions: templateDefinitions,
				state,
			})
		).toEqual([]);
		expect(
			getTextDefinitionsForLibraryCategory({
				category: "drafts",
				definitions: templateDefinitions,
				state,
			})
		).toEqual([]);
	});
});
