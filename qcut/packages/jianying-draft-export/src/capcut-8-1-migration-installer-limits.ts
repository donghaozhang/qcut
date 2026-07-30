export const CAPCUT_8_1_INSTALL_LIMITS = Object.freeze({
	assetCount: 4_096,
	completeMarkerBytes: 64 * 1024,
	concurrentFileOperations: 8,
	contentBytes: 256 * 1024 * 1024,
	directoryDepth: 32,
	directoryEntries: 8_192,
	manifestBytes: 2 * 1024 * 1024,
	metadataBytes: 4 * 1024 * 1024,
	relativePathBytes: 4_096,
	scaffoldFileCount: 64,
	singleAssetBytes: 128 * 1024 * 1024 * 1024,
	targetDraftCount: 10_000,
	treeDirectoryCount: 4_096,
	treeFileCount: 8_192,
	treeTotalBytes: 512 * 1024 * 1024 * 1024,
	timelineMaterialsBytes: 256 * 1024 * 1024 * 1024,
});

export async function mapWithConcurrency<Item, Result>({
	concurrency,
	items,
	mapper,
}: {
	concurrency: number;
	items: readonly Item[];
	mapper: (item: Item, index: number) => Promise<Result>;
}): Promise<Result[]> {
	if (
		!Number.isSafeInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > 64
	) {
		throw new Error("Bounded mapper concurrency is invalid.");
	}
	const results: Result[] = new Array(items.length);
	let nextIndex = 0;
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		results[index] = await mapper(items[index] as Item, index);
		await runNext();
	};
	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => runNext()));
	return results;
}
