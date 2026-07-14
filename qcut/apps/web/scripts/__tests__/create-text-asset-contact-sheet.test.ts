import { describe, expect, it } from "vitest";
import {
	buildTextAssetContactSheetModel,
	parseTextAssetContactSheetArgs,
	renderTextAssetContactSheetHtml,
} from "../create-text-asset-contact-sheet";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

function createGeneratedEntry({
	assetId,
	packageId,
	source = "generated",
}: {
	assetId: string;
	packageId: string;
	source?: "designer-imported" | "generated";
}): TextAssetGeneratedEntry {
	const cacheKey = `text-assets/${packageId}/plain@1`;
	return {
		assetId,
		cacheKey,
		packageId,
		provenance: {
			pipeline:
				source === "generated"
					? "qcut-canvas-thumbnail-v1"
					: "designer-pack-v1",
			source,
		},
		source: {
			byteSize: 2,
			checksumSha256: "source-sha",
			mimeType: "application/json",
			url: `/${cacheKey}/template.json`,
		},
		thumbnail: {
			byteSize: 1,
			checksumSha256: "thumb-sha",
			mimeType: "image/webp",
			url: `/${cacheKey}/thumbnail.webp`,
		},
		version: 1,
	};
}

describe("text asset contact sheet script", () => {
	it("parses contact sheet options", () => {
		expect(
			parseTextAssetContactSheetArgs({
				argv: [
					"--reset-categories",
					"--category",
					"red",
					"--category",
					"red",
					"--category",
					"headline-template",
					"--asset-base-path",
					"../public",
					"--generated-manifest",
					"/tmp/generated.json",
					"--out",
					"/tmp/contact.html",
					"--per-category-limit",
					"2",
				],
			})
		).toEqual({
			assetBasePath: "../public",
			categoryIds: ["red", "headline-template"],
			generatedManifestPath: "/tmp/generated.json",
			outPath: "/tmp/contact.html",
			perCategoryLimit: 2,
		});
	});

	it("selects category assets with local thumbnail paths", () => {
		const model = buildTextAssetContactSheetModel({
			assetBasePath: "../public",
			categoryIds: ["red", "headline-template", "missing"],
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: {
				"text-headline": createGeneratedEntry({
					assetId: "text-headline",
					packageId: "text-templates-headline-template",
					source: "designer-imported",
				}),
				"text-red-a": createGeneratedEntry({
					assetId: "text-red-a",
					packageId: "text-fancy-red",
				}),
				"text-red-b": createGeneratedEntry({
					assetId: "text-red-b",
					packageId: "text-fancy-red",
				}),
				"text-red-c": createGeneratedEntry({
					assetId: "text-red-c",
					packageId: "text-fancy-red",
				}),
			},
			perCategoryLimit: 2,
		});

		expect(model.totalItems).toBe(3);
		expect(model.provenance).toMatchObject({
			designerImported: 1,
			generated: 3,
		});
		expect(model.categories).toEqual([
			expect.objectContaining({
				category: "red",
				items: [
					expect.objectContaining({
						assetId: "text-red-a",
						imageSrc:
							"../public/text-assets/text-fancy-red/plain@1/thumbnail.webp",
					}),
					expect.objectContaining({
						assetId: "text-red-b",
					}),
				],
			}),
			expect.objectContaining({
				category: "headline-template",
				items: [
					expect.objectContaining({
						assetId: "text-headline",
						provenance: "designer-imported",
					}),
				],
			}),
			expect.objectContaining({
				category: "missing",
				items: [],
			}),
		]);
	});

	it("renders a static reviewable HTML contact sheet", () => {
		const model = buildTextAssetContactSheetModel({
			assetBasePath: "../public",
			categoryIds: ["red"],
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: {
				"text-red-a": createGeneratedEntry({
					assetId: "text-red-a",
					packageId: "text-fancy-red",
				}),
			},
			perCategoryLimit: 5,
		});

		expect(renderTextAssetContactSheetHtml({ model })).toContain(
			"QCut Text Asset Contact Sheet"
		);
		expect(renderTextAssetContactSheetHtml({ model })).toContain(
			"../public/text-assets/text-fancy-red/plain@1/thumbnail.webp"
		);
		expect(renderTextAssetContactSheetHtml({ model })).toContain("red · 1");
	});
});
