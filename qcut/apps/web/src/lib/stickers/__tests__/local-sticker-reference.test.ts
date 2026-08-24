import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVATE_STICKER_CATALOG_IDS } from "@qcut/editor-core/sticker-lab";
import {
	createLocalBridgeStickerCatalog,
	createLocalBridgeStickerReference,
	createLocalStickerReference,
	createRemoteStickerCatalog,
	createRemoteStickerReference,
} from "./fixtures/local-sticker-catalog";
import {
	buildStickerReferenceUsageMetadata,
	buildStickerLabAssetEntry,
	clearLocalStickerReferenceFileCache,
	createStickerLabAssetFetch,
	discoverLocalStickerReferenceCatalogs,
	getLocalStickerReferenceFileCacheStatus,
	loadLocalBridgeStickerReferenceFile,
	loadLocalStickerReferenceFile,
	loadRemoteStickerReferenceFile,
	loadStickerLabReferenceFile,
	loadStickerLabThumbnail,
	LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS,
	releaseLocalStickerReferenceFile,
	stickerLabPrivateManifestUrl,
	stickerLabThumbnailUrl,
	supportsLocalStickerReferences,
} from "../local-sticker-reference";

const platformMocks = vi.hoisted(() => ({
	discoverLocalReferences: vi.fn(),
	hasCapability: vi.fn(),
	readLocalReference: vi.fn(),
}));

vi.mock("@qcut/platform-core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@qcut/platform-core")>();
	return {
		...actual,
		platform: () => ({
			hasCapability: platformMocks.hasCapability,
			stickerLab: {
				discoverLocalReferences: platformMocks.discoverLocalReferences,
				readLocalReference: platformMocks.readLocalReference,
			},
		}),
	};
});

const REMOTE_PROVENANCE = createRemoteStickerCatalog().provenance;

describe("local sticker reference files", () => {
	beforeEach(() => {
		platformMocks.discoverLocalReferences.mockReset();
		platformMocks.hasCapability.mockReset();
		platformMocks.hasCapability.mockReturnValue(true);
		platformMocks.readLocalReference.mockReset();
		clearLocalStickerReferenceFileCache();
	});

	it("uses remote fallback silently when local references are unsupported", async () => {
		platformMocks.hasCapability.mockReturnValue(false);
		expect(supportsLocalStickerReferences()).toBe(false);

		await expect(discoverLocalStickerReferenceCatalogs()).resolves.toEqual({
			catalogs: [],
			warningCount: 0,
		});
		expect(platformMocks.discoverLocalReferences).not.toHaveBeenCalled();
	});

	it("reports local reference support for desktop", () => {
		expect(supportsLocalStickerReferences()).toBe(true);
	});

	it("discovers and reads a verified repository-external reference", async () => {
		const catalog = createLocalBridgeStickerCatalog();
		const reference = createLocalBridgeStickerReference();
		platformMocks.discoverLocalReferences.mockResolvedValue({
			rootPath: reference.asset.rootPath,
			catalogs: [catalog],
			warnings: [{ message: "one ignored batch" }],
			summary: {
				batchCount: 1,
				categoryCount: 1,
				itemCount: 1,
				totalBytes: 4,
			},
		});
		platformMocks.readLocalReference.mockResolvedValue({
			bytes: new Uint8Array([1, 2, 3, 4]),
			fileName: reference.fileName,
			mimeType: reference.mimeType,
			batchId: reference.asset.batchId,
			stickerId: reference.asset.stickerId,
			checksumSha256: reference.asset.checksumSha256,
		});

		await expect(discoverLocalStickerReferenceCatalogs()).resolves.toEqual({
			catalogs: [catalog],
			warningCount: 1,
		});
		const file = await loadStickerLabReferenceFile({ reference });
		expect(file.name).toBe(reference.fileName);
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
		expect(platformMocks.readLocalReference).toHaveBeenCalledWith({
			rootPath: reference.asset.rootPath,
			batchId: reference.asset.batchId,
			stickerId: reference.asset.stickerId,
		});
		await expect(loadStickerLabReferenceFile({ reference })).resolves.toBe(
			file
		);
		expect(platformMocks.readLocalReference).toHaveBeenCalledTimes(1);
		expect(buildStickerReferenceUsageMetadata({ reference })).toEqual({
			referenceOnly: true,
			usage: "internal-reference-only",
			redistribution: "prohibited",
			batchId: reference.asset.batchId,
			itemId: reference.id,
			checksumSha256: reference.asset.checksumSha256,
		});
	});

	it("deduplicates concurrent reads of the same verified local reference", async () => {
		const reference = createLocalBridgeStickerReference();
		platformMocks.readLocalReference.mockResolvedValue({
			bytes: new Uint8Array([1, 2, 3, 4]),
			fileName: reference.fileName,
			mimeType: reference.mimeType,
			batchId: reference.asset.batchId,
			stickerId: reference.asset.stickerId,
			checksumSha256: reference.asset.checksumSha256,
		});

		const [left, right] = await Promise.all([
			loadStickerLabReferenceFile({ reference }),
			loadStickerLabReferenceFile({ reference }),
		]);

		expect(left).toBe(right);
		expect(platformMocks.readLocalReference).toHaveBeenCalledTimes(1);
	});

	it("releases a cached local File and reads it again on demand", async () => {
		const reference = createLocalBridgeStickerReference();
		platformMocks.readLocalReference.mockResolvedValue({
			bytes: new Uint8Array([1, 2, 3, 4]),
			fileName: reference.fileName,
			mimeType: reference.mimeType,
			batchId: reference.asset.batchId,
			stickerId: reference.asset.stickerId,
			checksumSha256: reference.asset.checksumSha256,
		});

		await loadLocalBridgeStickerReferenceFile({ reference });
		expect(getLocalStickerReferenceFileCacheStatus()).toMatchObject({
			entryCount: 1,
			totalBytes: 4,
		});

		releaseLocalStickerReferenceFile({ reference });
		expect(getLocalStickerReferenceFileCacheStatus()).toMatchObject({
			entryCount: 0,
			totalBytes: 0,
		});

		await loadLocalBridgeStickerReferenceFile({ reference });
		expect(platformMocks.readLocalReference).toHaveBeenCalledTimes(2);
	});

	it("does not let an in-flight read repopulate a cleared cache", async () => {
		const reference = createLocalBridgeStickerReference();
		let resolveRead!: (result: {
			batchId: string;
			bytes: Uint8Array;
			checksumSha256: string;
			fileName: string;
			mimeType: string;
			stickerId: string;
		}) => void;
		platformMocks.readLocalReference.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveRead = resolve;
				})
		);
		const pending = loadLocalBridgeStickerReferenceFile({ reference });
		expect(getLocalStickerReferenceFileCacheStatus().inFlightCount).toBe(1);

		clearLocalStickerReferenceFileCache();
		resolveRead({
			bytes: new Uint8Array([1, 2, 3, 4]),
			fileName: reference.fileName,
			mimeType: reference.mimeType,
			batchId: reference.asset.batchId,
			stickerId: reference.asset.stickerId,
			checksumSha256: reference.asset.checksumSha256,
		});
		await pending;

		expect(getLocalStickerReferenceFileCacheStatus()).toMatchObject({
			entryCount: 0,
			inFlightCount: 0,
			totalBytes: 0,
		});
	});

	it("evicts the oldest local Files at the explicit entry cap", async () => {
		const references = Array.from(
			{ length: LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS.maxEntries + 1 },
			(_, index) =>
				createLocalBridgeStickerReference({
					checksumSha256: index.toString(16).padStart(64, "0"),
					id: `cache-${index}`,
				})
		);
		platformMocks.readLocalReference.mockImplementation(
			async ({ stickerId }: { stickerId: string }) => {
				const reference = references.find(
					(candidate) => candidate.asset.stickerId === stickerId
				);
				if (!reference) throw new Error(`Unknown reference: ${stickerId}`);
				return {
					bytes: new Uint8Array([1, 2, 3, 4]),
					fileName: reference.fileName,
					mimeType: reference.mimeType,
					batchId: reference.asset.batchId,
					stickerId: reference.asset.stickerId,
					checksumSha256: reference.asset.checksumSha256,
				};
			}
		);

		await Promise.all(
			references.map((reference) =>
				loadLocalBridgeStickerReferenceFile({ reference })
			)
		);
		expect(getLocalStickerReferenceFileCacheStatus()).toMatchObject({
			entryCount: LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS.maxEntries,
			maxEntries: LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS.maxEntries,
			totalBytes: LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS.maxEntries * 4,
		});

		const firstReference = references[0];
		if (!firstReference) throw new Error("Expected a cache fixture");
		await loadLocalBridgeStickerReferenceFile({ reference: firstReference });
		expect(platformMocks.readLocalReference).toHaveBeenCalledTimes(
			LOCAL_STICKER_REFERENCE_FILE_CACHE_LIMITS.maxEntries + 2
		);
	});
	it("loads an owned image file through the injected desktop reader", async () => {
		const reference = createLocalStickerReference({ id: "curved-arrow" });
		const bytes = new Uint8Array([137, 80, 78, 71]);
		const readFile = vi.fn(async () => bytes);

		const file = await loadLocalStickerReferenceFile({
			reference,
			readFile,
		});

		expect(readFile).toHaveBeenCalledWith({ filePath: reference.filePath });
		expect(file.name).toBe("curved-arrow.png");
		expect(file.type).toBe("image/png");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
		bytes.fill(0);
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([
			137, 80, 78, 71,
		]);
	});

	it("rejects a missing local file", async () => {
		const reference = createLocalStickerReference({ id: "missing" });

		await expect(
			loadLocalStickerReferenceFile({
				reference,
				readFile: async () => null,
			})
		).rejects.toThrow("Unable to read local sticker");
	});

	it("maps a remote reference to a stable checksummed asset entry", () => {
		const reference = createRemoteStickerReference({ id: "curved-arrow" });

		expect(
			buildStickerLabAssetEntry({
				licenseServerUrl: "https://license.example/",
				provenance: REMOTE_PROVENANCE,
				reference,
			})
		).toMatchObject({
			id: `sticker-lab:${reference.asset.objectKey}`,
			kind: "sticker",
			delivery: "remote",
			files: [
				{
					role: "source",
					url: "https://license.example/api/sticker-lab/assets?objectKey=catalogs%2Fqcut-original-test%2Fassets%2Fcurved-arrow.gif",
					mimeType: "image/gif",
					byteSize: reference.asset.byteSize,
					checksumSha256: reference.asset.checksumSha256,
				},
			],
			license: {
				name: "MIT",
				commercialUse: "allowed",
				attributionRequired: false,
			},
		});
	});

	it("adds a bearer token only for the configured license-server origin", async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async (_input, _init) => new Response("ok")
		);
		const getToken = vi.fn(async () => "session-token");
		const authenticatedFetch = createStickerLabAssetFetch({
			fetchImpl: fetchImpl as typeof fetch,
			getToken,
			licenseServerUrl: "https://license.example",
		});

		await authenticatedFetch("https://assets.example/reference.gif", {
			headers: { "X-Test": "public" },
		});
		await authenticatedFetch(
			"https://license.example/api/sticker-lab/assets?objectKey=asset",
			{ headers: { "X-Test": "private" } }
		);

		expect(getToken).toHaveBeenCalledTimes(1);
		const publicInit = fetchImpl.mock.calls[0]?.[1];
		expect(new Headers(publicInit?.headers).get("Authorization")).toBeNull();
		const privateInit = fetchImpl.mock.calls[1]?.[1];
		expect(new Headers(privateInit?.headers).get("Authorization")).toBe(
			"Bearer session-token"
		);
		expect(new Headers(privateInit?.headers).get("X-Test")).toBe("private");
	});

	it("fails clearly before requesting a protected asset when signed out", async () => {
		const fetchImpl = vi.fn<typeof fetch>(
			async (_input, _init) => new Response("unexpected")
		);
		const authenticatedFetch = createStickerLabAssetFetch({
			fetchImpl: fetchImpl as typeof fetch,
			getToken: async () => "",
			licenseServerUrl: "https://license.example",
		});

		await expect(
			authenticatedFetch(
				"https://license.example/api/sticker-lab/assets?objectKey=asset"
			)
		).rejects.toThrow("Sign in to QCut");
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("turns a cached remote resource into the exact File for the timeline", async () => {
		const reference = createRemoteStickerReference({ id: "curved-arrow" });
		const abortController = new AbortController();
		const cachedBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
			type: "image/gif",
		});
		const ensureResources = vi.fn(async () => [
			{
				blob: cachedBlob,
				byteSize: 4,
				cacheKey: "sticker:cached",
				checksumSha256: reference.asset.checksumSha256,
				fromCache: true,
				mimeType: "image/gif",
				role: "source" as const,
				sourceUrl: "https://license.example/api/sticker-lab/assets",
				url: "https://license.example/api/sticker-lab/assets",
			},
		]);

		const file = await loadRemoteStickerReferenceFile({
			ensureResources,
			getToken: async () => "unused-on-cache-hit",
			licenseServerUrl: "https://license.example",
			provenance: REMOTE_PROVENANCE,
			reference,
			signal: abortController.signal,
		});

		expect(file.name).toBe("curved-arrow.gif");
		expect(file.type).toBe("image/gif");
		expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
		expect(ensureResources).toHaveBeenCalledWith(
			expect.objectContaining({
				asset: expect.objectContaining({
					delivery: "remote",
					files: [
						expect.objectContaining({
							byteSize: 4,
							checksumSha256: reference.asset.checksumSha256,
						}),
					],
				}),
				fetchImpl: expect.any(Function),
				roles: ["source"],
				signal: abortController.signal,
			})
		);
	});

	it("dispatches local and remote references to their matching loader", async () => {
		const local = createLocalStickerReference({ id: "local-arrow" });
		const localFile = await loadStickerLabReferenceFile({
			reference: local,
			readFile: async () => new Uint8Array([1, 2]),
		});
		expect(localFile.name).toBe("local-arrow.png");

		const remote = createRemoteStickerReference({ id: "remote-arrow" });
		const abortController = new AbortController();
		const ensureResources = vi.fn(async () => [
			{
				blob: new Blob([new Uint8Array([1, 2, 3, 4])]),
				byteSize: 4,
				cacheKey: "remote",
				checksumSha256: remote.asset.checksumSha256,
				fromCache: true,
				role: "source" as const,
				sourceUrl: "https://license.example/asset",
				url: "https://license.example/asset",
			},
		]);
		const remoteFile = await loadStickerLabReferenceFile({
			ensureResources,
			provenance: REMOTE_PROVENANCE,
			reference: remote,
			signal: abortController.signal,
		});
		expect(remoteFile.name).toBe("remote-arrow.gif");
		expect(ensureResources).toHaveBeenCalledWith(
			expect.objectContaining({ signal: abortController.signal })
		);
	});

	it("requires provenance before loading a remote reference", async () => {
		await expect(
			loadStickerLabReferenceFile({
				reference: createRemoteStickerReference({ id: "remote-arrow" }),
			})
		).rejects.toThrow("require catalog provenance");
	});
});

describe("sticker lab preview tier", () => {
	const licenseServerUrl = "https://license.example";

	it("targets the preview endpoint rather than the gated asset one", () => {
		const reference = createRemoteStickerReference({ id: "preview-01" });

		expect(
			stickerLabThumbnailUrl({
				licenseServerUrl,
				objectKey: reference.asset.objectKey,
			})
		).toBe(
			`${licenseServerUrl}/api/sticker-lab/thumbnail?objectKey=${encodeURIComponent(
				reference.asset.objectKey
			)}`
		);
	});

	it("sends the session token so previews stay behind sign-in", async () => {
		const reference = createRemoteStickerReference({ id: "preview-02" });
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const fetchImpl = vi.fn(
			async () => new Response(bytes, { status: 200 })
		) as unknown as typeof fetch;

		const blob = await loadStickerLabThumbnail({
			fetchImpl,
			getToken: async () => "session-token",
			licenseServerUrl,
			reference,
		});

		expect(await blob.arrayBuffer()).toEqual(bytes.buffer);
		const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
			.calls[0];
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer session-token"
		);
	});

	it("surfaces the status when a preview cannot be signed", async () => {
		const reference = createRemoteStickerReference({ id: "preview-03" });
		const fetchImpl = vi.fn(
			async () => new Response("nope", { status: 403 })
		) as unknown as typeof fetch;

		await expect(
			loadStickerLabThumbnail({
				fetchImpl,
				getToken: async () => "session-token",
				licenseServerUrl,
				reference,
			})
		).rejects.toThrow("403");
	});
});

describe("private sticker catalog URLs", () => {
	it.each(
		PRIVATE_STICKER_CATALOG_IDS
	)("requests %s explicitly so rolling deployments cannot substitute catalogs", (catalogId) => {
		expect(
			stickerLabPrivateManifestUrl({
				catalogId,
				licenseServerUrl: "https://license.example/",
			})
		).toBe(
			`https://license.example/api/sticker-lab/private-manifest?catalogId=${catalogId}`
		);
	});
});
