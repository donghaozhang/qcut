import { describe, expect, it } from "vitest";
import {
	GENERATED_TEXT_ASSET_PROVENANCE,
	buildTextAssetPackagePayload,
	buildTextAssetSourcePayload,
	buildTextAssetThumbnailSvg,
	buildTextMarketplaceConfigPayload,
} from "../generate-text-assets";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	getTextTemplateDefinitionsByCategory,
} from "../../src/lib/text/text-template-registry";

function firstDefinition({
	category,
}: {
	category: Parameters<
		typeof getTextTemplateDefinitionsByCategory
	>[0]["category"];
}) {
	const definition = getTextTemplateDefinitionsByCategory({ category })[0];
	if (!definition)
		throw new Error(`Missing text template category ${category}`);
	return definition;
}

describe("text asset generator payloads", () => {
	it("embeds multi-element template packs in template source payloads", () => {
		const definition = firstDefinition({ category: "headline-template" });
		const source = buildTextAssetSourcePayload({ definition });

		expect(source.templatePack).toMatchObject({
			category: "headline-template",
			copySlots: [
				expect.objectContaining({ elementIndex: 0, id: "kicker" }),
				expect.objectContaining({ elementIndex: 1, id: "headline" }),
				expect.objectContaining({ elementIndex: 2, id: "subhead" }),
			],
			elements: [
				expect.objectContaining({ content: "本期重点", type: "text" }),
				expect.objectContaining({ content: definition.content, type: "text" }),
				expect.objectContaining({ content: "三句话讲清楚", type: "text" }),
			],
			id: `pack-${definition.id}`,
		});
	});

	it("renders static pack thumbnails from actual template pack copy", () => {
		const expectations = [
			{
				category: "headline-template",
				labels: ["本期重点", "三句话讲清楚"],
			},
			{
				category: "quote-template",
				labels: ["观点摘录"],
			},
			{
				category: "list-template",
				labels: ["关键动作", "避坑提醒"],
			},
			{
				category: "split-template",
				labels: ["之前", "之后", "VS"],
			},
			{
				category: "timeline-template",
				labels: ["阶段", "结果"],
			},
		] as const;

		for (const expectation of expectations) {
			const definition = firstDefinition({ category: expectation.category });
			const svg = buildTextAssetThumbnailSvg({ definition });

			expect(svg).toContain('data-qcut-pack-preview="true"');
			expect(svg).toContain('data-layer-count="3"');
			expect(svg).toContain("data-decoration-count=");
			expect(svg).toContain("data-preview-decoration=");
			for (const label of expectation.labels) {
				expect(svg).toContain(label);
			}
			expect(svg).not.toContain('<rect x="104" y="140"');
		}
	});

	it("renders static pack thumbnail structural decorations by template type", () => {
		const expectations = [
			{
				category: "headline-template",
				decorations: ["headline-panel", "headline-rule"],
			},
			{
				category: "list-template",
				decorations: ["list-rail", "list-node-1", "list-node-2"],
			},
			{
				category: "split-template",
				decorations: ["split-divider"],
			},
			{
				category: "timeline-template",
				decorations: [
					"timeline-rail",
					"timeline-node-1",
					"timeline-node-2",
					"timeline-node-3",
				],
			},
		] as const;

		for (const expectation of expectations) {
			const definition = firstDefinition({ category: expectation.category });
			const svg = buildTextAssetThumbnailSvg({ definition });

			expect(svg).toContain(
				`data-decoration-count="${expectation.decorations.length}"`
			);
			for (const decoration of expectation.decorations) {
				expect(svg).toContain(`data-preview-decoration="${decoration}"`);
			}
		}
	});

	it("keeps single-style text assets as single-template payloads", () => {
		const source = buildTextAssetSourcePayload({
			definition: firstDefinition({ category: "red" }),
		});

		expect(source.templatePack).toBeUndefined();
		expect(source.template).toMatchObject({ type: "text" });
	});

	it("embeds companion file checksums in qctext packages", () => {
		const definition = firstDefinition({ category: "red" });
		const source = buildTextAssetSourcePayload({ definition });
		const payload = buildTextAssetPackagePayload({
			definition,
			resources: [
				{
					byteSize: 4096,
					checksumSha256: "a".repeat(64),
					mimeType: "image/webp",
					path: "thumbnail.webp",
					role: "thumbnail",
					url: "/text-assets/text-fancy-red/plain@1/thumbnail.webp",
				},
				{
					byteSize: 8192,
					checksumSha256: "b".repeat(64),
					mimeType: "application/json",
					path: "template.json",
					role: "source",
					url: "/text-assets/text-fancy-red/plain@1/template.json",
				},
			],
			source,
		});

		expect(payload).toMatchObject({
			assetId: source.assetId,
			files: {
				source: "template.json",
				thumbnail: "thumbnail.webp",
			},
			kind: "qcut-text-template-package",
			resources: [
				{
					byteSize: 4096,
					checksumSha256: "a".repeat(64),
					mimeType: "image/webp",
					path: "thumbnail.webp",
					role: "thumbnail",
				},
				{
					byteSize: 8192,
					checksumSha256: "b".repeat(64),
					mimeType: "application/json",
					path: "template.json",
					role: "source",
				},
			],
		});
	});

	it("keeps decorative thumbnails transparent and visually distinct", () => {
		const definitions = getTextTemplateDefinitionsByCategory({
			category: "basic",
		});
		const plain = definitions.find(
			(definition) => definition.variantId === "plain"
		);
		const outline = definitions.find(
			(definition) => definition.variantId === "outline"
		);
		if (!plain || !outline) {
			throw new Error("Expected basic text thumbnail fixtures");
		}

		const plainSvg = buildTextAssetThumbnailSvg({ definition: plain });
		const outlineSvg = buildTextAssetThumbnailSvg({ definition: outline });

		expect(plainSvg).not.toBe(outlineSvg);
		expect(plainSvg).not.toContain('<rect width="320" height="304"');
		expect(outlineSvg).not.toContain('<rect width="320" height="304"');
	});

	it("keeps scene backdrops for semantic packaging thumbnails", () => {
		const definition = firstDefinition({ category: "cover-pack" });

		expect(buildTextAssetThumbnailSvg({ definition })).toContain(
			'<rect width="320" height="304"'
		);
	});

	it("exposes stable generated provenance for generated text assets", () => {
		expect(GENERATED_TEXT_ASSET_PROVENANCE).toEqual({
			source: "generated",
			pipeline: "qcut-canvas-thumbnail-v1",
		});
	});

	it("builds a remote marketplace config payload from generated definitions", () => {
		const definition = firstDefinition({ category: "red" });
		const payload = buildTextMarketplaceConfigPayload({
			definitions: [definition],
		});

		expect(payload).toMatchObject({
			assets: [
				{
					assetId: definition.resource?.assetId,
					editorialRank: expect.any(Number),
					heatScore: expect.any(Number),
					remoteTags: expect.arrayContaining([
						`category:${definition.category}`,
					]),
					searchAliases: expect.any(Array),
					templateId: definition.id,
				},
			],
			schemaVersion: 1,
		});
		expect(payload.sections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: "recommended",
					templateIds: expect.arrayContaining([definition.id]),
					title: "推荐",
				}),
			])
		);
	});

	it("builds marketplace config entries for every text asset definition", () => {
		const payload = buildTextMarketplaceConfigPayload({
			definitions: TEXT_TEMPLATE_DEFINITIONS,
		});

		expect(payload.assets).toHaveLength(TEXT_TEMPLATE_DEFINITIONS.length);
		expect(payload.assets.map((asset) => asset.assetId)).toEqual(
			expect.arrayContaining(["text-legacy-heading-text"])
		);
	});

	it("builds marketplace recommendation sections from known text assets", () => {
		const payload = buildTextMarketplaceConfigPayload({
			definitions: TEXT_TEMPLATE_DEFINITIONS,
		});
		const assetTemplateIds = new Set(
			payload.assets.map((asset) => asset.templateId)
		);

		expect(payload.sections.map((section) => section.id)).toEqual([
			"recommended",
			"commerce",
			"cover",
			"premium-look",
		]);
		for (const section of payload.sections) {
			expect(section.templateIds.length).toBeGreaterThan(0);
			expect(section.templateIds.length).toBeLessThanOrEqual(30);
			expect(new Set(section.templateIds).size).toBe(
				section.templateIds.length
			);
			expect(
				section.templateIds.every((templateId) =>
					assetTemplateIds.has(templateId)
				)
			).toBe(true);
		}
	});
});
