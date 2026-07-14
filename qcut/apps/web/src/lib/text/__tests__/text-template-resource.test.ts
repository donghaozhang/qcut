import { assetManifestVersionKey } from "@qcut/editor-core";
import { createHash } from "node:crypto";
import type { CachedAssetResource } from "@/lib/assets/asset-resource-cache";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import { describe, expect, it, vi } from "vitest";
import {
	downloadTextTemplateResource,
	loadTextTemplatePackageSource,
	parseTextTemplatePackage,
	resolveTextTemplatePackForTimeline,
	resolveTextTemplateForTimeline,
	textAssetFetchWithBundledFallback,
} from "../text-template-resource";
import { buildTextTemplatePack } from "../text-template-packs";
import {
	TEXT_TEMPLATE_DEFINITIONS,
	buildTextTemplate,
	getTextTemplateDefinitionsByCategory,
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

function checksum({ value }: { value: string }): string {
	return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function packageText({
	content = "Package content",
	definition,
	includeTemplatePack = false,
}: {
	content?: string;
	definition: TextTemplateDefinition;
	includeTemplatePack?: boolean;
}): string {
	const resource = definition.resource;
	if (!resource) throw new Error("Expected text definition resource");
	const templatePack = includeTemplatePack
		? {
				id: `pack-${definition.id}`,
				name: `${definition.name} pack`,
				category: definition.category,
				copySlots: [
					{
						defaultContent: content,
						elementIndex: 0,
						id: "headline",
						label: "主标题",
					},
					{
						defaultContent: "Subtitle",
						elementIndex: 1,
						id: "subhead",
						label: "副标题",
					},
				],
				elements: [
					{
						id: "pack-title",
						type: "text",
						name: "Pack title",
						content,
						color: "#ffffff",
						fontFamily: "Inter",
						fontSize: 48,
						height: 120,
						width: 640,
						x: 80,
						y: 120,
						textAlign: "left",
					},
					{
						id: "pack-subtitle",
						type: "text",
						name: "Pack subtitle",
						content: "Subtitle",
						color: "#facc15",
						fontFamily: "Inter",
						fontSize: 28,
						height: 72,
						width: 520,
						x: 80,
						y: 240,
						textAlign: "left",
					},
				],
			}
		: undefined;
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
			templatePack,
		},
	});
}

function padJsonTextToByteLength({
	targetBytes,
	text,
}: {
	targetBytes: number;
	text: string;
}): string {
	if (text.length > targetBytes) {
		throw new Error(`Fixture text exceeds ${targetBytes} bytes`);
	}
	return `${text}${" ".repeat(targetBytes - text.length)}`;
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
			cacheHitCount: 0,
			cachedBytes: 2232,
			cachedFileCount: 3,
			files: [
				expect.objectContaining({
					byteSize: 184,
					cacheKey: "text-template:asset-remote-resource-test@1:thumbnail:0",
					checksumSha256: checksum({ value: "t".repeat(184) }),
					fromCache: false,
					role: "thumbnail",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				}),
				expect.objectContaining({
					byteSize: 1024,
					cacheKey: "text-template:asset-remote-resource-test@1:source:1",
					checksumSha256: checksum({ value: "s".repeat(1024) }),
					fromCache: false,
					role: "source",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				}),
				expect.objectContaining({
					byteSize: 1024,
					cacheKey: "text-template:asset-remote-resource-test@1:package:2",
					checksumSha256: checksum({ value: "p".repeat(1024) }),
					fromCache: false,
					role: "package",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				}),
			],
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

	it("falls back to bundled text asset files when remote asset requests fail", async () => {
		const storage = new MemoryAssetCache();
		const requestedUrls: string[] = [];
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.startsWith("/text-assets/")) {
				const body = remoteBody({ url });
				return Promise.resolve(
					new Response(body, {
						headers: { "content-type": "text/plain" },
						status: 200,
					})
				);
			}
			return Promise.resolve(new Response("missing", { status: 503 }));
		});

		await expect(
			downloadTextTemplateResource({
				definition: textDefinition(),
				fetchImpl,
				storage,
			})
		).resolves.toMatchObject({
			cacheHitCount: 0,
			cachedBytes: 2232,
			cachedFileCount: 3,
			files: [
				expect.objectContaining({
					fromCache: false,
					role: "thumbnail",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				}),
				expect.objectContaining({
					fromCache: false,
					role: "source",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				}),
				expect.objectContaining({
					fromCache: false,
					role: "package",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
					url: "https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				}),
			],
		});
		expect(requestedUrls).toEqual(
			expect.arrayContaining([
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				"/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				"/text-assets/package-remote-resource-test/plain@1/template.json",
				"/text-assets/package-remote-resource-test/plain@1/template.qctext",
			])
		);
		expect([...storage.resources.keys()].sort()).toEqual([
			"text-template:asset-remote-resource-test@1:package:2",
			"text-template:asset-remote-resource-test@1:source:1",
			"text-template:asset-remote-resource-test@1:thumbnail:0",
		]);
	});

	it("returns bundled template cache keys without fetching", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.category === "red" && !candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a generated text template fixture");
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			downloadTextTemplateResource({
				definition,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			cacheHitCount: 3,
			cachedFileCount: 3,
			cacheKey: assetManifestVersionKey({
				id: definition.resource?.assetId ?? `text-legacy-${definition.id}`,
				kind: "text-template",
				version: definition.resource?.version ?? 1,
			}),
			files: [
				expect.objectContaining({
					checksumSha256: expect.stringMatching(/^[a-f\d]{64}$/),
					fromCache: true,
					role: "thumbnail",
					sourceUrl: expect.stringMatching(
						/^\/text-assets\/.+\/thumbnail\.webp$/
					),
				}),
				expect.objectContaining({
					checksumSha256: expect.stringMatching(/^[a-f\d]{64}$/),
					fromCache: true,
					role: "source",
					sourceUrl: expect.stringMatching(
						/^\/text-assets\/.+\/template\.json$/
					),
				}),
				expect.objectContaining({
					checksumSha256: expect.stringMatching(/^[a-f\d]{64}$/),
					fromCache: true,
					role: "package",
					sourceUrl: expect.stringMatching(
						/^\/text-assets\/.+\/template\.qctext$/
					),
				}),
			],
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("reports cache hits when remote files are already cached", async () => {
		const definition = textDefinition();
		const storage = new MemoryAssetCache();
		const resources = [
			{
				cacheKey: "text-template:asset-remote-resource-test@1:thumbnail:0",
				role: "thumbnail" as const,
				sourceUrl:
					"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				value: "t".repeat(184),
			},
			{
				cacheKey: "text-template:asset-remote-resource-test@1:source:1",
				role: "source" as const,
				sourceUrl:
					"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				value: "s".repeat(1024),
			},
			{
				cacheKey: "text-template:asset-remote-resource-test@1:package:2",
				role: "package" as const,
				sourceUrl:
					"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				value: "p".repeat(1024),
			},
		];
		for (const [fileIndex, resource] of resources.entries()) {
			storage.resources.set(resource.cacheKey, {
				assetIdentity: "text-template:asset-remote-resource-test",
				assetKey: "text-template:asset-remote-resource-test@1",
				blob: new Blob([resource.value]),
				byteSize: resource.value.length,
				cacheKey: resource.cacheKey,
				cachedAt: 1,
				checksumSha256: checksum({ value: resource.value }),
				fileIndex,
				lastAccessedAt: 1,
				mimeType: "text/plain",
				role: resource.role,
				sourceUrl: resource.sourceUrl,
				version: 1,
			});
		}
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			downloadTextTemplateResource({
				definition,
				fetchImpl,
				storage,
			})
		).resolves.toMatchObject({
			cacheHitCount: 3,
			cachedBytes: 2232,
			cachedFileCount: 3,
			files: [
				expect.objectContaining({ fromCache: true, role: "thumbnail" }),
				expect.objectContaining({ fromCache: true, role: "source" }),
				expect.objectContaining({ fromCache: true, role: "package" }),
			],
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("falls back to bundled text asset files when the CDN is unavailable", async () => {
		const requestedUrls: string[] = [];
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			requestedUrls.push(url);
			if (url.startsWith("https://assets.qcut.app/")) {
				return new Response("cdn unavailable", { status: 503 });
			}
			return new Response(remoteBody({ url }), {
				headers: { "content-type": "text/plain" },
				status: 200,
			});
		});

		await expect(
			downloadTextTemplateResource({
				definition: textDefinition(),
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			cacheHitCount: 0,
			cachedBytes: 2232,
			cachedFileCount: 3,
			files: [
				expect.objectContaining({
					fromCache: false,
					role: "thumbnail",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				}),
				expect.objectContaining({
					fromCache: false,
					role: "source",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				}),
				expect.objectContaining({
					fromCache: false,
					role: "package",
					sourceUrl:
						"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				}),
			],
		});
		expect(requestedUrls).toEqual(
			expect.arrayContaining([
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				"/text-assets/package-remote-resource-test/plain@1/thumbnail.webp",
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.json",
				"/text-assets/package-remote-resource-test/plain@1/template.json",
				"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
				"/text-assets/package-remote-resource-test/plain@1/template.qctext",
			])
		);
	});

	it("leaves non-QCut remote asset requests on the original response path", async () => {
		const wrappedFetch = textAssetFetchWithBundledFallback({
			fetchImpl: vi.fn<typeof fetch>(
				async () => new Response("missing", { status: 404 })
			),
		});

		await expect(
			wrappedFetch("https://cdn.example.com/text-assets/demo/template.qctext")
		).resolves.toMatchObject({ ok: false, status: 404 });
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

	it("parses qctext package template pack payloads", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		if (!definition) throw new Error("Expected a headline template definition");

		expect(
			parseTextTemplatePackage({
				text: packageText({
					content: "Pack title",
					definition,
					includeTemplatePack: true,
				}),
			})
		).toMatchObject({
			templatePack: {
				category: "headline-template",
				copySlots: [
					{
						defaultContent: "Pack title",
						elementIndex: 0,
						id: "headline",
						label: "主标题",
					},
					{
						defaultContent: "Subtitle",
						elementIndex: 1,
						id: "subhead",
						label: "副标题",
					},
				],
				elements: [
					{ content: "Pack title", type: "text" },
					{ content: "Subtitle", type: "text" },
				],
				id: `pack-${definition.id}`,
			},
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

	it("loads remote package files from bundled fallback when the CDN is unavailable", async () => {
		const definition = textDefinition();
		const packageBody = padJsonTextToByteLength({
			targetBytes: 1024,
			text: packageText({ content: "Bundled fallback package", definition }),
		});
		const fetchImpl = vi.fn<typeof fetch>(async (input) => {
			const url = String(input);
			if (url.startsWith("https://assets.qcut.app/")) {
				return new Response("cdn unavailable", { status: 503 });
			}
			return new Response(packageBody, {
				headers: {
					"content-length": String(packageBody.length),
					"content-type": "application/vnd.qcut.text-template+json",
				},
				status: 200,
			});
		});

		await expect(
			loadTextTemplatePackageSource({
				definition,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			template: {
				content: "Bundled fallback package",
			},
		});
		expect(fetchImpl).toHaveBeenCalledWith(
			"https://assets.qcut.app/text-assets/package-remote-resource-test/plain@1/template.qctext",
			expect.any(Object)
		);
		expect(fetchImpl).toHaveBeenCalledWith(
			"/text-assets/package-remote-resource-test/plain@1/template.qctext",
			expect.any(Object)
		);
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

	it("resolves timeline template packs from package payloads when enabled", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fallbackTemplate = buildTextTemplate({ definition });
		const fallbackPack = buildTextTemplatePack({
			baseTemplate: fallbackTemplate,
			currentTime: 2,
			definition,
		});
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Promise.resolve(
				new Response(
					packageText({
						content: "Package headline",
						definition,
						includeTemplatePack: true,
					}),
					{ status: 200 }
				)
			)
		);

		await expect(
			resolveTextTemplatePackForTimeline({
				currentTime: 2,
				definition,
				fallbackPack,
				fallbackTemplate,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toMatchObject({
			copySlots: [
				{
					defaultContent: "Package headline",
					elementIndex: 0,
					id: "headline",
					label: "主标题",
				},
				{
					defaultContent: "Subtitle",
					elementIndex: 1,
					id: "subhead",
					label: "副标题",
				},
			],
			elements: [
				{
					content: "Package headline",
					duration: fallbackTemplate.duration,
					startTime: 2,
					trimEnd: 0,
					trimStart: 0,
					type: "text",
				},
				{
					content: "Subtitle",
					fontSize: 28,
					startTime: 2,
					type: "text",
				},
			],
			id: `pack-${definition.id}`,
		});
	});

	it("keeps fallback template packs when package pack resolution is disabled", async () => {
		const definition = TEXT_TEMPLATE_DEFINITIONS.find(
			(candidate) => candidate.downloaded
		);
		if (!definition)
			throw new Error("Expected a bundled text template fixture");
		const fallbackTemplate = buildTextTemplate({ definition });
		const fallbackPack = buildTextTemplatePack({
			baseTemplate: fallbackTemplate,
			currentTime: 2,
			definition,
		});
		const fetchImpl = vi.fn<typeof fetch>();

		await expect(
			resolveTextTemplatePackForTimeline({
				definition,
				enabled: false,
				fallbackPack,
				fetchImpl,
				storage: new MemoryAssetCache(),
			})
		).resolves.toBe(fallbackPack);
		expect(fetchImpl).not.toHaveBeenCalled();
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
