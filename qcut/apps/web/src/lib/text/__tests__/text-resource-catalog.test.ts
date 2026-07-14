import { describe, expect, it } from "vitest";
import {
	DEFAULT_TEXT_ASSET_REMOTE_BASE_URL,
	buildTextTemplateResourcePackages,
	getTextTemplateCatalogThumbnailUrl,
	getTextTemplateResource,
	getTextTemplateResourceFiles,
} from "../text-resource-catalog";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	type TextTemplateDefinition,
} from "../text-template-registry";

function createDefinition({
	category = "basic",
	id,
	packageId,
	premium = false,
	withResource = true,
}: {
	category?: TextTemplateDefinition["category"];
	id: string;
	packageId?: string;
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
		keywords: [id, category, "text", "resource", "test"],
		premium,
		downloaded: false,
		resource: withResource
			? {
					assetId: `asset-${id}`,
					packageId: packageId ?? `package-${category}`,
					version: premium ? 2 : 1,
					entitlement: premium ? "svip" : "free",
					cacheKey: `text-assets/${packageId ?? `package-${category}`}/${id}@1`,
					sizeKb: premium ? 384 : 128,
				}
			: undefined,
		catalogVisible: true,
	};
}

describe("text resource catalog", () => {
	it("resolves explicit and legacy template resources", () => {
		expect(
			getTextTemplateResource({
				definition: createDefinition({ id: "explicit", packageId: "pack-a" }),
			})
		).toMatchObject({
			assetId: "asset-explicit",
			packageId: "pack-a",
			entitlement: "free",
		});
		expect(
			getTextTemplateResource({
				definition: createDefinition({
					id: "legacy-premium",
					premium: true,
					withResource: false,
				}),
			})
		).toMatchObject({
			assetId: "text-legacy-legacy-premium",
			packageId: "text-new-text-basic",
			entitlement: "svip",
			sizeKb: 384,
		});
	});

	it("builds deterministic file URLs for resource records", () => {
		expect(
			getTextTemplateResourceFiles({
				definition: createDefinition({ id: "poster", packageId: "pack-a" }),
			})
		).toEqual({
			thumbnailUrl:
				"https://assets.qcut.app/text-assets/pack-a/poster@1/thumbnail.webp",
			sourceUrl:
				"https://assets.qcut.app/text-assets/pack-a/poster@1/template.json",
			packageUrl:
				"https://assets.qcut.app/text-assets/pack-a/poster@1/template.qctext",
			byteSize: 128 * 1024,
			thumbnailByteSize: Math.round(128 * 1024 * 0.18),
			sourceByteSize: 128 * 1024,
			packageByteSize: 128 * 1024,
			bundled: false,
		});
		expect(DEFAULT_TEXT_ASSET_REMOTE_BASE_URL).toBe("https://assets.qcut.app");
		expect(
			getTextTemplateResourceFiles({
				definition: createDefinition({ id: "poster", packageId: "pack-a" }),
				remoteBaseUrl: "https://cdn.example.test/assets/",
			})
		).toMatchObject({
			thumbnailUrl:
				"https://cdn.example.test/assets/text-assets/pack-a/poster@1/thumbnail.webp",
			sourceUrl:
				"https://cdn.example.test/assets/text-assets/pack-a/poster@1/template.json",
			packageUrl:
				"https://cdn.example.test/assets/text-assets/pack-a/poster@1/template.qctext",
		});
	});

	it("resolves generated bundled file metadata for downloaded templates", () => {
		const downloadedDefinition = TEXT_TEMPLATE_DEFINITIONS.find(
			(definition) => definition.downloaded
		);

		expect(downloadedDefinition).toBeDefined();
		expect(
			getTextTemplateResourceFiles({
				definition: downloadedDefinition as TextTemplateDefinition,
			})
		).toMatchObject({
			thumbnailUrl: expect.stringMatching(
				/^\/text-assets\/.+\/thumbnail\.webp$/
			),
			sourceUrl: expect.stringMatching(/^\/text-assets\/.+\/template\.json$/),
			packageUrl: expect.stringMatching(
				/^\/text-assets\/.+\/template\.qctext$/
			),
			bundled: true,
			thumbnailChecksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			sourceChecksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
			packageChecksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
		});
	});

	it("uses bundled generated files for not-downloaded templates when available", () => {
		const bundledDefinition = TEXT_TEMPLATE_DEFINITIONS.find(
			(definition) => definition.category === "red" && !definition.downloaded
		);

		expect(bundledDefinition).toBeDefined();
		expect(
			getTextTemplateResourceFiles({
				definition: bundledDefinition as TextTemplateDefinition,
			})
		).toMatchObject({
			thumbnailUrl: expect.stringMatching(
				/^\/text-assets\/.+\/thumbnail\.webp$/
			),
			sourceUrl: expect.stringMatching(/^\/text-assets\/.+\/template\.json$/),
			packageUrl: expect.stringMatching(
				/^\/text-assets\/.+\/template\.qctext$/
			),
			bundled: true,
		});
	});

	it("uses generated thumbnails for catalog cards before a template is downloaded", () => {
		const remoteDefinition = TEXT_TEMPLATE_DEFINITIONS.find(
			(definition) => definition.category === "red" && !definition.downloaded
		);

		expect(remoteDefinition).toBeDefined();
		expect(
			getTextTemplateCatalogThumbnailUrl({
				definition: remoteDefinition as TextTemplateDefinition,
			})
		).toMatch(/^\/text-assets\/.+\/thumbnail\.webp$/);
		expect(
			getTextTemplateResourceFiles({
				definition: remoteDefinition as TextTemplateDefinition,
			})
		).toMatchObject({
			thumbnailUrl: expect.stringMatching(
				/^\/text-assets\/.+\/thumbnail\.webp$/
			),
			bundled: true,
		});
	});

	it("groups resources into package summaries", () => {
		const packages = buildTextTemplateResourcePackages({
			definitions: [
				createDefinition({ id: "first", packageId: "shared" }),
				createDefinition({
					category: "title",
					id: "second",
					packageId: "shared",
					premium: true,
				}),
				createDefinition({ id: "legacy", withResource: false }),
			],
		});

		expect(
			packages.map((resourcePackage) => resourcePackage.packageId)
		).toEqual(["shared", "text-new-text-basic"]);
		expect(packages[0]).toMatchObject({
			entitlement: "svip",
			assetIds: ["asset-first", "asset-second"],
			categories: ["basic", "title"],
			groupIds: ["new-text"],
			sizeKb: 512,
			version: 2,
		});
	});
});
