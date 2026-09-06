import { resolveIndependentFogLut } from "./assets.js";
import {
	createIndependentFilterSession,
	type IndependentFilterSession,
} from "./session.js";
import {
	independentFogSettings,
	type IndependentFilterRequest,
} from "./contract.js";

export function createIndependentFilterProvider() {
	let session: Promise<IndependentFilterSession> | undefined;
	let idle: NodeJS.Timeout | undefined;
	let pending = 0;
	let disposed = false;
	const release = async () => {
		const previous = session;
		session = undefined;
		if (previous) await (await previous).dispose();
	};
	const useSession = async <T>({
		run,
	}: {
		run: (session: IndependentFilterSession) => Promise<T>;
	}) => {
		if (disposed) throw new Error("Independent filter provider is disposed.");
		if (pending >= 8) throw new Error("Independent filter provider is busy.");
		clearTimeout(idle);
		pending += 1;
		session ??= resolveIndependentFogLut().then((lutPath) =>
			createIndependentFilterSession({ lutPath })
		);
		const active = session;
		try {
			return await run(await active);
		} catch (error) {
			// A failed protocol stream cannot be reused for subsequent frames.
			if (session === active) await release().catch(() => {});
			throw error;
		} finally {
			pending -= 1;
			if (!pending && !disposed) {
				idle = setTimeout(() => {
					void release().catch(() => {});
				}, 30_000);
				idle.unref();
			}
		}
	};
	return {
		load: () => useSession({ run: async () => independentFogSettings() }),
		render: (request: IndependentFilterRequest) =>
			useSession({ run: (active) => active.render(request) }),
		async dispose() {
			disposed = true;
			clearTimeout(idle);
			await release().catch(() => {});
		},
	};
}
