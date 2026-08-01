import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	PRIVATE_STICKER_CATALOG_IDS,
} from "@qcut/editor-core/sticker-lab";
import {
	createLocalStickerCatalog,
	createPrivateStickerCatalog,
	createPrivateStickerReference,
	createRemoteStickerCatalog,
} from "./fixtures/local-sticker-catalog";
import {
	isPrivateStickerCatalog,
	loadLocalStickerManifest,
	loadPrivateStickerManifest,
	loadRemoteStickerManifest,
	parseLocalStickerManifest,
} from "../local-sticker-manifest";

describe("local sticker manifest", () => {
	it("parses a strict v1 catalog with one or more items per category", () => {
		const catalog = createLocalStickerCatalog();

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toEqual(catalog);
	});

	it("parses a strict v2 Supabase catalog", () => {
		const catalog = createRemoteStickerCatalog();

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toEqual(catalog);
	});

	it("accepts an animated preview GIF as an explicit source kind", () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";
		firstItem.fileName = "preview.gif";
		firstItem.filePath = "/tmp/sticker-lab/preview.gif";
		firstItem.mimeType = "image/gif";

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
				.categories[0]?.items[0]
		).toMatchObject({
			sourceKind: "preview-gif",
			mimeType: "image/gif",
			playback: { kind: "animated" },
		});
	});

	it("requires GIF source kinds to point to GIF output files", () => {
		const catalog = createLocalStickerCatalog();
		const firstItem = catalog.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "preview-gif";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toThrow("preview-gif references require image/gif");
	});

	it.each([
		{
			name: "wrong version",
			mutate: (candidate: Record<string, unknown>) => {
				candidate.version = 3;
			},
			message: "version",
		},
		{
			name: "unknown root key",
			mutate: (candidate: Record<string, unknown>) => {
				candidate.unexpected = true;
			},
			message: "Unrecognized key",
		},
		{
			name: "unknown sticker key",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<Record<string, unknown>>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.unexpected = true;
			},
			message: "Unrecognized key",
		},
		{
			name: "empty category",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: unknown[];
				}>;
				const firstCategory = categories[0];
				if (firstCategory) firstCategory.items = [];
			},
			message: "at least 1",
		},
		{
			name: "relative asset path",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<{ filePath: string }>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.filePath = "../arrow.png";
			},
			message: "absolute",
		},
		{
			name: "unsupported media type",
			mutate: (candidate: Record<string, unknown>) => {
				const categories = candidate.categories as Array<{
					items: Array<{ mimeType: string }>;
				}>;
				const firstItem = categories[0]?.items[0];
				if (firstItem) firstItem.mimeType = "video/mp4";
			},
			message: "Invalid enum value",
		},
	])("rejects $name", ({ mutate, message }) => {
		const candidate = structuredClone(
			createLocalStickerCatalog()
		) as unknown as Record<string, unknown>;
		mutate(candidate);

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow(message);
	});

	it.each([
		{
			name: "an object key outside the catalog namespace",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.asset.objectKey = "../private/asset.gif";
			},
			message: "Invalid",
		},
		{
			name: "an uppercase checksum",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) {
					firstItem.asset.checksumSha256 =
						firstItem.asset.checksumSha256.toLocaleUpperCase();
				}
			},
			message: "Invalid",
		},
		{
			name: "a zero byte asset",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.asset.byteSize = 0;
			},
			message: "greater than 0",
		},
		{
			name: "an asset larger than the private bucket limit",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.asset.byteSize = 25 * 1024 * 1024 + 1;
			},
			message: "less than or equal to 26214400",
		},
		{
			name: "a category larger than the eager-load budget",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.asset.byteSize = 1024 * 1024 + 1;
			},
			message: "Category assets exceed 1048576 bytes",
		},
		{
			name: "an unsafe source asset path",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) {
					firstItem.sourceAsset.path =
						"apps/web/public/stickers/../private/asset.svg";
				}
			},
			message: "must not contain dot path segments",
		},
		{
			name: "a MIME and object extension mismatch",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.mimeType = "image/png";
			},
			message: "require .png object keys",
		},
		{
			name: "a MIME and file name extension mismatch",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) firstItem.fileName = "popular-1.png";
			},
			message: "require .gif file names",
		},
		{
			name: "an object key from another catalog",
			mutate: (candidate: ReturnType<typeof createRemoteStickerCatalog>) => {
				const firstItem = candidate.categories[0]?.items[0];
				if (firstItem) {
					firstItem.asset.objectKey =
						"catalogs/another-catalog/assets/popular-1.gif";
				}
			},
			message: "must belong to catalog",
		},
	])("rejects v2 $name", ({ mutate, message }) => {
		const candidate = structuredClone(createRemoteStickerCatalog());
		mutate(candidate);

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow(message);
	});

	it("rejects catalogs larger than the total download budget", () => {
		const candidate = structuredClone(createRemoteStickerCatalog());
		const template = candidate.categories[0]?.items[0];
		if (!template) throw new Error("Expected a remote sticker fixture");
		candidate.categories = Array.from({ length: 26 }, (_, index) => {
			const suffix = String(index + 1);
			const sourceChecksum = (index + 1).toString(16).padStart(64, "0");
			const renderedChecksum = (index + 101).toString(16).padStart(64, "0");
			return {
				id: `category-${suffix}`,
				label: `Category ${suffix}`,
				sourcePanel: "QCut original catalog",
				items: [
					{
						...structuredClone(template),
						id: `item-${suffix}`,
						displayName: `Sticker ${suffix}`,
						fileName: `item-${suffix}.gif`,
						sourceAsset: {
							collection: "qcut-original",
							id: `qcut-original:source-${suffix}`,
							path: `apps/web/public/stickers/qcut-original/source-${suffix}.svg`,
							checksumSha256: sourceChecksum,
						},
						asset: {
							kind: "supabase-storage" as const,
							objectKey: `catalogs/qcut-original-test/assets/item-${suffix}.gif`,
							byteSize: 1024 * 1024,
							checksumSha256: renderedChecksum,
						},
					},
				],
			};
		});

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Catalog assets exceed 26214400 bytes");
	});

	it("rejects invalid remote provenance", () => {
		const absoluteLicensePath = structuredClone(createRemoteStickerCatalog());
		absoluteLicensePath.provenance.license.licenseFile = "/tmp/LICENSE";
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(absoluteLicensePath),
			})
		).toThrow("repository path must be relative");

		const invalidSourceTree = structuredClone(createRemoteStickerCatalog());
		invalidSourceTree.provenance.sourceTreeGitOid = "not-a-git-oid";
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(invalidSourceTree),
			})
		).toThrow("Invalid");

		const attributionRequired = structuredClone(createRemoteStickerCatalog());
		(
			attributionRequired.provenance.license as {
				attributionRequired: boolean;
			}
		).attributionRequired = true;
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(attributionRequired),
			})
		).toThrow("Invalid literal value");

		const duplicateSourceCollection = structuredClone(
			createRemoteStickerCatalog()
		);
		duplicateSourceCollection.provenance.sourceCollections.push(
			"qcut-original"
		);
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(duplicateSourceCollection),
			})
		).toThrow("Source collections must be unique");
	});

	it("rejects undeclared or inconsistent source asset collections", () => {
		const undeclaredCollection = structuredClone(createRemoteStickerCatalog());
		const undeclaredItem = undeclaredCollection.categories[0]?.items[0];
		if (!undeclaredItem) throw new Error("Expected a remote sticker fixture");
		undeclaredItem.sourceAsset.collection = "qcut-themed";
		undeclaredItem.sourceAsset.id = "qcut-themed:popular-1";
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(undeclaredCollection),
			})
		).toThrow("Source collection is not declared");

		const inconsistentId = structuredClone(createRemoteStickerCatalog());
		const inconsistentItem = inconsistentId.categories[0]?.items[0];
		if (!inconsistentItem) throw new Error("Expected a remote sticker fixture");
		inconsistentItem.sourceAsset.id = "qcut-themed:popular-1";
		expect(() =>
			parseLocalStickerManifest({
				jsonText: JSON.stringify(inconsistentId),
			})
		).toThrow("Source asset id must use the qcut-original: prefix");
	});

	it("rejects duplicate v2 sticker and object identities", () => {
		const candidate = structuredClone(createRemoteStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		const secondItem = candidate.categories[0]?.items[1];
		if (!firstItem || !secondItem) {
			throw new Error("Expected two remote sticker fixtures");
		}
		secondItem.id = firstItem.id;
		secondItem.asset.objectKey = firstItem.asset.objectKey;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker object key");
	});

	it("rejects duplicate v2 source assets and rendered artwork", () => {
		const candidate = structuredClone(createRemoteStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		const secondItem = candidate.categories[0]?.items[1];
		if (!firstItem || !secondItem) {
			throw new Error("Expected two remote sticker fixtures");
		}
		secondItem.sourceAsset = structuredClone(firstItem.sourceAsset);
		secondItem.asset.checksumSha256 = firstItem.asset.checksumSha256;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate source asset id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate source asset path");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate source asset checksum");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker checksum");
	});

	it("rejects duplicate category, sticker, and file identities", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstCategory = candidate.categories[0];
		const secondCategory = candidate.categories[1];
		if (!firstCategory || !secondCategory) {
			throw new Error("Expected two category fixtures");
		}
		secondCategory.id = firstCategory.id;
		const firstItem = firstCategory.items[0];
		const secondItem = secondCategory.items[0];
		if (!firstItem || !secondItem) {
			throw new Error("Expected sticker fixtures");
		}
		secondItem.id = firstItem.id;
		secondItem.filePath = firstItem.filePath;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate category id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker id");
		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Duplicate sticker path");
	});

	it("rejects playback metadata that contradicts the source kind", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.sourceKind = "static-image";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("static-image references require static playback");
	});

	it("rejects animated JPEG files and single-frame animation metadata", () => {
		const animatedJpeg = structuredClone(createLocalStickerCatalog());
		const animatedJpegItem = animatedJpeg.categories[0]?.items[0];
		if (!animatedJpegItem) throw new Error("Expected a sticker fixture");
		animatedJpegItem.mimeType = "image/jpeg";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(animatedJpeg) })
		).toThrow("animated references cannot use image/jpeg");

		const singleFrame = structuredClone(createLocalStickerCatalog());
		const singleFrameItem = singleFrame.categories[0]?.items[0];
		if (!singleFrameItem || singleFrameItem.playback.kind !== "animated") {
			throw new Error("Expected an animated sticker fixture");
		}
		singleFrameItem.playback.frameCount = 1;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(singleFrame) })
		).toThrow("greater than or equal to 2");
	});

	it("loads and decodes the configured UTF-8 manifest file", async () => {
		const catalog = createLocalStickerCatalog();
		const bytes = new TextEncoder().encode(JSON.stringify(catalog));
		const readFile = vi.fn(async () => bytes);

		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/sticker-manifest.json",
				readFile,
			})
		).resolves.toEqual(catalog);
		expect(readFile).toHaveBeenCalledWith({
			filePath: "/tmp/sticker-manifest.json",
		});
	});

	it("fetches and validates a remote v2 manifest", async () => {
		const catalog = createRemoteStickerCatalog();
		const fetchImpl = vi.fn(async () =>
			Promise.resolve(
				new Response(JSON.stringify(catalog), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			)
		);

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/sticker-lab/catalog.json",
				fetchImpl,
			})
		).resolves.toEqual(catalog);
		expect(fetchImpl).toHaveBeenCalledWith("/sticker-lab/catalog.json", {
			signal: undefined,
		});
	});

	it("rejects failed, empty, and oversized remote manifest responses", async () => {
		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/missing.json",
				fetchImpl: async () => new Response("", { status: 404 }),
			})
		).rejects.toThrow("Unable to fetch sticker lab manifest (404)");

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/empty.json",
				fetchImpl: async () => new Response(null, { status: 200 }),
			})
		).rejects.toThrow("Unable to fetch sticker lab manifest");

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/oversized.json",
				fetchImpl: async () =>
					new Response("{}", {
						status: 200,
						headers: { "Content-Length": `${1024 * 1024 + 1}` },
					}),
			})
		).rejects.toThrow("exceeds 1048576 bytes");
	});

	it("bounds streamed manifest responses without a content length", async () => {
		const read = vi
			.fn()
			.mockResolvedValueOnce({
				done: false,
				value: new Uint8Array(1024 * 1024),
			})
			.mockResolvedValueOnce({
				done: false,
				value: new Uint8Array([0]),
			});
		const cancel = vi.fn().mockResolvedValue(undefined);
		const releaseLock = vi.fn();
		const response = {
			body: {
				getReader: () => ({ cancel, read, releaseLock }),
			},
			headers: new Headers(),
			ok: true,
			status: 200,
		} as unknown as Response;

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/streamed-oversized.json",
				fetchImpl: async () => response,
			})
		).rejects.toThrow("exceeds 1048576 bytes");
		expect(read).toHaveBeenCalledTimes(2);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("rejects remote manifest responses without a readable body", async () => {
		const responseWithoutReader = {
			body: { getReader: () => null },
			headers: new Headers(),
			ok: true,
			status: 200,
		} as unknown as Response;

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/missing-body.json",
				fetchImpl: async () => new Response(null, { status: 200 }),
			})
		).rejects.toThrow("Unable to fetch sticker lab manifest");
		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/missing-reader.json",
				fetchImpl: async () => responseWithoutReader,
			})
		).rejects.toThrow("Unable to fetch sticker lab manifest");
	});

	it("cancels the manifest reader when streaming fails", async () => {
		const read = vi.fn().mockRejectedValue(new Error("stream failed"));
		const cancel = vi.fn().mockResolvedValue(undefined);
		const releaseLock = vi.fn();
		const response = {
			body: {
				getReader: () => ({ cancel, read, releaseLock }),
			},
			headers: new Headers(),
			ok: true,
			status: 200,
		} as unknown as Response;

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/failed-stream.json",
				fetchImpl: async () => response,
			})
		).rejects.toThrow("stream failed");
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it("does not let a fetched v1 manifest select arbitrary local files", async () => {
		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/unsafe-v1.json",
				fetchImpl: async () =>
					new Response(JSON.stringify(createLocalStickerCatalog())),
			})
		).rejects.toThrow("must use version 2");
	});

	it("reports malformed, missing, and non-UTF-8 manifest files", async () => {
		expect(() => parseLocalStickerManifest({ jsonText: "{" })).toThrow(
			"malformed JSON"
		);
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/missing.json",
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker manifest");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/not-utf8.json",
				readFile: async () => new Uint8Array([0xff]),
			})
		).rejects.toThrow("expected UTF-8 JSON");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "../relative.json",
				readFile: async () => new Uint8Array([1]),
			})
		).rejects.toThrow("path must be absolute");
		await expect(
			loadLocalStickerManifest({
				manifestPath: "/tmp/stickers/../manifest.json",
				readFile: async () => new Uint8Array([1]),
			})
		).rejects.toThrow("without dot segments");
	});

	it("rejects dot segments in sticker file paths", () => {
		const candidate = structuredClone(createLocalStickerCatalog());
		const firstItem = candidate.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a sticker fixture");
		firstItem.filePath = "/tmp/stickers/../shared/arrow.png";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("must not contain dot path segments");
	});
});

describe("private reference manifests", () => {
	it("parses a version 2 catalog without provenance as a private reference", () => {
		const catalog = parseLocalStickerManifest({
			jsonText: JSON.stringify(createPrivateStickerCatalog()),
		});

		expect(catalog.version).toBe(2);
		expect(isPrivateStickerCatalog(catalog)).toBe(true);
	});

	it("rejects private catalogs outside the jianying namespace", () => {
		const catalog = createPrivateStickerCatalog();
		const candidate = { ...catalog, catalogId: "qcut-original-test" };

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("not registered");
	});

	it.each(
		PRIVATE_STICKER_CATALOG_IDS
	)("accepts the registered private catalog namespace %s", (catalogId) => {
		const catalog = createPrivateStickerCatalog({ catalogId });

		expect(
			parseLocalStickerManifest({ jsonText: JSON.stringify(catalog) })
		).toEqual(catalog);
	});

	it.each([
		"jianying/2026-08-01-batch-0/assets/7000000000000000001.gif",
		"jianying/2026-08-01-batch-01/assets/7000000000000000001.gif",
		"jianying/2026-08-01-batch-two/assets/7000000000000000001.gif",
		"jianying/2026-08-01-extra/assets/7000000000000000001.gif",
	])("rejects malformed private batch object keys: %s", (objectKey) => {
		const catalog = createPrivateStickerCatalog({
			catalogId: "jianying-2026-08-01-batch-2",
		});
		const candidate = structuredClone(catalog);
		const firstItem = candidate.categories[0]?.items[0];
		if (!firstItem) throw new Error("Expected a private sticker fixture");
		firstItem.asset.objectKey = objectKey;

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Invalid sticker lab manifest");
	});

	it("rejects object keys from another catalog's namespace", () => {
		const catalog = createPrivateStickerCatalog();
		const foreign = createPrivateStickerReference({
			checksumSha256:
				"d964a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
			numericId: "7000000000000000001",
		});
		foreign.asset.objectKey =
			"jianying/2026-08-01/assets/7000000000000000001.gif";
		const candidate = {
			...catalog,
			categories: [
				{
					...catalog.categories[0],
					items: [...catalog.categories[0].items, foreign],
				},
			],
		};

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("must belong to catalog jianying-2026-07-31");
	});

	it("rejects public catalog object keys inside a private manifest", () => {
		const catalog = createPrivateStickerCatalog();
		const candidate = JSON.parse(JSON.stringify(catalog));
		candidate.categories[0].items[0].asset.objectKey =
			"catalogs/qcut-original-test/assets/sticker-1.gif";

		expect(() =>
			parseLocalStickerManifest({ jsonText: JSON.stringify(candidate) })
		).toThrow("Invalid sticker lab manifest");
	});

	it("allows the animated-GIF budgets the harvested catalog needs", () => {
		// The public v2 budgets (1MB per category) would reject the harvested
		// GIF catalogue outright; the private schema has its own budgets.
		const catalog = createPrivateStickerCatalog();
		const candidate = JSON.parse(JSON.stringify(catalog));
		candidate.categories[0].items[0].asset.byteSize = 16 * 1024 * 1024;
		candidate.categories[0].items[1].asset.byteSize = 16 * 1024 * 1024;

		const parsed = parseLocalStickerManifest({
			jsonText: JSON.stringify(candidate),
		});
		expect(isPrivateStickerCatalog(parsed)).toBe(true);
	});

	it("loads the private manifest and rejects a public manifest in its place", async () => {
		const privateCatalog = createPrivateStickerCatalog();
		const fetchPrivate = vi.fn(async () =>
			Promise.resolve(
				new Response(JSON.stringify(privateCatalog), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			)
		);

		await expect(
			loadPrivateStickerManifest({
				expectedCatalogId: DEFAULT_PRIVATE_STICKER_CATALOG_ID,
				manifestUrl: "/api/sticker-lab/private-manifest",
				fetchImpl: fetchPrivate,
			})
		).resolves.toEqual(privateCatalog);

		const fetchPublic = async () =>
			new Response(JSON.stringify(createRemoteStickerCatalog()), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		await expect(
			loadPrivateStickerManifest({
				expectedCatalogId: DEFAULT_PRIVATE_STICKER_CATALOG_ID,
				manifestUrl: "/api/sticker-lab/private-manifest",
				fetchImpl: fetchPublic,
			})
		).rejects.toThrow("without provenance");
	});

	it("rejects a valid private manifest returned for a different requested catalog", async () => {
		const firstCatalog = createPrivateStickerCatalog();
		const fetchImpl = async () =>
			new Response(JSON.stringify(firstCatalog), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});

		await expect(
			loadPrivateStickerManifest({
				expectedCatalogId: "jianying-2026-08-01-batch-2",
				fetchImpl,
				manifestUrl:
					"/api/sticker-lab/private-manifest?catalogId=jianying-2026-08-01-batch-2",
			})
		).rejects.toThrow(
			"expected jianying-2026-08-01-batch-2, received jianying-2026-07-31"
		);
	});

	it("keeps the remote loader strict about provenance", async () => {
		const fetchImpl = async () =>
			new Response(JSON.stringify(createPrivateStickerCatalog()), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});

		await expect(
			loadRemoteStickerManifest({
				manifestUrl: "/sticker-lab/catalog.json",
				fetchImpl,
			})
		).rejects.toThrow("with provenance");
	});
});
