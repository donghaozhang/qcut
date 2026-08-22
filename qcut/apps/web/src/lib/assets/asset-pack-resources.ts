import type { AssetManifestEntry } from "@qcut/editor-core";
import {
	ensureAssetResources,
	inspectAssetResources,
	removeAssetResourceVersions,
	type AssetResourceCacheStorage,
} from "./asset-resource-cache";

export interface AssetPackProgress {
	completedItems: number;
	progress: number;
	totalItems: number;
}

export interface AssetPackAssetProgress {
	asset: AssetManifestEntry;
	cacheKey?: string;
	error?: string;
	progress: number;
	status: "downloading" | "downloaded" | "failed";
}

export interface AssetPackInstallResult {
	cachedBytes: number;
	resourceCount: number;
}

export interface AssetPackInspection {
	cachedBytes: number;
	cachedResourceCount: number;
	complete: boolean;
	resourceCount: number;
}

export interface AssetPackRemovalResult {
	removedResourceCount: number;
}

interface ConcurrentTaskResult<TResult> {
	index: number;
	result: TResult;
}

function validatedPackAssets({
	assets,
	packId,
}: {
	assets: readonly AssetManifestEntry[];
	packId: string;
}): AssetManifestEntry[] {
	if (assets.length === 0) {
		throw new Error(`Asset pack cannot be empty: ${packId}`);
	}
	const uniqueAssets = new Map(
		assets.map((asset) => [`${asset.kind}:${asset.id}@${asset.version}`, asset])
	);
	if (uniqueAssets.size !== assets.length) {
		throw new Error(`Asset pack contains duplicate assets: ${packId}`);
	}
	return [...assets];
}

function workerCount({
	concurrency,
	totalItems,
}: {
	concurrency: number;
	totalItems: number;
}): number {
	const normalizedConcurrency = Number.isFinite(concurrency)
		? Math.floor(concurrency)
		: 1;
	return Math.min(totalItems, Math.max(1, Math.min(8, normalizedConcurrency)));
}

function throwIfAborted({ signal }: { signal?: AbortSignal }): void {
	if (!signal?.aborted) return;
	const error = new Error("Asset pack operation aborted");
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
		if (!entry) throw new Error(`Asset pack task did not finish: ${index}`);
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

export async function installAssetPackResources({
	assets: candidateAssets,
	concurrency = 4,
	fetchImpl = fetch,
	onAssetProgress,
	onProgress,
	packId,
	retryCount = 2,
	signal,
	storage,
}: {
	assets: readonly AssetManifestEntry[];
	concurrency?: number;
	fetchImpl?: typeof fetch;
	onAssetProgress?: (progress: AssetPackAssetProgress) => void;
	onProgress?: (progress: AssetPackProgress) => void;
	packId: string;
	retryCount?: number;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<AssetPackInstallResult> {
	const assets = validatedPackAssets({ assets: candidateAssets, packId });
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

	return results.reduce<AssetPackInstallResult>(
		(total, result) => ({
			cachedBytes: total.cachedBytes + result.cachedBytes,
			resourceCount: total.resourceCount + result.resourceCount,
		}),
		{ cachedBytes: 0, resourceCount: 0 }
	);
}

export async function inspectAssetPackResources({
	assets: candidateAssets,
	concurrency = 8,
	packId,
	storage,
	verifyChecksum = false,
}: {
	assets: readonly AssetManifestEntry[];
	concurrency?: number;
	packId: string;
	storage?: AssetResourceCacheStorage;
	verifyChecksum?: boolean;
}): Promise<AssetPackInspection> {
	const assets = validatedPackAssets({ assets: candidateAssets, packId });
	const inspections = await runConcurrentTasks({
		concurrency,
		items: assets,
		task: ({ item: asset }) =>
			inspectAssetResources({
				asset,
				roles: ["source"],
				storage,
				verifyChecksum,
			}),
	});
	return inspections.reduce<AssetPackInspection>(
		(total, inspection) => ({
			cachedBytes: total.cachedBytes + inspection.cachedBytes,
			cachedResourceCount:
				total.cachedResourceCount + inspection.cachedResourceCount,
			complete: total.complete && inspection.complete,
			resourceCount: total.resourceCount + inspection.resourceCount,
		}),
		{
			cachedBytes: 0,
			cachedResourceCount: 0,
			complete: true,
			resourceCount: 0,
		}
	);
}

export async function removeAssetPackResources({
	assets: candidateAssets,
	concurrency = 4,
	onProgress,
	packId,
	signal,
	storage,
}: {
	assets: readonly AssetManifestEntry[];
	concurrency?: number;
	onProgress?: (progress: AssetPackProgress) => void;
	packId: string;
	signal?: AbortSignal;
	storage?: AssetResourceCacheStorage;
}): Promise<AssetPackRemovalResult> {
	const assets = validatedPackAssets({ assets: candidateAssets, packId });
	onProgress?.({ completedItems: 0, progress: 0, totalItems: assets.length });
	throwIfAborted({ signal });
	const remoteAssets = assets.filter((asset) => asset.delivery === "remote");
	const removedResourceCount = await removeAssetResourceVersions({
		assets: remoteAssets,
		concurrency,
		storage,
	});
	onProgress?.({
		completedItems: assets.length,
		progress: 1,
		totalItems: assets.length,
	});
	return { removedResourceCount };
}
