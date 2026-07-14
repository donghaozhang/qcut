import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	ensureAssetResources,
	removeAssetResourceVersion,
	type AssetResourceCacheStorage,
} from "@/lib/assets/asset-resource-cache";
import {
	resolveStickerPackItemAsset,
	type StickerStorePack,
} from "./sticker-pack-catalog";

export interface StickerPackProgress {
	completedItems: number;
	progress: number;
	totalItems: number;
}

export interface StickerPackAssetProgress {
	asset: AssetManifestEntry;
	cacheKey?: string;
	error?: string;
	progress: number;
	status: "downloading" | "downloaded" | "failed";
}

export interface StickerPackInstallResult {
	cachedBytes: number;
	resourceCount: number;
}

export interface StickerPackRemovalResult {
	removedResourceCount: number;
}

interface ConcurrentTaskResult<TResult> {
	index: number;
	result: TResult;
}

function operationAssets({
	pack,
}: {
	pack: StickerStorePack;
}): AssetManifestEntry[] {
	const assets = pack.items.map((item) =>
		resolveStickerPackItemAsset({ item })
	);
	const uniqueAssets = new Map(
		assets.map((asset) => [`${asset.kind}:${asset.id}@${asset.version}`, asset])
	);
	if (uniqueAssets.size !== assets.length) {
		throw new Error(`Sticker pack contains duplicate assets: ${pack.id}`);
	}
	return assets;
}

function workerCount({
	concurrency,
	totalItems,
}: {
	concurrency: number;
	totalItems: number;
}): number {
	return Math.min(
		totalItems,
		Math.max(1, Math.min(8, Math.floor(concurrency)))
	);
}

function throwIfAborted({ signal }: { signal?: AbortSignal }): void {
	if (!signal?.aborted) return;
	const error = new Error("Sticker pack operation aborted");
	error.name = "AbortError";
	throw error;
}

async function runConcurrentTasks<TItem, TResult>({
	concurrency,
	items,
	signal,
	task,
}: {
	concurrency: number;
	items: readonly TItem[];
	signal?: AbortSignal;
	task: ({ item, index }: { item: TItem; index: number }) => Promise<TResult>;
}): Promise<TResult[]> {
	if (items.length === 0) return [];
	let nextIndex = 0;
	const results: Array<ConcurrentTaskResult<TResult> | undefined> = Array.from({
		length: items.length,
	});
	const runNext = async (): Promise<void> => {
		throwIfAborted({ signal });
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		const item = items[index];
		if (item === undefined) return;
		const result = await task({ item, index });
		results[index] = { index, result };
		return runNext();
	};
	await Promise.all(
		Array.from(
			{ length: workerCount({ concurrency, totalItems: items.length }) },
			() => runNext()
		)
	);
	return results.map((entry, index) => {
		if (!entry) throw new Error(`Sticker pack task did not finish: ${index}`);
		return entry.result;
	});
}

function aggregateProgress({
	progressByIndex,
}: {
	progressByIndex: readonly number[];
}): number {
	if (progressByIndex.length === 0) return 1;
	return (
		progressByIndex.reduce((total, progress) => total + progress, 0) /
		progressByIndex.length
	);
}

export async function installStickerPackResources({
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
	onAssetProgress?: (progress: StickerPackAssetProgress) => void;
	onProgress?: (progress: StickerPackProgress) => void;
	pack: StickerStorePack;
	retryCount?: number;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<StickerPackInstallResult> {
	const assets = operationAssets({ pack });
	const progressByIndex = assets.map(() => 0);
	let completedItems = 0;
	const reportPackProgress = () =>
		onProgress?.({
			completedItems,
			progress: aggregateProgress({ progressByIndex }),
			totalItems: assets.length,
		});
	reportPackProgress();

	const results = await runConcurrentTasks({
		concurrency,
		items: assets,
		signal,
		task: async ({ item: asset, index }) => {
			onAssetProgress?.({ asset, progress: 0, status: "downloading" });
			try {
				const resources = await ensureAssetResources({
					asset,
					fetchImpl,
					onProgress: ({ progress }) => {
						progressByIndex[index] = progress;
						onAssetProgress?.({
							asset,
							progress,
							status: "downloading",
						});
						reportPackProgress();
					},
					roles: ["source"],
					retryCount,
					signal,
					storage,
				});
				progressByIndex[index] = 1;
				completedItems += 1;
				const cacheKey = resources[0]?.cacheKey;
				onAssetProgress?.({
					asset,
					cacheKey,
					progress: 1,
					status: "downloaded",
				});
				reportPackProgress();
				return {
					cachedBytes: resources.reduce(
						(total, resource) => total + (resource.byteSize ?? 0),
						0
					),
					resourceCount: resources.length,
				};
			} catch (error) {
				onAssetProgress?.({
					asset,
					error: error instanceof Error ? error.message : "Download failed",
					progress: progressByIndex[index] ?? 0,
					status: "failed",
				});
				throw error;
			}
		},
	});

	return results.reduce<StickerPackInstallResult>(
		(total, result) => ({
			cachedBytes: total.cachedBytes + result.cachedBytes,
			resourceCount: total.resourceCount + result.resourceCount,
		}),
		{ cachedBytes: 0, resourceCount: 0 }
	);
}

export async function removeStickerPackResources({
	concurrency = 4,
	onProgress,
	pack,
	signal,
	storage,
}: {
	concurrency?: number;
	onProgress?: (progress: StickerPackProgress) => void;
	pack: StickerStorePack;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<StickerPackRemovalResult> {
	const assets = operationAssets({ pack });
	let completedItems = 0;
	onProgress?.({ completedItems, progress: 0, totalItems: assets.length });
	const removedCounts = await runConcurrentTasks({
		concurrency,
		items: assets,
		signal,
		task: async ({ item: asset }) => {
			throwIfAborted({ signal });
			const removedCount =
				asset.delivery === "remote"
					? await removeAssetResourceVersion({ asset, storage })
					: 0;
			completedItems += 1;
			onProgress?.({
				completedItems,
				progress: completedItems / assets.length,
				totalItems: assets.length,
			});
			return removedCount;
		},
	});
	return {
		removedResourceCount: removedCounts.reduce(
			(total, count) => total + count,
			0
		),
	};
}
