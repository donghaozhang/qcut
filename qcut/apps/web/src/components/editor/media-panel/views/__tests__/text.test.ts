import { describe, expect, it } from "vitest";
import { EMPTY_TEXT_LIBRARY_STATE } from "@/lib/text/text-library-state";
import {
	getTextTemplateDefinitionsByCategory,
	type TextTemplateDefinition,
} from "@/lib/text/text-template-registry";
import {
	applyTextTemplatePackCopyValues,
	buildTextTemplateDragData,
	getTextTemplateAccessibilityLabel,
	getTextTemplatePackCopyDefaults,
	getTextTemplateRuntimeDownloadStatus,
	getExpandedTextTemplateGridColumnCount,
	getTextTemplateGridColumnCount,
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

	it("uses the expanded asset browser grid density for wide browsing", () => {
		expect(getExpandedTextTemplateGridColumnCount()).toBe(5);
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
				templateName: "标题组合",
			})
		).toBe("添加组合文字模板 标题组合");
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
});
