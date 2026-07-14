import { assetManifestVersionKey } from "@qcut/editor-core";
import type { CachedAssetResource } from "@/lib/assets/asset-resource-cache";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import { describe, expect, it, vi } from "vitest";
import {
	downloadTextTemplateResource,
	loadTextTemplatePackageSource,
	parseTextTemplatePackage,
	resolveTextTemplateForTimeline,
} from "../text-template-resource";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	buildTextTemplate,
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
		stylePresetId: "clean-white",
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

function packageText({
	content = "Package content",
	definition,
}: {
	content?: string;
	definition: TextTemplateDefinition;
}): string {
	const resource = definition.resource;
	if (!resource) throw new Error("Expected text definition resource");
	return JSON.stringify({
		schemaVersion: 1,
		kind: "qcut-text-template-package",
		assetId: resource.assetId,
		packageId: resource.packageId,
		version: resource.version,
		cacheKey: resource.cacheKey,
		files: {
			thumbnail: "thumbnail.webp",
			source: "template.json",
		},
		source: {
			schemaVersion: 1,
			assetId: resource.assetId,
			packageId: resource.packageId,
			version: resource.version,
			template: {
				id: `package-${definition.id}`,
				type: "text",
				name: `${definition.name} Package`,
				content,
				color: "#ffffff",
				fontFamily: "Inter",
				fontSize: 48,
				height: 120,
				width: 640,
				x: 80,
				y: 120,
			},
		},
	});
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

	it("parses qctext package template payloads", () => {
		const definition = textDefinition();

		expect(
			parseTextTemplatePackage({
				text: packageText({ content: "Cached package", definition }),
			})
		).toMatchObject({
			assetId: "asset-remote-resource-test",
			cacheKey: "text-assets/package-remote-resource-test/plain@1",
			packageId: "package-remote-resource-test",
			template: {
				content: "Cached package",
				type: "text",
			},
			version: 1,
		});
	});

	it("loads bundled package files through fetch", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Promise.resolve(
				new Response(
					packageText({ content: "Bundled package content", definition }),
					{ status: 200 }
				)
			)
		);

		await expect(
			loadTextTemplatePackageSource({
				definition,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			template: {
				content: "Bundled package content",
			},
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringMatching(/^\/text-assets\/.+\/template\.qctext$/)
		);
	});

	it("loads remote package files from the asset cache without another request", async () => {
		const definition = textDefinition();
		const storage = new MemoryAssetCache();
		storage.resources.set(
			"text-template:asset-remote-resource-test@1:package:2",
			{
				assetIdentity: "text-template:asset-remote-resource-test",
				assetKey: "text-template:asset-remote-resource-test@1",
				blob: new Blob([
					packageText({ content: "IndexedDB package", definition }),
				]),
				byteSize: 1024,
				cacheKey: "text-template:asset-remote-resource-test@1:package:2",
				cachedAt: 1,
				checksumSha256: "0".repeat(64),
				fileIndex: 2,
				lastAccessedAt: 1,
				mimeType: "application/vnd.qcut.text-template+json",
				role: "package",
				sourceUrl:
					"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				version: 1,
			}
		);
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			loadTextTemplatePackageSource({
				definition,
				fetchImpl,
				storage,
			})
		).resolves.toMatchObject({
			template: {
				content: "IndexedDB package",
			},
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("resolves timeline templates from package payloads when enabled", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fallbackTemplate = buildTextTemplate({ definition });
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Promise.resolve(
				new Response(
					packageText({ content: "Timeline package content", definition }),
					{ status: 200 }
				)
			)
		);

		await expect(
			resolveTextTemplateForTimeline({
				definition,
				fallbackTemplate,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			content: "Timeline package content",
			id: fallbackTemplate.id,
			type: "text",
		});
	});

	it("keeps registry templates when package resolution is disabled", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fallbackTemplate = buildTextTemplate({ definition });
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			resolveTextTemplateForTimeline({
				definition,
				enabled: false,
				fallbackTemplate,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toBe(fallbackTemplate);
		expect(fetchImpl).not.toHaveBeenCalled();
	});
});
