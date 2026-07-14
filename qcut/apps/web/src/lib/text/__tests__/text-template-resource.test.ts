import { assetManifestVersionKey } from "@qcut/editor-core";
import type { CachedAssetResource } from "@/lib/assets/asset-resource-cache";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import { describe, expect, it, vi } from "vitest";
import { downloadTextTemplateResource } from "../text-template-resource";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	type TextTemplateDefinition,
} from "../text-template-registry";

class MemoryAssetCache implements AssetResourceCacheStorage {
	readonly resources = new Map<string, CachedAssetResource>();

	async get({ cacheKey }: { cacheKey: string }) {
		return this.resources.get(cacheKey) ?? null;
	}

	async put({ resource }: { resource: CachedAssetResource }) {
		this.resources.set(resource.cacheKey, resource);
	}

	async remove({ cacheKey }: { cacheKey: string }) {
		this.resources.delete(cacheKey);
	}

	async list() {
		return [...this.resources.values()];
	}
}

function textDefinition(): TextTemplateDefinition {
	return {
		id: "remote-resource-test",
		name: "Remote resource test",
		category: "red",
		groupId: "fancy",
		variantId: "plain",
		content: "花字",
		stylePresetId: "bold-red",
		keywords: ["remote", "resource", "test"],
		premium: false,
		downloaded: false,
		resource: {
			assetId: "asset-remote-resource-test",
			packageId: "package-remote-resource-test",
			version: 1,
			entitlement: "free",
			cacheKey: "text-assets/package-remote-resource-test/plain@1",
			sizeKb: 1,
		},
		catalogVisible: true,
	};
}

function remoteBody({ url }: { url: string }): string {
	if (url.endsWith(".webp")) return "t".repeat(184);
	if (url.endsWith(".qctext")) return "p".repeat(1024);
	return "s".repeat(1024);
}

describe("downloadTextTemplateResource", () => {
	it("downloads remote thumbnail, source, and package files through the asset cache", async () => {
		const storage = new MemoryAssetCache();
		const progress: number[] = [];
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const body = remoteBody({ url: String(input) });
			return Promise.resolve(
				new Response(body, {
					headers: { "content-type": "text/plain" },
					status: 200,
				})
			);
		});

		const result = await downloadTextTemplateResource({
			definition: textDefinition(),
			fetchImpl,
			onProgress: ({ progress: value }) => progress.push(value),
			storage,
		});

		expect(result).toEqual({
			cacheKey: "text-template:asset-remote-resource-test@1",
			packageUrl:
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
			sourceUrl:
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
			thumbnailUrl:
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
		});
		expect(fetchImpl).toHaveBeenCalledTimes(3);
		expect([...storage.resources.keys()].sort()).toEqual([
			"text-template:asset-remote-resource-test@1:package:2",
			"text-template:asset-remote-resource-test@1:source:1",
			"text-template:asset-remote-resource-test@1:thumbnail:0",
		]);
		expect(progress.at(-1)).toBe(1);
	});

	it("returns bundled template cache keys without fetching", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			downloadTextTemplateResource({
				definition,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toEqual({
			cacheKey: assetManifestVersionKey({
				id: definition.resource?.assetId ?? `text-legacy-${definition.id}`,
				kind: "text-template",
				version: definition.resource?.version ?? 1,
			}),
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
