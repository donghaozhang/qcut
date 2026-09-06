import { composeJobStore, type ComposeCloudInput } from "./job-store";

export async function runComposeWorkerOnce({
	plan,
	store = composeJobStore,
	signal,
}: {
	plan: (
		input: ComposeCloudInput & { signal?: AbortSignal }
	) => Promise<unknown>;
	store?: typeof composeJobStore;
	signal?: AbortSignal;
}): Promise<{
	id: string;
	status: "completed" | "failed" | "superseded";
} | null> {
	signal?.throwIfAborted();
	const row = await store.claim();
	if (!row) return null;
	if (!row.lease_token) throw new Error("Claimed Compose job has no lease.");
	try {
		const timeout = AbortSignal.timeout(120_000);
		const result = await plan({
			...row.input,
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		});
		signal?.throwIfAborted();
		const saved = await store.finish({
			id: row.id,
			leaseToken: row.lease_token,
			result,
		});
		return { id: row.id, status: saved ? "completed" : "superseded" };
	} catch {
		// Shutdown leaves the durable lease for another worker to recover.
		signal?.throwIfAborted();
		const saved = await store.finish({
			id: row.id,
			leaseToken: row.lease_token,
			errorCode: "planning-failed",
		});
		return { id: row.id, status: saved ? "failed" : "superseded" };
	}
}
