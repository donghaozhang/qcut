import {
	fetchUserLibraryDocument,
	putUserLibraryDocument,
	UserLibraryConflictError,
	type CloudUserLibraryDocument,
} from "./user-library-client";
import {
	mergeUserLibraryEnvelopes,
	parseUserLibraryEnvelope,
	reconcileLocalUserLibrary,
	userLibraryEnvelopesEqual,
	type UserLibraryEnvelope,
} from "./user-library-contract";
import {
	USER_LIBRARY_ADAPTERS,
	type UserLibraryAdapter,
} from "./user-library-adapters";
import { withUserLibraryNotificationsSuppressed } from "./user-library-events";

const LOCAL_SYNC_STATE_PREFIX = "qcut-user-library-sync-v1";
const MAX_CONFLICT_ATTEMPTS = 3;

interface StoredLibrarySyncState {
	envelope: UserLibraryEnvelope;
	serverVersion: number;
}

function syncStateKey({ adapter }: { adapter: UserLibraryAdapter }): string {
	return `${LOCAL_SYNC_STATE_PREFIX}:${adapter.namespace}:${adapter.documentKey}`;
}

function loadStoredSyncState({
	adapter,
}: {
	adapter: UserLibraryAdapter;
}): StoredLibrarySyncState | null {
	if (typeof localStorage === "undefined") return null;
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(syncStateKey({ adapter })) ?? "null"
		);
		if (!parsed || typeof parsed !== "object") return null;
		const candidate = parsed as Record<string, unknown>;
		const envelope = parseUserLibraryEnvelope({ value: candidate.envelope });
		if (
			!envelope ||
			typeof candidate.serverVersion !== "number" ||
			!Number.isInteger(candidate.serverVersion) ||
			candidate.serverVersion < 0
		) {
			return null;
		}
		return { envelope, serverVersion: candidate.serverVersion };
	} catch {
		return null;
	}
}

function storeSyncState({
	adapter,
	state,
}: {
	adapter: UserLibraryAdapter;
	state: StoredLibrarySyncState;
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(syncStateKey({ adapter }), JSON.stringify(state));
}

function cloudEnvelope({
	document,
}: {
	document: CloudUserLibraryDocument | null;
}): UserLibraryEnvelope | null {
	if (!document) return null;
	const envelope = parseUserLibraryEnvelope({ value: document.payload });
	if (!envelope) throw new Error("Cloud library document has invalid data");
	return envelope;
}

function persistMergedItems({
	adapter,
	envelope,
}: {
	adapter: UserLibraryAdapter;
	envelope: UserLibraryEnvelope;
}): void {
	withUserLibraryNotificationsSuppressed({
		action: () => adapter.persist({ items: envelope.items }),
	});
}

async function writeWithConflictRetry({
	adapter,
	envelope,
	baseVersion,
	sessionToken,
	signal,
	attempt,
}: {
	adapter: UserLibraryAdapter;
	envelope: UserLibraryEnvelope;
	baseVersion: number;
	sessionToken: string;
	signal?: AbortSignal;
	attempt: number;
}): Promise<{
	document: CloudUserLibraryDocument;
	envelope: UserLibraryEnvelope;
}> {
	try {
		const document = await putUserLibraryDocument({
			namespace: adapter.namespace,
			documentKey: adapter.documentKey,
			payload: envelope,
			baseVersion,
			sessionToken,
			signal,
		});
		return { document, envelope };
	} catch (error) {
		if (
			!(error instanceof UserLibraryConflictError) ||
			attempt >= MAX_CONFLICT_ATTEMPTS
		) {
			throw error;
		}
		const latestCloud = cloudEnvelope({ document: error.current });
		if (!latestCloud || !error.current) {
			return writeWithConflictRetry({
				adapter,
				envelope,
				baseVersion: 0,
				sessionToken,
				signal,
				attempt: attempt + 1,
			});
		}
		const merged = mergeUserLibraryEnvelopes({
			local: envelope,
			remote: latestCloud,
		});
		persistMergedItems({ adapter, envelope: merged });
		return writeWithConflictRetry({
			adapter,
			envelope: merged,
			baseVersion: error.current.version,
			sessionToken,
			signal,
			attempt: attempt + 1,
		});
	}
}

export async function syncUserLibraryAdapter({
	adapter,
	sessionToken,
	signal,
	now = Date.now(),
}: {
	adapter: UserLibraryAdapter;
	sessionToken: string;
	signal?: AbortSignal;
	now?: number;
}): Promise<void> {
	const remoteDocument = await fetchUserLibraryDocument({
		namespace: adapter.namespace,
		documentKey: adapter.documentKey,
		sessionToken,
		signal,
	});
	const remote = cloudEnvelope({ document: remoteDocument });
	const stored = loadStoredSyncState({ adapter });
	const local = reconcileLocalUserLibrary({
		items: adapter.load(),
		previous: stored?.envelope ?? null,
		remote,
		now,
	});
	const merged = remote ? mergeUserLibraryEnvelopes({ local, remote }) : local;
	persistMergedItems({ adapter, envelope: merged });

	if (
		remoteDocument &&
		remote &&
		userLibraryEnvelopesEqual({ left: merged, right: remote })
	) {
		storeSyncState({
			adapter,
			state: { envelope: merged, serverVersion: remoteDocument.version },
		});
		return;
	}
	if (
		!remoteDocument &&
		merged.items.length === 0 &&
		Object.keys(merged.tombstones).length === 0
	) {
		storeSyncState({ adapter, state: { envelope: merged, serverVersion: 0 } });
		return;
	}
	const result = await writeWithConflictRetry({
		adapter,
		envelope: merged,
		baseVersion: remoteDocument?.version ?? 0,
		sessionToken,
		signal,
		attempt: 1,
	});
	storeSyncState({
		adapter,
		state: {
			envelope: result.envelope,
			serverVersion: result.document.version,
		},
	});
}

export async function syncAllUserLibraries({
	sessionToken,
	signal,
}: {
	sessionToken: string;
	signal?: AbortSignal;
}): Promise<void> {
	await Promise.all(
		USER_LIBRARY_ADAPTERS.map((adapter) =>
			syncUserLibraryAdapter({ adapter, sessionToken, signal })
		)
	);
}
