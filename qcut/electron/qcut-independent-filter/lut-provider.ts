import {
	listIndependentFilters,
	loadIndependentCube,
	parseIndependentIdentity,
} from "./lut-catalog.js";
import {
	independentLutSettings,
	type IndependentFilterIdentity,
	type IndependentFilterRequest,
} from "./contract.js";
import {
	createIndependentFilterSession,
	type IndependentFilterSession,
} from "./session.js";
import {
	loadIndependentGraph,
	supportsIndependentGraph,
} from "./graph-data.js";

// One serialized scheduler owns the LRU: eviction never kills an in-flight frame.
export function createIndependentLutProvider() {
	const sessions = new Map<
		string,
		{ session: IndependentFilterSession; title: string; graph: boolean }
	>();
	let tail: Promise<unknown> = Promise.resolve();
	let pending = 0;
	let disposed = false;
	let idle: NodeJS.Timeout | undefined;
	const release = async () => {
		const active = [...sessions.values()];
		sessions.clear();
		await Promise.allSettled(active.map(({ session }) => session.dispose()));
	};
	const useSession = <T>({
		identity,
		run,
	}: {
		identity: IndependentFilterIdentity;
		run: (active: {
			session: IndependentFilterSession;
			title: string;
			graph: boolean;
		}) => Promise<T>;
	}) => {
		if (disposed)
			return Promise.reject(new Error("Independent LUT provider is disposed."));
		if (pending >= 8)
			return Promise.reject(new Error("Independent LUT provider is busy."));
		const selected = parseIndependentIdentity({ request: identity });
		const key = `${selected.resourceId}/${selected.version}`;
		clearTimeout(idle);
		pending++;
		const operation = tail
			.then(async () => {
				if (disposed) throw new Error("Independent LUT provider is disposed.");
				let active = sessions.get(key);
				if (!active) {
					const catalog = await listIndependentFilters();
					const card = catalog.cards.find(
						(entry) =>
							entry.resourceId === selected.resourceId &&
							entry.version === selected.version
					);
					if (!card)
						throw new Error(
							"Independent LUT version is unavailable. Refresh the catalog."
						);
					if (sessions.size >= 4) {
						const oldest = sessions.entries().next().value!;
						sessions.delete(oldest[0]);
						await oldest[1].session.dispose();
					}
					const graph = supportsIndependentGraph({ card });
					const session = await createIndependentFilterSession(
						graph
							? {
									graph: await loadIndependentGraph({ card }),
									identity: selected,
								}
							: {
									cube: await loadIndependentCube({ card }),
									identity: selected,
								}
					);
					if (disposed) {
						await session.dispose();
						throw new Error("Independent LUT provider is disposed.");
					}
					active = { session, title: card.title, graph };
				}
				sessions.delete(key);
				sessions.set(key, active);
				try {
					return await run(active);
				} catch (error) {
					sessions.delete(key);
					await active.session.dispose();
					throw error;
				}
			})
			.finally(() => {
				pending--;
				if (!pending && !disposed) {
					idle = setTimeout(() => {
						void release();
					}, 30_000);
					idle.unref();
				}
			});
		tail = operation.catch(() => {});
		return operation;
	};
	return {
		load: (identity: IndependentFilterIdentity) => {
			const selected = parseIndependentIdentity({ request: identity });
			return useSession({
				identity: selected,
				run: async ({ title, graph }) =>
					independentLutSettings({ ...selected, title, graph }),
			});
		},
		render: (request: IndependentFilterRequest) => {
			const snapshot = { ...request, rgba: new Uint8Array(request.rgba) };
			return useSession({
				identity: snapshot,
				run: ({ session }) => session.render(snapshot),
			});
		},
		async dispose() {
			disposed = true;
			clearTimeout(idle);
			await tail;
			await release();
		},
	};
}
