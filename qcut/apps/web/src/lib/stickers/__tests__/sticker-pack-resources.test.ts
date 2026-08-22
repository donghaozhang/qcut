import { describe, expect, it, vi } from "vitest";
import type {
	AssetResourceCacheStorage,
	CachedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import type { StickerStorePack } from "../sticker-pack-catalog";
import {
	installStickerPackResources,
	removeStickerPackResources,
} from "../sticker-pack-resources";

class MemoryAssetCache implements AssetResourceCacheStorage {
	readonly resources = new Map<string, CachedAssetResource>();
	listCalls = 0;

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
		this.listCalls += 1;
		return [...this.resources.values()];
	}
}

function remotePack(): StickerStorePack {
	return {
		accessTier: "free",
		animated: false,
		builtIn: false,
		delivery: "remote",
		description: "Remote test pack",
		emoji: "R",
		id: "remote-test-pack",
		items: [
			{
				animated: false,
				collection: "fluent-emoji",
				icon: "camera-20-regular",
				id: "fluent-emoji:camera-20-regular",
				name: "Camera",
			},
			{
				animated: false,
				collection: "fluent-emoji",
				icon: "heart-20-regular",
				id: "fluent-emoji:heart-20-regular",
				name: "Heart",
			},
		],
		localizedName: "远程测试包",
		name: "Remote Test Pack",
		version: 1,
	};
}

describe("sticker pack resources", () => {
	it("downloads, reuses, and removes every remote source in a pack", async () => {
		const storage = new MemoryAssetCache();
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			Promise.resolve(
				new Response("<svg/>", {
					headers: {
						"content-length": "6",
						"content-type": "image/svg+xml",
					},
					status: 200,
				})
			)
		);
		const progress: number[] = [];
		const first = await installStickerPackResources({
			concurrency: 2,
			fetchImpl,
			onProgress: ({ progress: value }) => progress.push(value),
			pack: remotePack(),
			storage,
		});

		expect(first).toEqual({ cachedBytes: 12, resourceCount: 2 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(storage.resources.size).toBe(2);
		expect(progress.at(-1)).toBe(1);

		const second = await installStickerPackResources({
			fetchImpl,
			pack: remotePack(),
			storage,
		});
		expect(second).toEqual({ cachedBytes: 12, resourceCount: 2 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		expect(
			await removeStickerPackResources({ pack: remotePack(), storage })
		).toEqual({ removedResourceCount: 2 });
		expect(storage.resources.size).toBe(0);
		expect(storage.listCalls).toBe(1);
	});

	it("reports the failing asset and leaves the operation retryable", async () => {
		const failures: string[] = [];
		await expect(
			installStickerPackResources({
				concurrency: 1,
				fetchImpl: vi.fn<typeof fetch>(async () =>
					Promise.resolve(new Response("", { status: 404 }))
				),
				onAssetProgress: ({ error, status }) => {
					if (status === "failed" && error) failures.push(error);
				},
				pack: remotePack(),
				retryCount: 0,
				storage: new MemoryAssetCache(),
			})
		).rejects.toThrow("404");
		expect(failures).toEqual([expect.stringContaining("404")]);
	});

	it("rejects empty packs before starting an installation", async () => {
		await expect(
			installStickerPackResources({
				concurrency: Number.NaN,
				pack: { ...remotePack(), items: [] },
				storage: new MemoryAssetCache(),
			})
		).rejects.toThrow("cannot be empty");
	});
});
