export async function mapWithConcurrency<Item, Result>({
	concurrency,
	items,
	mapper,
}: {
	concurrency: number;
	items: readonly Item[];
	mapper: (options: { index: number; item: Item }) => Promise<Result>;
}): Promise<Result[]> {
	if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
		throw new Error("Concurrency must be a positive integer.");
	}
	const results = new Array<Result>(items.length);
	let nextIndex = 0;
	const runWorker = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= items.length) return;
		const item = items[index] as Item;
		results[index] = await mapper({ index, item });
		await runWorker();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () =>
			runWorker()
		)
	);
	return results;
}
