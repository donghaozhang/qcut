import { randomUUID } from "node:crypto";
import type {
	ComposeIntent,
	ComposeJob,
	ComposeJobError,
	ComposePatch,
	ComposeProvider,
	ComposeSnapshot,
} from "../compose-protocol.js";
import { COMPOSE_PROTOCOL_VERSION } from "../compose-protocol.js";

/**
 * Lifecycle contract for compose planning backends. Synchronous providers
 * complete on the first poll; asynchronous ones advance through
 * queued/uploading/running until a poll returns a terminal status. Jobs must
 * never carry API keys or other recoverable secrets — they are persisted
 * verbatim as evidence.
 */
export interface ComposeProviderAdapter {
	readonly provider: ComposeProvider;
	createJob(input: {
		snapshot: ComposeSnapshot;
		intent: ComposeIntent;
	}): Promise<ComposeJob>;
	uploadAssets(input: {
		job: ComposeJob;
		snapshot: ComposeSnapshot;
	}): Promise<ComposeJob>;
	pollJob(input: {
		job: ComposeJob;
		snapshot: ComposeSnapshot;
		intent: ComposeIntent;
		signal?: AbortSignal;
	}): Promise<ComposeJob>;
	downloadPatch(input: { job: ComposeJob }): Promise<ComposePatch>;
	cancelJob(input: { job: ComposeJob }): Promise<ComposeJob>;
}

export function createComposeJobRecord({
	provider,
	snapshot,
	intent,
	jobId = randomUUID(),
	createdAt = new Date().toISOString(),
}: {
	provider: ComposeProvider;
	snapshot: ComposeSnapshot;
	intent: ComposeIntent;
	jobId?: string;
	createdAt?: string;
}): ComposeJob {
	return {
		schemaVersion: COMPOSE_PROTOCOL_VERSION,
		id: jobId,
		provider,
		intentKind: intent.kind,
		snapshotId: snapshot.id,
		snapshotFingerprint: snapshot.sourceFingerprint,
		status: "queued",
		progress: 0,
		createdAt,
		updatedAt: createdAt,
		attempt: 1,
	};
}

export function transitionComposeJob({
	job,
	status,
	updatedAt = new Date().toISOString(),
	progress,
	resultPatchId,
	error,
}: {
	job: ComposeJob;
	status: ComposeJob["status"];
	updatedAt?: string;
	progress?: number;
	resultPatchId?: string;
	error?: ComposeJobError;
}): ComposeJob {
	const nextProgress =
		status === "completed"
			? 1
			: Math.min(0.999, Math.max(0, progress ?? job.progress));
	return {
		...job,
		status,
		progress: nextProgress,
		updatedAt,
		...(resultPatchId ? { resultPatchId } : {}),
		...(error ? { error } : {}),
	};
}

/**
 * Base for providers whose backend does not exist yet: every job fails
 * immediately with a structured `unsupported` error instead of pretending.
 */
export function unsupportedComposeProvider({
	provider,
	detail,
}: {
	provider: ComposeProvider;
	detail: string;
}): ComposeProviderAdapter {
	const fail = (job: ComposeJob): ComposeJob =>
		transitionComposeJob({
			job,
			status: "failed",
			error: {
				code: "provider-unavailable",
				message: detail,
				category: "unsupported",
				retryable: false,
			},
		});
	return {
		provider,
		createJob: async ({ snapshot, intent }) =>
			fail(createComposeJobRecord({ provider, snapshot, intent })),
		uploadAssets: async ({ job }) => fail(job),
		pollJob: async ({ job }) => fail(job),
		downloadPatch: async () => {
			throw new Error(detail);
		},
		cancelJob: async ({ job }) =>
			transitionComposeJob({ job, status: "canceled" }),
	};
}
