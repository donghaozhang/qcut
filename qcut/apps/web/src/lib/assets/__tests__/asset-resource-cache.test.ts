import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureAssetResources,
	pruneAssetResourceCache,
	type AssetResourceCacheStorage,
	type CachedAssetResource,
} from "../asset-resource-cache";

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

function remoteAsset({
	checksumSha256,
	version = 1,
	byteSize,
}: {
	byteSize?: number;
	checksumSha256?: string;
	version?: number;
} = {}): AssetManifestEntry {
	return {
		category: "camera",
		delivery: "remote",
		files: [
			{
				byteSize,
				checksumSha256,
				mimeType: "text/plain",
				role: "source",
				url: "https://assets.test/whip.txt",
			},
		],
		id: "whip-pack",
		kind: "transition",
		license: {
			attributionRequired: false,
			commercialUse: "allowed",
			name: "QCut",
		},
		name: "Whip Pack",
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		tags: ["camera"],
		version,
	};
}

function bundledAsset({
	checksumSha256,
}: {
	checksumSha256?: string;
} = {}): AssetManifestEntry {
	return {
		...remoteAsset({ byteSize: 5, checksumSha256 }),
		delivery: "bundled",
		files: [
			{
				byteSize: 5,
				checksumSha256,
				mimeType: "text/plain",
				role: "source",
				url: "/assets/whip.txt",
			},
		],
	};
}

function successfulFetch({ body = "hello" }: { body?: string } = {}) {
	return vi.fn<typeof fetch>(async () =>
		Promise.resolve(
			new Response(body, {
				headers: {
					"content-length": String(new TextEncoder().encode(body).byteLength),
					"content-type": "text/plain",
				},
				status: 200,
			})
		)
	);
}

describe("asset resource cache", () => {
	let storage: MemoryAssetCache;

	beforeEach(() => {
		storage = new MemoryAssetCache();
	});

	it("persists a verified resource and reuses it without another request", async () => {
		const fetchImpl = successfulFetch();
		const asset = remoteAsset({
			byteSize: 5,
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
		const first = await ensureAssetResources({ asset, fetchImpl, storage });
		const second = await ensureAssetResources({ asset, fetchImpl, storage });

		expect(first[0]).toMatchObject({ fromCache: false, byteSize: 5 });
		expect(second[0]).toMatchObject({ fromCache: true, byteSize: 5 });
		expect(await second[0].blob?.text()).toBe("hello");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("refetches cached resources when the stored blob checksum is stale", async () => {
		const fetchImpl = successfulFetch();
		const asset = remoteAsset({
			byteSize: 5,
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
		storage.resources.set("transition:whip-pack@1:source:0", {
			assetIdentity: "transition:whip-pack",
			assetKey: "transition:whip-pack@1",
			blob: new Blob(["HELLO"]),
			byteSize: 5,
			cacheKey: "transition:whip-pack@1:source:0",
			cachedAt: 1,
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
			fileIndex: 0,
			lastAccessedAt: 1,
			mimeType: "text/plain",
			role: "source",
			sourceUrl: "https://assets.test/whip.txt",
			version: 1,
		});

		const result = await ensureAssetResources({ asset, fetchImpl, storage });

		expect(result[0]).toMatchObject({ fromCache: false, byteSize: 5 });
		expect(await result[0].blob?.text()).toBe("hello");
		expect(
			await storage.resources
				.get("transition:whip-pack@1:source:0")
				?.blob.text()
		).toBe("hello");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("materializes bundled resources into the cache when requested", async () => {
		const fetchImpl = successfulFetch();
		const asset = bundledAsset({
			checksumSha256:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
		const first = await ensureAssetResources({
			asset,
			cacheBundledResources: true,
			fetchImpl,
			storage,
		});
		const second = await ensureAssetResources({
			asset,
			cacheBundledResources: true,
			fetchImpl,
			storage,
		});

		expect(first[0]).toMatchObject({
			fromCache: false,
			sourceUrl: "/assets/whip.txt",
		});
		expect(second[0]).toMatchObject({
			fromCache: true,
			sourceUrl: "/assets/whip.txt",
		});
		expect(await second[0].blob?.text()).toBe("hello");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("keeps asset versions isolated for reproducible projects", async () => {
		const fetchImpl = successfulFetch();
		await ensureAssetResources({
			asset: remoteAsset({ version: 1 }),
			fetchImpl,
			storage,
		});
		await ensureAssetResources({
			asset: remoteAsset({ version: 2 }),
			fetchImpl,
			storage,
		});

		expect([...storage.resources.keys()]).toEqual([
			"transition:whip-pack@1:source:0",
			"transition:whip-pack@2:source:0",
		]);
	});

	it("does not persist resources that fail integrity validation", async () => {
		await expect(
			ensureAssetResources({
				asset: remoteAsset({ checksumSha256: "0".repeat(64) }),
				fetchImpl: successfulFetch(),
				retryCount: 0,
				storage,
			})
		).rejects.toThrow("checksum mismatch");
		expect(storage.resources.size).toBe(0);
	});

	it("retries transient server failures but not client failures", async () => {
		const transient = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response("", { status: 503 }))
			.mockResolvedValueOnce(new Response("hello", { status: 200 }));
		await ensureAssetResources({
			asset: remoteAsset(),
			fetchImpl: transient,
			retryCount: 1,
			storage,
		});
		expect(transient).toHaveBeenCalledTimes(2);

		const clientFailure = vi.fn<typeof fetch>(async () =>
			Promise.resolve(new Response("", { status: 404 }))
		);
		await expect(
			ensureAssetResources({
				asset: remoteAsset({ version: 2 }),
				fetchImpl: clientFailure,
				retryCount: 3,
				storage,
			})
		).rejects.toThrow("404");
		expect(clientFailure).toHaveBeenCalledTimes(1);
	});

	it("rejects oversized resources before reading their body", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Promise.resolve(
				new Response("ignored", {
					headers: { "content-length": "1000" },
					status: 200,
				})
			)
		);
		await expect(
			ensureAssetResources({
				asset: remoteAsset(),
				fetchImpl,
				maxFileBytes: 100,
				retryCount: 0,
				storage,
			})
		).rejects.toThrow("exceeds 100 bytes");
	});

	it("evicts least-recently-used files while protecting active versions", async () => {
		const createCached = ({
			assetKey,
			cacheKey,
			lastAccessedAt,
		}: {
			assetKey: string;
			cacheKey: string;
			lastAccessedAt: number;
		}): CachedAssetResource => ({
			assetIdentity: "transition:pack",
			assetKey,
			blob: new Blob(["12345"]),
			byteSize: 5,
			cacheKey,
			cachedAt: lastAccessedAt,
			checksumSha256: "0".repeat(64),
			fileIndex: 0,
			lastAccessedAt,
			mimeType: "text/plain",
			role: "source",
			sourceUrl: "https://assets.test/file",
			version: 1,
		});
		storage.resources.set(
			"old",
			createCached({
				assetKey: "transition:pack@1",
				cacheKey: "old",
				lastAccessedAt: 1,
			})
		);
		storage.resources.set(
			"active",
			createCached({
				assetKey: "transition:pack@2",
				cacheKey: "active",
				lastAccessedAt: 2,
			})
		);
		storage.resources.set(
			"new",
			createCached({
				assetKey: "transition:pack@3",
				cacheKey: "new",
				lastAccessedAt: 3,
			})
		);

		expect(
			await pruneAssetResourceCache({
				maxBytes: 5,
				protectedAssetKeys: ["transition:pack@2"],
				storage,
			})
		).toEqual({ remainingBytes: 5, removedCount: 2 });
		expect([...storage.resources.keys()]).toEqual(["active"]);
	});
});
