// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createEmptyJianyingTextEffectCapabilities } from "../jianying-text-effect-capabilities.js";
import type { JianyingTextStylePackageKind } from "../jianying-text-style-lab-contract.js";
import type { JianyingTextStyleCatalogEntry } from "../jianying-text-style-lab-catalog.js";
import { classifyLocalJianyingTextStyles } from "../jianying-text-style-local-categories.js";
import type { JianyingTextPackageOwnership } from "../jianying-text-package-ownership.js";

function catalogEntry({
	packageKind,
	styleId,
}: {
	packageKind: JianyingTextStylePackageKind;
	styleId: string;
}): JianyingTextStyleCatalogEntry {
	const [resourceId, version] = styleId.split("/");
	return {
		styleId,
		resourceId,
		version,
		packageKind,
		packageVersion: "1",
		fillKind: "unknown",
		strokeCount: 0,
		innerShadowCount: 0,
		shadowCount: 0,
		textureLayerCount: 0,
		capabilities: createEmptyJianyingTextEffectCapabilities(),
		diagnostics: [],
		hasCover: true,
		compatibility: "native-runtime",
	};
}

function ownership({
	kind,
	title,
}: {
	kind: JianyingTextPackageOwnership["kind"];
	title?: string;
}): JianyingTextPackageOwnership {
	return {
		kind,
		match: kind === "unclassified" ? "none" : "exact",
		catalogFamilies: [],
		...(title ? { title } : {}),
	};
}

describe("Jianying local text style categories", () => {
	it("classifies missing flower, script-template, and component metadata", () => {
		const existing = catalogEntry({
			styleId: `100/${"a".repeat(32)}`,
			packageKind: "TextStyle",
		});
		const flower = catalogEntry({
			styleId: `200/${"b".repeat(32)}`,
			packageKind: "InfoSticker",
		});
		const script = catalogEntry({
			styleId: `300/${"c".repeat(32)}`,
			packageKind: "ScriptInfoSticker",
		});
		const component = catalogEntry({
			styleId: `400/${"d".repeat(32)}`,
			packageKind: "TextStyle",
		});
		const unknown = catalogEntry({
			styleId: `500/${"e".repeat(32)}`,
			packageKind: "TextStyle",
		});
		const result = classifyLocalJianyingTextStyles({
			entries: [existing, flower, script, component, unknown],
			ownership: new Map([
				[flower.styleId, ownership({ kind: "flower", title: "本机花字" })],
				[script.styleId, ownership({ kind: "non-flower", title: "脚本模板" })],
				[
					component.styleId,
					ownership({ kind: "component", title: "样式组件" }),
				],
				[unknown.styleId, ownership({ kind: "unclassified" })],
			]),
			resolvedMetadata: {
				metadata: new Map([
					[
						existing.styleId,
						{ title: "已有分类", categoryIds: ["popular" as const] },
					],
				]),
				categories: [
					{
						id: "popular",
						sourceId: "10721",
						label: "热门",
						groupId: "charts",
						order: 0,
					},
				],
				categoryGroups: [
					{
						id: "charts",
						label: "榜单",
						categoryIds: ["popular"],
						order: 0,
					},
				],
			},
		});

		expect(result.metadata.get(existing.styleId)).toEqual({
			title: "已有分类",
			categoryIds: ["popular"],
		});
		expect(result.metadata.get(flower.styleId)).toEqual({
			title: "本机花字",
			categoryIds: ["source-qcut-local-flower"],
		});
		expect(result.metadata.get(script.styleId)?.categoryIds).toEqual([
			"source-qcut-script-template",
		]);
		expect(result.metadata.get(component.styleId)?.categoryIds).toEqual([
			"source-qcut-style-component",
		]);
		expect(result.metadata.has(unknown.styleId)).toBe(false);
		expect(
			result.categories.slice(-3).map(({ id, label }) => ({ id, label }))
		).toEqual([
			{ id: "source-qcut-local-flower", label: "本机花字" },
			{ id: "source-qcut-script-template", label: "脚本模板" },
			{ id: "source-qcut-style-component", label: "样式组件" },
		]);
		expect(result.categoryGroups.at(-1)).toMatchObject({
			id: "qcut-local",
			label: "本机补充",
			categoryIds: [
				"source-qcut-local-flower",
				"source-qcut-script-template",
				"source-qcut-style-component",
			],
		});
	});
});
