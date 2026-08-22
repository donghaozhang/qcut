import {
	assetManifestVersionKey,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import {
	inspectAssetPackResources,
	installAssetPackResources,
	removeAssetPackResources,
	type AssetPackProgress,
} from "@/lib/assets/asset-pack-resources";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import type { SessionTokenReader } from "@/lib/assets/license-server-authenticated-fetch";
import {
	buildSoundEffectsLabAssetEntry,
	createSoundEffectsLabAssetFetch,
} from "./local-sound-effect-reference";
import {
	parsePrivateSoundEffectsLabManifest,
	type PrivateSoundEffectsLabManifest,
} from "./local-sound-effects-manifest";
import {
	getSoundEffectsLabOfflinePackStorage,
	normalizeSoundEffectsLabOfflineOwner,
	type SoundEffectsLabOfflinePackRecord,
	type SoundEffectsLabOfflinePackStorage,
} from "./sound-effects-lab-offline-store";

const PACK_ID = "sound-effects-lab-private";
const STORAGE_RESERVE_BYTES = 8 * 1024 * 1024;

interface BrowserStorageManager {
	estimate: () => Promise<{ quota?: number; usage?: number }>;
	persist: () => Promise<boolean>;
}

export interface SoundEffectsLabOfflinePackSnapshot {
	cachedBytes: number;
	catalog: PrivateSoundEffectsLabManifest;
	installedAt: number;
	persistentStorage: boolean;
	totalBytes: number;
}

export interface SoundEffectsLabOfflinePackInstallResult {
	cachedBytes: number;
	installedAt: number;
	persistentStorage: boolean;
	resourceCount: number;
}

export interface SoundEffectsLabOfflinePackStatus {
	cachedBytes: number;
	installedAt?: number;
	persistentStorage: boolean;
	state: "incomplete" | "installed" | "not-installed" | "update-available";
	totalBytes: number;
}

function defaultBrowserStorageManager(): BrowserStorageManager | undefined {
	if (typeof navigator === "undefined" || !navigator.storage) return undefined;
	return {
		estimate: () => navigator.storage.estimate(),
		persist: () => navigator.storage.persist(),
	};
}

function catalogAssets({
	catalog,
}: {
	catalog: PrivateSoundEffectsLabManifest;
}): AssetManifestEntry[] {
	return catalog.items.map((reference) =>
		buildSoundEffectsLabAssetEntry({ reference })
	);
}

function catalogTotalBytes({
	catalog,
}: {
	catalog: PrivateSoundEffectsLabManifest;
}): number {
	return catalog.items.reduce((total, item) => total + item.byteSize, 0);
}

function serializeCatalog({
	catalog,
}: {
	catalog: PrivateSoundEffectsLabManifest;
}): string {
	const normalized = parsePrivateSoundEffectsLabManifest({
		jsonText: JSON.stringify(catalog),
	});
	return JSON.stringify(normalized);
}

function parseOfflineRecord({
	record,
}: {
	record: SoundEffectsLabOfflinePackRecord;
}): PrivateSoundEffectsLabManifest | null {
	try {
		const catalog = parsePrivateSoundEffectsLabManifest({
			jsonText: record.manifestJson,
		});
		const validMetadata =
			record.catalogId === catalog.catalogId &&
			record.generatedAt === catalog.generatedAt &&
			record.itemCount === catalog.items.length &&
			record.totalBytes === catalogTotalBytes({ catalog });
		return validMetadata ? catalog : null;
	} catch {
		return null;
	}
}

async function readOfflineRecord({
	offlineStorage,
	ownerEmail,
}: {
	offlineStorage: SoundEffectsLabOfflinePackStorage;
	ownerEmail: string;
}): Promise<{
	catalog: PrivateSoundEffectsLabManifest;
	record: SoundEffectsLabOfflinePackRecord;
} | null> {
	const normalizedOwner = normalizeSoundEffectsLabOfflineOwner({ ownerEmail });
	if (!normalizedOwner) return null;
	const record = await offlineStorage.get({ ownerEmail: normalizedOwner });
	if (!record || record.ownerEmail !== normalizedOwner) return null;
	const catalog = parseOfflineRecord({ record });
	return catalog ? { catalog, record } : null;
}

async function requestPersistentStorage({
	storageManager,
}: {
	storageManager?: BrowserStorageManager;
}): Promise<boolean> {
	if (!storageManager) return false;
	try {
		return await storageManager.persist();
	} catch {
		return false;
	}
}

async function assertStorageCapacity({
	requiredBytes,
	storageManager,
}: {
	requiredBytes: number;
	storageManager?: BrowserStorageManager;
}): Promise<void> {
	if (!storageManager || requiredBytes <= 0) return;
	let estimate: { quota?: number; usage?: number };
	try {
		estimate = await storageManager.estimate();
	} catch {
		return;
	}
	const { quota, usage } = estimate;
	if (!Number.isFinite(quota) || !Number.isFinite(usage)) return;
	const availableBytes = Math.max(0, (quota ?? 0) - (usage ?? 0));
	if (availableBytes < requiredBytes + STORAGE_RESERVE_BYTES) {
		throw new Error(
			`Not enough local storage for the Sound Effects Lab offline pack: ${requiredBytes} bytes required`
		);
	}
}

function assetVersionKey({ asset }: { asset: AssetManifestEntry }): string {
	return assetManifestVersionKey({
		id: asset.id,
		kind: asset.kind,
		version: asset.version,
	});
}

async function retainedAssetKeys({
	offlineStorage,
}: {
	offlineStorage: SoundEffectsLabOfflinePackStorage;
}): Promise<Set<string>> {
	const retained = new Set<string>();
	for (const record of await offlineStorage.list()) {
		const catalog = parseOfflineRecord({ record });
		if (!catalog) continue;
		for (const asset of catalogAssets({ catalog })) {
			retained.add(assetVersionKey({ asset }));
		}
	}
	return retained;
}

async function removeUnreferencedCatalogAssets({
	assetStorage,
	catalog,
	offlineStorage,
}: {
	assetStorage?: AssetResourceCacheStorage;
	catalog: PrivateSoundEffectsLabManifest;
	offlineStorage: SoundEffectsLabOfflinePackStorage;
}): Promise<number> {
	const retained = await retainedAssetKeys({ offlineStorage });
	const removable = catalogAssets({ catalog }).filter(
		(asset) => !retained.has(assetVersionKey({ asset }))
	);
	if (removable.length === 0) return 0;
	const result = await removeAssetPackResources({
		assets: removable,
		packId: PACK_ID,
		storage: assetStorage,
	});
	return result.removedResourceCount;
}

export async function loadSoundEffectsLabOfflinePack({
	assetStorage,
	offlineStorage = getSoundEffectsLabOfflinePackStorage(),
	ownerEmail,
}: {
	assetStorage?: AssetResourceCacheStorage;
	offlineStorage?: SoundEffectsLabOfflinePackStorage;
	ownerEmail: string;
}): Promise<SoundEffectsLabOfflinePackSnapshot | null> {
	const offline = await readOfflineRecord({ offlineStorage, ownerEmail });
	if (!offline) return null;
	const inspection = await inspectAssetPackResources({
		assets: catalogAssets({ catalog: offline.catalog }),
		packId: PACK_ID,
		storage: assetStorage,
	});
	if (!inspection.complete) return null;
	return {
		cachedBytes: inspection.cachedBytes,
		catalog: offline.catalog,
		installedAt: offline.record.installedAt,
		persistentStorage: offline.record.persistentStorage,
		totalBytes: offline.record.totalBytes,
	};
}

export async function getSoundEffectsLabOfflinePackStatus({
	assetStorage,
	catalog,
	offlineStorage = getSoundEffectsLabOfflinePackStorage(),
	ownerEmail,
}: {
	assetStorage?: AssetResourceCacheStorage;
	catalog: PrivateSoundEffectsLabManifest;
	offlineStorage?: SoundEffectsLabOfflinePackStorage;
	ownerEmail: string;
}): Promise<SoundEffectsLabOfflinePackStatus> {
	const totalBytes = catalogTotalBytes({ catalog });
	const offline = await readOfflineRecord({ offlineStorage, ownerEmail });
	if (!offline) {
		return {
			cachedBytes: 0,
			persistentStorage: false,
			state: "not-installed",
			totalBytes,
		};
	}
	if (
		serializeCatalog({ catalog: offline.catalog }) !==
		serializeCatalog({ catalog })
	) {
		return {
			cachedBytes: offline.record.totalBytes,
			installedAt: offline.record.installedAt,
			persistentStorage: offline.record.persistentStorage,
			state: "update-available",
			totalBytes,
		};
	}
	const inspection = await inspectAssetPackResources({
		assets: catalogAssets({ catalog }),
		packId: PACK_ID,
		storage: assetStorage,
	});
	return {
		cachedBytes: inspection.cachedBytes,
		installedAt: offline.record.installedAt,
		persistentStorage: offline.record.persistentStorage,
		state: inspection.complete ? "installed" : "incomplete",
		totalBytes,
	};
}

export async function installSoundEffectsLabOfflinePack({
	assetStorage,
	catalog,
	fetchImpl,
	getToken,
	offlineStorage = getSoundEffectsLabOfflinePackStorage(),
	onProgress,
	ownerEmail,
	signal,
	storageManager = defaultBrowserStorageManager(),
}: {
	assetStorage?: AssetResourceCacheStorage;
	catalog: PrivateSoundEffectsLabManifest;
	fetchImpl?: typeof fetch;
	getToken?: SessionTokenReader;
	offlineStorage?: SoundEffectsLabOfflinePackStorage;
	onProgress?: (progress: AssetPackProgress) => void;
	ownerEmail: string;
	signal?: AbortSignal;
	storageManager?: BrowserStorageManager;
}): Promise<SoundEffectsLabOfflinePackInstallResult> {
	const normalizedOwner = normalizeSoundEffectsLabOfflineOwner({ ownerEmail });
	if (!normalizedOwner) {
		throw new Error(
			"Sign in before downloading the Sound Effects Lab offline pack"
		);
	}
	const assets = catalogAssets({ catalog });
	const before = await inspectAssetPackResources({
		assets,
		packId: PACK_ID,
		storage: assetStorage,
	});
	const totalBytes = catalogTotalBytes({ catalog });
	await assertStorageCapacity({
		requiredBytes: Math.max(0, totalBytes - before.cachedBytes),
		storageManager,
	});
	const persistentStorage = await requestPersistentStorage({ storageManager });
	const previous = await readOfflineRecord({
		offlineStorage,
		ownerEmail: normalizedOwner,
	});
	const result = await installAssetPackResources({
		assets,
		fetchImpl: createSoundEffectsLabAssetFetch({ fetchImpl, getToken }),
		onProgress,
		packId: PACK_ID,
		signal,
		storage: assetStorage,
	});
	if (
		result.resourceCount !== assets.length ||
		result.cachedBytes !== totalBytes
	) {
		throw new Error("Sound Effects Lab offline pack did not cache every asset");
	}
	const installedAt = Date.now();
	await offlineStorage.put({
		record: {
			catalogId: catalog.catalogId,
			generatedAt: catalog.generatedAt,
			installedAt,
			itemCount: catalog.items.length,
			manifestJson: serializeCatalog({ catalog }),
			ownerEmail: normalizedOwner,
			persistentStorage,
			totalBytes,
		},
	});
	if (
		previous &&
		serializeCatalog({ catalog: previous.catalog }) !==
			serializeCatalog({ catalog })
	) {
		await removeUnreferencedCatalogAssets({
			assetStorage,
			catalog: previous.catalog,
			offlineStorage,
		});
	}
	return {
		cachedBytes: result.cachedBytes,
		installedAt,
		persistentStorage,
		resourceCount: result.resourceCount,
	};
}

export async function removeSoundEffectsLabOfflinePack({
	assetStorage,
	offlineStorage = getSoundEffectsLabOfflinePackStorage(),
	onProgress,
	ownerEmail,
}: {
	assetStorage?: AssetResourceCacheStorage;
	offlineStorage?: SoundEffectsLabOfflinePackStorage;
	onProgress?: (progress: AssetPackProgress) => void;
	ownerEmail: string;
}): Promise<{ removedResourceCount: number }> {
	const offline = await readOfflineRecord({ offlineStorage, ownerEmail });
	if (!offline) return { removedResourceCount: 0 };
	await offlineStorage.remove({ ownerEmail });
	const retained = await retainedAssetKeys({ offlineStorage });
	const removable = catalogAssets({ catalog: offline.catalog }).filter(
		(asset) => !retained.has(assetVersionKey({ asset }))
	);
	if (removable.length === 0) return { removedResourceCount: 0 };
	return removeAssetPackResources({
		assets: removable,
		onProgress,
		packId: PACK_ID,
		storage: assetStorage,
	});
}
