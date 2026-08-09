export function mapWithConcurrency<Item, Result>({
	items,
	limit,
	task,
}: {
	items: readonly Item[];
	limit: number;
	task: (input: { item: Item; index: number }) => Promise<Result>;
}): Promise<Result[]> {
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		return Promise.reject(
			new Error("Concurrency limit must be a positive integer.")
		);
	}
	if (items.length === 0) return Promise.resolve([]);

	return new Promise<Result[]>((resolve, reject) => {
		const results = new Array<Result>(items.length);
		const workerLimit = Math.min(limit, items.length);
		let activeCount = 0;
		let completedCount = 0;
		let nextIndex = 0;
		let settled = false;

		const schedule = (): void => {
			if (settled) return;
			while (activeCount < workerLimit && nextIndex < items.length) {
				const index = nextIndex;
				const item = items[index];
				nextIndex += 1;
				activeCount += 1;
				void Promise.resolve()
					.then(() => task({ item, index }))
					.then(
						(result) => {
							if (settled) return;
							results[index] = result;
							activeCount -= 1;
							completedCount += 1;
							if (completedCount === items.length) {
								settled = true;
								resolve(results);
								return;
							}
							schedule();
						},
						(cause) => {
							if (settled) return;
							settled = true;
							reject(cause);
						}
					);
			}
		};

		schedule();
	});
}
