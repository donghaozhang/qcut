import { describe, expect, it } from "vitest";
import {
	EMPTY_TEXT_LIBRARY_STATE,
	getTextDefinitionsForLibraryCategory,
	getTextTemplateDownloadStatus,
	getTextTemplateResourceAccess,
	markTextTemplateDownloadFailed,
	markTextTemplateDownloaded,
	markTextTemplateUsed,
	parseTextLibraryState,
	retryTextTemplateDownload,
	toggleFavoriteTextTemplate,
} from "../text-library-state";
import type { TextTemplateDefinition } from "../text-template-registry";

const templateDefinitions = [
	createDefinition({ id: "first", category: "basic", downloaded: true }),
	createDefinition({ id: "second", category: "basic" }),
	createDefinition({ id: "third", category: "favorites" }),
	createDefinition({ id: "svip", category: "basic", premium: true }),
	createDefinition({
		id: "legacy-svip",
		category: "basic",
		premium: true,
		withResource: false,
	}),
] as const;

function createDefinition({
	id,
	category,
	downloaded = false,
	premium = false,
	withResource = true,
}: {
	id: string;
	category: TextTemplateDefinition["category"];
	downloaded?: boolean;
	premium?: boolean;
	withResource?: boolean;
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
		premium,
		downloaded,
		resource: withResource
			? {
					assetId: `text-new-text-${category}-${id}`,
					packageId: `text-new-text-${category}`,
					version: 1,
					entitlement: premium ? "svip" : "free",
					cacheKey: `text-assets/text-new-text-${category}/${id}@1`,
					sizeKb: premium ? 384 : 192,
				}
			: undefined,
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
					downloadRecords: [
						{
							templateId: "second",
							assetId: "asset-second",
							packageId: "package-basic",
							cacheKey: "text-assets/package-basic/second@1",
							version: 1,
							status: "cached",
							attemptCount: 1,
							updatedAt: 100,
						},
						{ templateId: "bad", status: "cached" },
					],
					hasSvipAccess: true,
				},
			})
		).toEqual({
			favoriteIds: ["first"],
			downloadedIds: ["second"],
			recentIds: ["third", "first"],
			downloadRecords: [
				{
					templateId: "second",
					assetId: "asset-second",
					packageId: "package-basic",
					cacheKey: "text-assets/package-basic/second@1",
					version: 1,
					status: "cached",
					attemptCount: 1,
					updatedAt: 100,
				},
			],
			hasSvipAccess: true,
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
			definition: templateDefinitions[1],
			now: 100,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});
		expect(downloaded.downloadRecords[0]).toMatchObject({
			templateId: "second",
			assetId: "text-new-text-basic-second",
			cacheKey: "text-assets/text-new-text-basic/second@1",
			status: "cached",
			attemptCount: 1,
			updatedAt: 100,
		});
		expect(
			markTextTemplateDownloaded({
				definition: templateDefinitions[1],
				now: 200,
				state: downloaded,
			}).downloadRecords[0]?.attemptCount
		).toBe(2);

		const recent = markTextTemplateUsed({
			state: { ...EMPTY_TEXT_LIBRARY_STATE, recentIds: ["first", "second"] },
			templateId: "second",
		});
		expect(recent.recentIds).toEqual(["second", "first"]);
	});

	it("tracks retryable download failures and SVIP access", () => {
		const svipDefinition = templateDefinitions[3];
		expect(
			getTextTemplateResourceAccess({
				definition: svipDefinition,
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toBe("svip-required");

		const failed = retryTextTemplateDownload({
			definition: svipDefinition,
			now: 100,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});
		expect(
			getTextTemplateDownloadStatus({
				definition: svipDefinition,
				state: failed,
			})
		).toBe("failed");
		expect(failed.downloadRecords[0]).toMatchObject({
			templateId: "svip",
			status: "failed",
			errorCode: "SVIP_REQUIRED",
		});

		const retried = retryTextTemplateDownload({
			definition: svipDefinition,
			now: 200,
			state: { ...failed, hasSvipAccess: true },
		});
		expect(
			getTextTemplateResourceAccess({
				definition: svipDefinition,
				state: retried,
			})
		).toBe("allowed");
		expect(
			getTextTemplateDownloadStatus({
				definition: svipDefinition,
				state: retried,
			})
		).toBe("cached");
		expect(retried.downloadRecords[0]?.attemptCount).toBe(2);

		const networkFailed = markTextTemplateDownloadFailed({
			definition: templateDefinitions[1],
			errorCode: "NETWORK_ERROR",
			now: 300,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});
		expect(networkFailed.downloadRecords[0]?.errorCode).toBe("NETWORK_ERROR");

		const legacySvipDefinition = templateDefinitions[4];
		expect(
			getTextTemplateResourceAccess({
				definition: legacySvipDefinition,
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toBe("svip-required");
		const legacyFailed = retryTextTemplateDownload({
			definition: legacySvipDefinition,
			now: 400,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});
		expect(legacyFailed.downloadRecords[0]).toMatchObject({
			templateId: "legacy-svip",
			assetId: "text-legacy-legacy-svip",
			status: "failed",
			errorCode: "SVIP_REQUIRED",
		});
	});

	it("treats stale download records as remote assets after resource upgrades", () => {
		const currentResource = templateDefinitions[1].resource;
		if (!currentResource) throw new Error("Expected resource metadata");
		const downloaded = markTextTemplateDownloaded({
			definition: templateDefinitions[1],
			now: 100,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});
		const upgradedDefinition: TextTemplateDefinition = {
			...templateDefinitions[1],
			resource: {
				...currentResource,
				version: 2,
				cacheKey: "text-assets/text-new-text-basic/second@2",
			},
		};

		expect(
			getTextTemplateDownloadStatus({
				definition: templateDefinitions[1],
				state: downloaded,
			})
		).toBe("cached");
		expect(
			getTextTemplateDownloadStatus({
				definition: upgradedDefinition,
				state: downloaded,
			})
		).toBe("remote");
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
