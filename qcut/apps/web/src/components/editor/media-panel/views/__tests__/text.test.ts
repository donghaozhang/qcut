import { describe, expect, it } from "vitest";
import {
	EMPTY_TEXT_LIBRARY_STATE,
	markTextTemplateDownloaded,
} from "@/lib/text/text-library-state";
import {
	getTextTemplateDefinitionsByCategory,
	type TextTemplateDefinition,
} from "@/lib/text/text-template-registry";
import type { AssetRuntimeState } from "@qcut/editor-core";

type RemoteTextRuntimeRole = "thumbnail" | "source" | "package";
import {
	applyTextTemplatePackBatchCopyText,
	applyTextTemplatePackCopyPaste,
	applyTextTemplatePackCopyValues,
	buildTextTemplateDragData,
	getTextTemplateBatchCacheTargets,
	getTextTemplateAccessibilityLabel,
	getTextTemplateAssetProvenanceBadge,
	getTextTemplateCardThumbnailPreview,
	getTextTemplatePackCopyDefaults,
	getTextTemplatePackCopyActionLabel,
	getTextTemplatePackCopyBadgeLabel,
	getTextTemplatePackLayerBadgeLabel,
	getTextTemplateRuntimeDownloadStatus,
	getExpandedTextTemplateGridColumnCount,
	getTextTemplateGridColumnCount,
	matchesMarketplaceFilter,
	sortTextDefinitionsForBrowsing,
} from "../text";
import { buildTextTemplatePack } from "@/lib/text/text-template-packs";

function createRemoteOnlyDefinition(): TextTemplateDefinition {
	return {
		id: "remote-only-text",
		name: "Remote only text",
		category: "red",
		groupId: "fancy",
		variantId: "plain",
		content: "花字",
		stylePresetId: "clean-white",
		keywords: ["remote"],
		premium: false,
		downloaded: false,
		resource: {
			assetId: "text-remote-only",
			packageId: "text-remote-only",
			version: 1,
			entitlement: "free",
			cacheKey: "text-assets/text-remote-only/plain@1",
			sizeKb: 128,
		},
		catalogVisible: true,
	};
}

function createRemoteTextRuntime({
	cachedFiles = ["thumbnail", "source", "package"],
}: {
	cachedFiles?: readonly RemoteTextRuntimeRole[];
} = {}): Record<string, AssetRuntimeState> {
	const assetKey = "text-template:text-remote-only@1";
	const fileByRole = {
		thumbnail: {
			cacheKey: `${assetKey}:thumbnail:0`,
			fromCache: true,
			role: "thumbnail",
			url: "https://assets.qcut.app/text-assets/text-remote-only/plain@1/thumbnail.webp",
		},
		source: {
			cacheKey: `${assetKey}:source:1`,
			fromCache: true,
			role: "source",
			url: "https://assets.qcut.app/text-assets/text-remote-only/plain@1/template.json",
		},
		package: {
			cacheKey: `${assetKey}:package:2`,
			fromCache: true,
			role: "package",
			url: "https://assets.qcut.app/text-assets/text-remote-only/plain@1/template.qctext",
		},
	} satisfies Record<
		RemoteTextRuntimeRole,
		NonNullable<AssetRuntimeState["cachedFiles"]>[number]
	>;
	return {
		[assetKey]: {
			assetKey,
			cacheStatus: "cached",
			downloadStatus: "downloaded",
			favorite: false,
			progress: 1,
			cachedFileCount: cachedFiles.length,
			cachedFiles: cachedFiles.map((role) => fileByRole[role]),
		},
	};
}

describe("text view layout", () => {
	it("keeps the asset grid at four or five columns for typical panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 520 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 460 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 380 })).toBe(4);
		expect(getTextTemplateGridColumnCount({ width: 320 })).toBe(4);
	});

	it("falls back gracefully below normal editor panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 260 })).toBe(3);
		expect(getTextTemplateGridColumnCount({ width: 180 })).toBe(2);
	});

	it("caps the expanded asset browser at screenshot-like grid density", () => {
		expect(getExpandedTextTemplateGridColumnCount({ width: 920 })).toBe(5);
		expect(getExpandedTextTemplateGridColumnCount({ width: 680 })).toBe(5);
		expect(getExpandedTextTemplateGridColumnCount({ width: 560 })).toBe(5);
		expect(getExpandedTextTemplateGridColumnCount({ width: 520 })).toBe(4);
		expect(getExpandedTextTemplateGridColumnCount({ width: 320 })).toBe(3);
		expect(getExpandedTextTemplateGridColumnCount({ width: 240 })).toBe(2);
	});

	it("applies marketplace overrides when sorting browse categories", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		const plain = definitions.find(
			(definition) => definition.variantId === "plain"
		);
		const redBurst = definitions.find(
			(definition) => definition.variantId === "red-burst"
		);
		if (!plain || !redBurst) throw new Error("Expected red text fixtures");

		expect(
			sortTextDefinitionsForBrowsing({
				categoryId: "red",
				definitions,
				marketplaceOverrides: {
					[plain.id]: { editorialRank: 1, heatScore: 100 },
					[redBurst.id]: { editorialRank: 40 },
				},
			})[0]?.id
		).toBe(plain.id);
	});

	it("matches marketplace operation filters from tags and remote overrides", () => {
		const redBurst = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((definition) => definition.variantId === "red-burst");
		const texture = getTextTemplateDefinitionsByCategory({
			category: "texture",
		}).find((definition) => definition.variantId === "texture-grain");
		const plain = getTextTemplateDefinitionsByCategory({
			category: "basic",
		})[0];
		if (!redBurst || !texture || !plain) {
			throw new Error("Expected text marketplace fixtures");
		}

		expect(
			matchesMarketplaceFilter({
				definition: redBurst,
				filter: "commerce",
			})
		).toBe(true);
		expect(
			matchesMarketplaceFilter({
				definition: redBurst,
				filter: "cover",
			})
		).toBe(true);
		expect(
			matchesMarketplaceFilter({
				definition: texture,
				filter: "premium-look",
			})
		).toBe(true);
		expect(
			matchesMarketplaceFilter({
				definition: plain,
				filter: "commerce",
				marketplaceOverrides: {
					[plain.id]: {
						remoteTags: ["scene:commerce"],
						searchAliases: ["带货"],
					},
				},
			})
		).toBe(true);
		expect(
			matchesMarketplaceFilter({
				definition: plain,
				filter: "commerce",
			})
		).toBe(false);
	});

	it("includes grouped template payloads for multi-element text drags", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const dragData = buildTextTemplateDragData({ definition });

		expect(dragData.textTemplate).toMatchObject({
			id: definition.id,
			type: "text",
		});
		expect(dragData.textTemplatePack?.id).toContain(definition.id);
		expect(dragData.textTemplatePack?.name).toContain(definition.name);
		expect(dragData.textTemplatePack?.category).toBe(definition.category);
		expect(
			dragData.textTemplatePack?.copySlots?.map((slot) => slot.id)
		).toEqual(["kicker", "headline", "subhead"]);
		expect(dragData.textTemplatePack?.elements.length).toBeGreaterThan(1);
	});

	it("keeps single text template drags compatible with older drop paths", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "basic",
		})[0];

		expect(buildTextTemplateDragData({ definition }).textTemplatePack).toBe(
			undefined
		);
	});

	it("builds editable copy defaults for multi-element template packs", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const pack = buildTextTemplatePack({ definition });
		if (!pack) throw new Error("Expected headline template pack");

		expect(
			getTextTemplatePackCopyDefaults({ copySlots: pack.copySlots })
		).toEqual(["本期重点", definition.content, "三句话讲清楚"]);
		expect(
			applyTextTemplatePackCopyValues({
				copyValues: ["开场提醒", "新标题", "新副标题"],
				pack,
			}).elements.map((element) => element.content)
		).toEqual(["开场提醒", "新标题", "新副标题"]);
	});

	it("distributes multi-line pasted copy across template pack slots", () => {
		expect(
			applyTextTemplatePackCopyPaste({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				pastedText: "开场提醒\n新标题\n新副标题",
				startIndex: 0,
			})
		).toEqual({
			handled: true,
			values: ["开场提醒", "新标题", "新副标题"],
		});

		expect(
			applyTextTemplatePackCopyPaste({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				pastedText: "新标题\n新副标题\n多余行",
				startIndex: 1,
			})
		).toEqual({
			handled: true,
			values: ["本期重点", "新标题", "新副标题"],
		});
	});

	it("leaves single-line pasted copy to the native input behavior", () => {
		expect(
			applyTextTemplatePackCopyPaste({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				pastedText: "只有一行",
				startIndex: 0,
			})
		).toEqual({
			handled: false,
			values: ["本期重点", "旧标题", "旧副标题"],
		});
	});

	it("applies explicit batch copy text across template pack slots", () => {
		expect(
			applyTextTemplatePackBatchCopyText({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				text: "开场提醒\n新标题\n新副标题\n多余行",
			})
		).toEqual(["开场提醒", "新标题", "新副标题"]);

		expect(
			applyTextTemplatePackBatchCopyText({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				text: "开场提醒\n\n新副标题",
			})
		).toEqual(["开场提醒", "", "新副标题"]);

		expect(
			applyTextTemplatePackBatchCopyText({
				currentValues: ["本期重点", "旧标题", "旧副标题"],
				text: "新标题",
			})
		).toEqual(["新标题", "旧标题", "旧副标题"]);
	});

	it("uses live pack previews for multi-element template cards", () => {
		const packDefinition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const pack = buildTextTemplatePack({ definition: packDefinition });
		const packPreview = getTextTemplateCardThumbnailPreview({
			templatePack: pack,
			thumbnailUrl:
				"/text-assets/text-templates-headline-template/editorial-title@1/thumbnail.webp",
		});
		const plainPreview = getTextTemplateCardThumbnailPreview({
			templatePack: null,
			thumbnailUrl: "/text-assets/text-fancy-red/fire@1/thumbnail.webp",
		});

		expect(packPreview).toEqual({ pack });
		expect(plainPreview).toEqual({
			thumbnailUrl: "/text-assets/text-fancy-red/fire@1/thumbnail.webp",
		});
	});

	it("labels single and grouped text templates distinctly", () => {
		expect(
			getTextTemplateAccessibilityLabel({
				isPack: false,
				templateName: "基础文字",
			})
		).toBe("添加文字模板 基础文字");
		expect(
			getTextTemplateAccessibilityLabel({
				isPack: true,
				slotLabels: ["开场", "主标题", "副标题"],
				templateName: "标题组合",
			})
		).toBe("添加组合文字模板 标题组合，可替换：开场、主标题、副标题");
		expect(
			getTextTemplateAccessibilityLabel({
				isPack: true,
				templateName: "标题组合",
			})
		).toBe("添加组合文字模板 标题组合");
		expect(getTextTemplatePackCopyActionLabel({ slotCount: 3 })).toBe(
			"替换 3 个模板文案"
		);
		expect(getTextTemplatePackCopyActionLabel({ slotCount: 0 })).toBe(
			"替换模板文案"
		);
	});

	it("labels grouped text template badges with layer and copy counts", () => {
		expect(getTextTemplatePackLayerBadgeLabel({ elementCount: 3 })).toBe(
			"3 层组合"
		);
		expect(getTextTemplatePackLayerBadgeLabel({ elementCount: 0 })).toBe(
			"组合模板"
		);
		expect(getTextTemplatePackCopyBadgeLabel({ slotCount: 3 })).toBe(
			"3 个可替换文案"
		);
		expect(getTextTemplatePackCopyBadgeLabel({ slotCount: 0 })).toBe(
			"可替换文案"
		);
	});

	it("labels generated fallback and designer-imported text assets distinctly", () => {
		expect(
			getTextTemplateAssetProvenanceBadge({
				provenance: { source: "generated" },
			})
		).toEqual({
			label: "生成兜底素材",
			source: "generated",
		});
		expect(
			getTextTemplateAssetProvenanceBadge({
				provenance: { source: "designer-imported" },
			})
		).toEqual({
			label: "设计师素材",
			source: "designer-imported",
		});
		expect(
			getTextTemplateAssetProvenanceBadge({
				provenance: { source: "unknown" },
			})
		).toBeUndefined();
	});

	it("treats bundled generated text resources as cached in the grid", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((candidate) => !candidate.downloaded && !candidate.premium);
		if (!definition)
			throw new Error("Expected a bundled generated text fixture");

		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: {},
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toBe("cached");
	});

	it("keeps bundled SVIP text resources locked until access is available", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((candidate) => candidate.premium);
		if (!definition) throw new Error("Expected a premium text fixture");

		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: {},
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toBe("failed");
		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: {},
				state: {
					...EMPTY_TEXT_LIBRARY_STATE,
					hasSvipAccess: true,
				},
			})
		).toBe("cached");
	});

	it("keeps unknown remote-only text resources downloadable", () => {
		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition: createRemoteOnlyDefinition(),
				runtimeByAssetKey: {},
				state: EMPTY_TEXT_LIBRARY_STATE,
			})
		).toBe("remote");
	});

	it("requires complete cached remote resource files before showing downloaded", () => {
		const definition = createRemoteOnlyDefinition();
		const downloadedState = markTextTemplateDownloaded({
			definition,
			now: 100,
			state: EMPTY_TEXT_LIBRARY_STATE,
		});

		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: {},
				state: downloadedState,
			})
		).toBe("remote");

		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: createRemoteTextRuntime(),
				state: downloadedState,
			})
		).toBe("cached");

		expect(
			getTextTemplateRuntimeDownloadStatus({
				definition,
				runtimeByAssetKey: createRemoteTextRuntime({
					cachedFiles: ["thumbnail", "source"],
				}),
				state: downloadedState,
			})
		).toBe("remote");
	});

	it("selects only cacheable visible templates for batch caching", () => {
		const localDefinition = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((candidate) => !candidate.premium);
		const premiumDefinition = getTextTemplateDefinitionsByCategory({
			category: "red",
		}).find((candidate) => candidate.premium);
		const remoteDefinition = createRemoteOnlyDefinition();
		if (!localDefinition || !premiumDefinition) {
			throw new Error("Expected text cache fixtures");
		}

		expect(
			getTextTemplateBatchCacheTargets({
				definitions: [localDefinition, premiumDefinition, remoteDefinition],
				libraryState: EMPTY_TEXT_LIBRARY_STATE,
				online: false,
				runtimeByAssetKey: {},
			}).map((definition) => definition.id)
		).toEqual([]);

		expect(
			getTextTemplateBatchCacheTargets({
				definitions: [remoteDefinition],
				libraryState: EMPTY_TEXT_LIBRARY_STATE,
				online: true,
				runtimeByAssetKey: {
					"text-template:text-remote-only@1": {
						assetKey: "text-template:text-remote-only@1",
						cacheStatus: "caching",
						downloadStatus: "downloading",
						favorite: false,
						progress: 0.4,
					},
				},
			})
		).toEqual([]);
		expect(
			getTextTemplateBatchCacheTargets({
				definitions: [remoteDefinition],
				libraryState: EMPTY_TEXT_LIBRARY_STATE,
				online: true,
				runtimeByAssetKey: createRemoteTextRuntime({
					cachedFiles: ["thumbnail", "source", "package"],
				}),
			})
		).toEqual([]);
		expect(
			getTextTemplateBatchCacheTargets({
				definitions: [remoteDefinition],
				libraryState: EMPTY_TEXT_LIBRARY_STATE,
				online: true,
				runtimeByAssetKey: {},
			})
		).toEqual([remoteDefinition]);
	});
});
