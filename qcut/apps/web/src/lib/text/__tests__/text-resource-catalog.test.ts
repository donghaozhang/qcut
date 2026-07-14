import { describe, expect, it } from "vitest";
import {
	buildTextTemplateResourcePackages,
	getTextTemplateResource,
	getTextTemplateResourceFiles,
} from "../text-resource-catalog";
import type { TextTemplateDefinition } from "../text-template-registry";

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
				"qcut-text-asset://text-assets/pack-a/poster@1/thumbnail.webp",
			sourceUrl: "qcut-text-asset://text-assets/pack-a/poster@1/template.json",
			byteSize: 128 * 1024,
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
