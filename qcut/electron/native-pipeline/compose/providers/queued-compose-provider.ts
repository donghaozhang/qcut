import {
	createComposeJobRecord,
	transitionComposeJob,
	type ComposeProviderAdapter,
} from "./compose-provider.js";
import {
	createComposeJobStore,
	type StoredComposeJob,
} from "./compose-job-store.js";
import { sanitizeComposeModelOperations } from "./compose-model-response.js";
import { snapshotSummary } from "./openrouter-compose-provider.js";
import {
	validateComposePatch,
	hasComposeValidationErrors,
	type ComposeJob,
	type ComposePatch,
	type ComposeSnapshot,
} from "../compose-protocol.js";

export interface ComposeQueueTransport {
	preflight?: () => void;
	submit: (input: { record: StoredComposeJob }) => Promise<string>;
	status: (input: {
		job: ComposeJob;
		signal?: AbortSignal;
	}) => Promise<"queued" | "running" | "completed" | "failed" | "canceled">;
	result: (input: { job: ComposeJob }) => Promise<unknown>;
	cancel: (input: {
		job: ComposeJob;
	}) => Promise<"canceled" | "completed" | void>;
}

export function portableComposeSnapshot({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposeSnapshot {
	const summary = JSON.parse(snapshotSummary({ snapshot })) as ComposeSnapshot;
	return {
		...summary,
		schemaVersion: snapshot.schemaVersion,
		id: snapshot.id,
		createdAt: snapshot.createdAt,
		sourceFingerprint: snapshot.sourceFingerprint,
	};
}

export function createQueuedComposeProvider({
	provider,
	transport,
	store = createComposeJobStore(),
}: {
	provider: "qcut" | "fal";
	transport: ComposeQueueTransport;
	store?: ReturnType<typeof createComposeJobStore>;
}): ComposeProviderAdapter {
	const read = async ({ job }: { job: ComposeJob }) => {
		const record = await store.read({ id: job.id });
		if (
			record.job.provider !== provider ||
			job.snapshotId !== record.job.snapshotId ||
			job.snapshotFingerprint !== record.job.snapshotFingerprint
		)
			throw new Error("Compose job provider or snapshot mismatch.");
		return record;
	};
	const save = async ({
		record,
		job,
		patch,
	}: {
		record: StoredComposeJob;
		job: ComposeJob;
		patch?: ComposePatch;
	}) => {
		await store.write({
			record: { ...record, job, ...(patch ? { patch } : {}) },
		});
		return job;
	};
	return {
		provider,
		createJob: async ({ snapshot, intent }) => {
			const job = createComposeJobRecord({ provider, snapshot, intent });
			await store.write({
				record: {
					job,
					snapshot: portableComposeSnapshot({ snapshot }),
					intent,
				},
			});
			return job;
		},
		uploadAssets: async ({ job }) =>
			store.withLock({
				id: job.id,
				action: async () => {
					const record = await read({ job });
					if (
						record.job.remoteTaskId ||
						["completed", "failed", "canceled"].includes(record.job.status)
					)
						return record.job;
					if (provider === "fal" && record.job.status === "uploading")
						throw new Error(
							"FAL submission outcome is unknown. Recover the request ID from FAL before retrying; automatic resubmission could duplicate billing."
						);
					transport.preflight?.();
					await save({ record, job: { ...record.job, status: "uploading" } });
					const remoteTaskId = await transport.submit({ record });
					if (!/^[a-zA-Z0-9_-]+$/.test(remoteTaskId))
						throw new Error("Invalid remote Compose task ID.");
					return save({
						record,
						job: {
							...record.job,
							remoteTaskId,
							status: "queued",
							updatedAt: new Date().toISOString(),
						},
					});
				},
			}),
		pollJob: async ({ job, signal }) =>
			store.withLock({
				id: job.id,
				action: async () => {
					const record = await read({ job });
					if (["completed", "failed", "canceled"].includes(record.job.status))
						return record.job;
					if (!record.job.remoteTaskId)
						throw new Error("Compose job has not been submitted.");
					const status = await transport.status({ job: record.job, signal });
					return save({
						record,
						job: transitionComposeJob({
							job: record.job,
							status,
							progress: status === "queued" ? 0.1 : 0.5,
							...(status === "completed"
								? { resultPatchId: `${job.id}-patch` }
								: {}),
							...(status === "failed"
								? {
										error: {
											code: "remote-job-failed",
											message: "Remote Compose job failed.",
											category: "unknown",
											retryable: false,
										},
									}
								: {}),
						}),
					});
				},
			}),
		downloadPatch: async ({ job }) =>
			store.withLock({
				id: job.id,
				action: async () => {
					const record = await read({ job });
					if (record.job.status !== "completed")
						throw new Error("Compose job is not completed.");
					if (record.patch) return record.patch;
					const value = await transport.result({ job: record.job });
					if (
						!value ||
						typeof value !== "object" ||
						!("operations" in value) ||
						!Array.isArray(value.operations)
					)
						throw new Error("Remote Compose result has no operations array.");
					const patch: ComposePatch = {
						schemaVersion: 1,
						id: `${job.id}-patch`,
						source: "cloud",
						intentKind: record.intent.kind,
						mode: "idempotent",
						snapshotId: record.snapshot.id,
						sourceFingerprint: record.snapshot.sourceFingerprint,
						createdAt: record.job.createdAt,
						provider,
						operations: sanitizeComposeModelOperations({
							value,
							snapshot: record.snapshot,
						}),
						warnings: [],
					};
					if (
						hasComposeValidationErrors({
							issues: validateComposePatch({
								snapshot: record.snapshot,
								patch,
							}),
						})
					)
						throw new Error("Remote Compose patch failed validation.");
					if (patch.operations.length !== value.operations.length)
						throw new Error(
							"Remote Compose result contains rejected operations."
						);
					await save({ record, job: record.job, patch });
					return patch;
				},
			}),
		cancelJob: async ({ job }) =>
			store.withLock({
				id: job.id,
				action: async () => {
					const record = await read({ job });
					if (["completed", "failed", "canceled"].includes(record.job.status))
						return record.job;
					const status = record.job.remoteTaskId
						? await transport.cancel({ job: record.job })
						: undefined;
					return save({
						record,
						job: transitionComposeJob({
							job: record.job,
							status: status ?? "canceled",
							...(status === "completed"
								? { resultPatchId: `${job.id}-patch` }
								: {}),
						}),
					});
				},
			}),
	};
}
