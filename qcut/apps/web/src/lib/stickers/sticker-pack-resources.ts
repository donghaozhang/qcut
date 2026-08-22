import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	installAssetPackResources,
	removeAssetPackResources,
	type AssetPackAssetProgress,
	type AssetPackInstallResult,
	type AssetPackProgress,
	type AssetPackRemovalResult,
} from "@/lib/assets/asset-pack-resources";
import type { AssetResourceCacheStorage } from "@/lib/assets/asset-resource-cache";
import {
	resolveStickerPackItemAsset,
	type StickerStorePack,
} from "./sticker-pack-catalog";

export type {
	AssetPackAssetProgress as StickerPackAssetProgress,
	AssetPackInstallResult as StickerPackInstallResult,
	AssetPackProgress as StickerPackProgress,
	AssetPackRemovalResult as StickerPackRemovalResult,
};

function packAssets({
	pack,
}: {
	pack: StickerStorePack;
}): AssetManifestEntry[] {
	return pack.items.map((item) => resolveStickerPackItemAsset({ item }));
}

export function installStickerPackResources({
	concurrency = 4,
	fetchImpl = fetch,
	onAssetProgress,
	onProgress,
	pack,
	retryCount = 2,
	signal,
	storage,
}: {
	concurrency?: number;
	fetchImpl?: typeof fetch;
	onAssetProgress?: (progress: AssetPackAssetProgress) => void;
	onProgress?: (progress: AssetPackProgress) => void;
	pack: StickerStorePack;
	retryCount?: number;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<AssetPackInstallResult> {
	return installAssetPackResources({
		assets: packAssets({ pack }),
		concurrency,
		fetchImpl,
		onAssetProgress,
		onProgress,
		packId: pack.id,
		retryCount,
		signal,
		storage,
	});
}

export function removeStickerPackResources({
	concurrency = 4,
	onProgress,
	pack,
	signal,
	storage,
}: {
	concurrency?: number;
	onProgress?: (progress: AssetPackProgress) => void;
	pack: StickerStorePack;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<AssetPackRemovalResult> {
	return removeAssetPackResources({
		assets: packAssets({ pack }),
		concurrency,
		onProgress,
		packId: pack.id,
		signal,
		storage,
	});
}
