import { describe, expect, it, vi } from "vitest";
import type {
	AssetResourceCacheStorage,
	CachedAssetResource,
} from "@/lib/assets/asset-resource-cache";
import type { PrivateSoundEffectsLabManifest } from "../local-sound-effects-manifest";
import {
	getSoundEffectsLabOfflinePackStatus,
	installSoundEffectsLabOfflinePack,
	loadSoundEffectsLabOfflinePack,
	removeSoundEffectsLabOfflinePack,
} from "../sound-effects-lab-offline-pack";
import type {
	SoundEffectsLabOfflinePackRecord,
	SoundEffectsLabOfflinePackStorage,
} from "../sound-effects-lab-offline-store";

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

class MemoryOfflinePackStorage implements SoundEffectsLabOfflinePackStorage {
	readonly records = new Map<string, SoundEffectsLabOfflinePackRecord>();

	async get({ ownerEmail }: { ownerEmail: string }) {
		return this.records.get(ownerEmail.trim().toLocaleLowerCase()) ?? null;
	}

	async list() {
		return [...this.records.values()];
	}

	async put({ record }: { record: SoundEffectsLabOfflinePackRecord }) {
		this.records.set(record.ownerEmail, record);
	}

	async remove({ ownerEmail }: { ownerEmail: string }) {
		this.records.delete(ownerEmail.trim().toLocaleLowerCase());
	}
}

async function sha256Hex({ bytes }: { bytes: Uint8Array }): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", ownedBuffer({ bytes }));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

function ownedBuffer({ bytes }: { bytes: Uint8Array }): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

async function privateCatalog(): Promise<{
	bytesByMd5: Map<string, Uint8Array>;
	catalog: PrivateSoundEffectsLabManifest;
}> {
	const entries = [
		{
			bytes: new Uint8Array([1, 2, 3, 4]),
			md5: "0291b72047769e085e7595ce5d65dbd2",
			numericId: -900_000_000,
			resourceId: "6896679799100689",
			title: "唰",
		},
		{
			bytes: new Uint8Array([5, 6, 7]),
			md5: "1291b72047769e085e7595ce5d65dbd3",
			numericId: -900_000_001,
			resourceId: "6896679799100690",
			title: "砰",
		},
	];
	const items = await Promise.all(
		entries.map(async ({ bytes, md5, numericId, resourceId, title }) => {
			const checksumSha256 = await sha256Hex({ bytes });
			return {
				asset: {
					byteSize: bytes.byteLength,
					checksumSha256,
					kind: "supabase-storage" as const,
					objectKey: `jianying/2026-08-01/assets/${md5}.mp3`,
				},
				batch: "01",
				byteSize: bytes.byteLength,
				categoryIds: ["jianying-0123456789ab"],
				contentMd5: md5,
				contentSha256: checksumSha256,
				duration: 1.25,
				fileName: `${md5}.mp3`,
				id: resourceId,
				mappingStrategy: "metadata-md5" as const,
				mimeType: "audio/mpeg" as const,
				numericId,
				resourceId,
				title,
			};
		})
	);
	return {
		bytesByMd5: new Map(entries.map(({ bytes, md5 }) => [md5, bytes])),
		catalog: {
			catalogId: "jianying-sfx-reference-2026-08-01",
			categories: [{ id: "jianying-0123456789ab", label: "热门" }],
			generatedAt: "2026-08-01T00:00:00.000Z",
			items,
			provenance: {
				purpose: "internal-reference",
				redistribution: "prohibited",
				sourceApp: "Jianying Pro",
			},
			schemaVersion: 2,
		},
	};
}

function audioFetch({ bytesByMd5 }: { bytesByMd5: Map<string, Uint8Array> }) {
	return vi.fn<typeof fetch>(async (input, init) => {
		const url = new URL(
			input instanceof Request ? input.url : input.toString()
		);
		const objectKey = url.searchParams.get("objectKey") ?? "";
		const md5 = objectKey.match(/([a-f0-9]{32})\.mp3$/)?.[1] ?? "";
		const bytes = bytesByMd5.get(md5);
		if (!bytes) return new Response("", { status: 404 });
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer session-token"
		);
		return new Response(ownedBuffer({ bytes }), {
			headers: {
				"content-length": String(bytes.byteLength),
				"content-type": "audio/mpeg",
			},
		});
	});
}

const storageManager = {
	estimate: async () => ({ quota: 1024 * 1024 * 1024, usage: 0 }),
	persist: async () => true,
};

describe("Sound Effects Lab offline pack", () => {
	it("downloads, verifies, reuses, and removes the complete account-bound pack", async () => {
		const { bytesByMd5, catalog } = await privateCatalog();
		const assetStorage = new MemoryAssetCache();
		const offlineStorage = new MemoryOfflinePackStorage();
		const fetchImpl = audioFetch({ bytesByMd5 });
		const progress: number[] = [];

		const first = await installSoundEffectsLabOfflinePack({
			assetStorage,
			catalog,
			fetchImpl,
			getToken: async () => "session-token",
			offlineStorage,
			onProgress: ({ progress: value }) => progress.push(value),
			ownerEmail: "QCUTLOVE@QCUT.APP",
			storageManager,
		});

		expect(first).toMatchObject({
			cachedBytes: 7,
			persistentStorage: true,
			resourceCount: 2,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(assetStorage.resources.size).toBe(2);
		expect(progress.at(-1)).toBe(1);
		await expect(
			loadSoundEffectsLabOfflinePack({
				assetStorage,
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
			})
		).resolves.toMatchObject({ cachedBytes: 7, catalog });
		await expect(
			loadSoundEffectsLabOfflinePack({
				assetStorage,
				offlineStorage,
				ownerEmail: "another@qcut.app",
			})
		).resolves.toBeNull();

		await installSoundEffectsLabOfflinePack({
			assetStorage,
			catalog,
			fetchImpl,
			getToken: async () => "session-token",
			offlineStorage,
			ownerEmail: "qcutlove@qcut.app",
			storageManager,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		await expect(
			removeSoundEffectsLabOfflinePack({
				assetStorage,
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
			})
		).resolves.toEqual({ removedResourceCount: 2 });
		expect(assetStorage.resources.size).toBe(0);
		expect(offlineStorage.records.size).toBe(0);
	});

	it("does not publish an offline completion record after a partial failure", async () => {
		const { bytesByMd5, catalog } = await privateCatalog();
		const assetStorage = new MemoryAssetCache();
		const offlineStorage = new MemoryOfflinePackStorage();
		const firstMd5 = catalog.items[0]?.contentMd5 ?? "";
		const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
			const url = new URL(
				input instanceof Request ? input.url : input.toString()
			);
			const objectKey = url.searchParams.get("objectKey") ?? "";
			if (!objectKey.includes(firstMd5)) {
				return new Response("", { status: 404 });
			}
			const bytes = bytesByMd5.get(firstMd5) ?? new Uint8Array();
			return new Response(ownedBuffer({ bytes }), {
				headers: new Headers(init?.headers),
				status: 200,
			});
		});

		await expect(
			installSoundEffectsLabOfflinePack({
				assetStorage,
				catalog,
				fetchImpl,
				getToken: async () => "session-token",
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
				storageManager,
			})
		).rejects.toThrow("404");
		expect(offlineStorage.records.size).toBe(0);
	});

	it("detects missing cached bytes and catalog updates", async () => {
		const { bytesByMd5, catalog } = await privateCatalog();
		const assetStorage = new MemoryAssetCache();
		const offlineStorage = new MemoryOfflinePackStorage();
		await installSoundEffectsLabOfflinePack({
			assetStorage,
			catalog,
			fetchImpl: audioFetch({ bytesByMd5 }),
			getToken: async () => "session-token",
			offlineStorage,
			ownerEmail: "qcutlove@qcut.app",
			storageManager,
		});
		assetStorage.resources.delete(
			assetStorage.resources.keys().next().value ?? ""
		);

		await expect(
			loadSoundEffectsLabOfflinePack({
				assetStorage,
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
			})
		).resolves.toBeNull();
		await expect(
			getSoundEffectsLabOfflinePackStatus({
				assetStorage,
				catalog,
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
			})
		).resolves.toMatchObject({ state: "incomplete" });

		await expect(
			getSoundEffectsLabOfflinePackStatus({
				assetStorage,
				catalog: {
					...catalog,
					generatedAt: "2026-08-02T00:00:00.000Z",
				},
				offlineStorage,
				ownerEmail: "qcutlove@qcut.app",
			})
		).resolves.toMatchObject({ state: "update-available" });
	});

	it("keeps shared cached bytes until the last account removes its record", async () => {
		const { bytesByMd5, catalog } = await privateCatalog();
		const assetStorage = new MemoryAssetCache();
		const offlineStorage = new MemoryOfflinePackStorage();
		const fetchImpl = audioFetch({ bytesByMd5 });
		for (const ownerEmail of ["one@qcut.app", "two@qcut.app"]) {
			await installSoundEffectsLabOfflinePack({
				assetStorage,
				catalog,
				fetchImpl,
				getToken: async () => "session-token",
				offlineStorage,
				ownerEmail,
				storageManager,
			});
		}

		await removeSoundEffectsLabOfflinePack({
			assetStorage,
			offlineStorage,
			ownerEmail: "one@qcut.app",
		});
		expect(assetStorage.resources.size).toBe(2);
		await expect(
			loadSoundEffectsLabOfflinePack({
				assetStorage,
				offlineStorage,
				ownerEmail: "two@qcut.app",
			})
		).resolves.not.toBeNull();
	});
});
