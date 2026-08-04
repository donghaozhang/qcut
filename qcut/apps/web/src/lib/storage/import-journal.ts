/**
 * Import journal (JYI-010).
 *
 * A tiny persisted ledger of in-flight draft imports. Every import writes a
 * journal record BEFORE touching project storage and removes it only after
 * publish is verified — so a crash or reload always leaves behind exactly
 * the evidence recovery needs to finish or roll back.
 *
 * @module lib/storage/import-journal
 */

import { debugError } from "@/lib/debug/debug-config";
import { ElectronStorageAdapter } from "./electron-adapter";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import {
	assertImportJournalStorageKey,
	parseImportJournalRecordV1,
	type ImportJournalRecordV1,
} from "./import-journal-validation";
import {
	fingerprintCorruptImportJournalRecord,
	hasImportJournalQuarantineMarker,
	persistImportJournalQuarantineMarker,
	type ImportJournalQuarantineMarkerV1,
} from "./import-journal-quarantine";
import { LocalStorageAdapter } from "./localstorage-adapter";
import type { StorageAdapter } from "./types";

export type {
	ImportJournalPhase,
	ImportJournalRecordV1,
} from "./import-journal-validation";

export interface ImportJournalAuditResult {
	records: ImportJournalRecordV1[];
	corruptRecordCount: number;
	quarantinedRecordCount: number;
}

export interface ImportJournalQuarantineResult {
	newlyQuarantinedRecordCount: number;
	corruptRecordCount: number;
	quarantinedRecordCount: number;
}

const JOURNAL_DB_NAME = "qcut-import-journal";
const JOURNAL_QUARANTINE_DB_NAME = "qcut-import-journal-quarantine";
const JOURNAL_STORE_NAME = "records";

async function createDefaultJournalAdapter<T>({
	databaseName,
}: {
	databaseName: string;
}): Promise<StorageAdapter<T>> {
	if (
		typeof window !== "undefined" &&
		(window as unknown as { electronAPI?: { storage?: unknown } }).electronAPI
			?.storage
	) {
		try {
			const adapter = new ElectronStorageAdapter<T>(
				databaseName,
				JOURNAL_STORE_NAME
			);
			await adapter.list();
			return adapter;
		} catch {
			// Fall through to IndexedDB.
		}
	}
	try {
		const adapter = new IndexedDBAdapter<T>(
			databaseName,
			JOURNAL_STORE_NAME,
			1
		);
		await adapter.list();
		return adapter;
	} catch {
		return new LocalStorageAdapter<T>(databaseName, JOURNAL_STORE_NAME);
	}
}

type ImportJournalCandidate =
	| { kind: "valid"; record: ImportJournalRecordV1 }
	| { kind: "corrupt"; fingerprint: string | null };

async function inspectImportJournalCandidate({
	adapter,
	storageKey,
}: {
	adapter: StorageAdapter<ImportJournalRecordV1>;
	storageKey: string;
}): Promise<ImportJournalCandidate> {
	let value: unknown = null;
	try {
		value = await adapter.get(storageKey);
		assertImportJournalStorageKey({ storageKey });
		if (value === null) {
			throw new Error("Import journal record is unreadable.");
		}
		return {
			kind: "valid",
			record: parseImportJournalRecordV1({ storageKey, value }),
		};
	} catch (error) {
		debugError(
			"[ImportJournal] Leaving unreadable or corrupt record untouched",
			error
		);
		return {
			kind: "corrupt",
			fingerprint: await fingerprintCorruptImportJournalRecord({
				storageKey,
				value,
			}),
		};
	}
}

export class ImportJournal {
	#adapter: StorageAdapter<ImportJournalRecordV1> | null;
	#quarantineAdapter: StorageAdapter<ImportJournalQuarantineMarkerV1> | null;
	readonly #now: () => Date;

	constructor({
		adapter,
		quarantineAdapter,
		now = () => new Date(),
	}: {
		adapter?: StorageAdapter<ImportJournalRecordV1>;
		quarantineAdapter?: StorageAdapter<ImportJournalQuarantineMarkerV1>;
		now?: () => Date;
	} = {}) {
		this.#adapter = adapter ?? null;
		this.#quarantineAdapter = quarantineAdapter ?? null;
		this.#now = now;
	}

	async #getAdapter(): Promise<StorageAdapter<ImportJournalRecordV1>> {
		if (this.#adapter === null) {
			this.#adapter = await createDefaultJournalAdapter<ImportJournalRecordV1>({
				databaseName: JOURNAL_DB_NAME,
			});
		}
		return this.#adapter;
	}

	async #getQuarantineAdapter(): Promise<
		StorageAdapter<ImportJournalQuarantineMarkerV1>
	> {
		if (this.#quarantineAdapter === null) {
			this.#quarantineAdapter =
				await createDefaultJournalAdapter<ImportJournalQuarantineMarkerV1>({
					databaseName: JOURNAL_QUARANTINE_DB_NAME,
				});
		}
		return this.#quarantineAdapter;
	}

	async #writeRecord({
		storageKey,
		value,
	}: {
		storageKey: string;
		value: ImportJournalRecordV1;
	}): Promise<void> {
		const record = parseImportJournalRecordV1({ storageKey, value });
		const adapter = await this.#getAdapter();
		await adapter.set(storageKey, record);
	}

	#nextUpdatedAtIso({ startedAtIso }: { startedAtIso: string }): string {
		const nowMilliseconds = this.#now().getTime();
		const startedAtMilliseconds = Date.parse(startedAtIso);
		return new Date(
			Math.max(nowMilliseconds, startedAtMilliseconds)
		).toISOString();
	}

	/** Records the intent to import BEFORE any project data is written. */
	async begin({
		importId,
		bundleDigest,
		projectId,
		sceneId,
	}: {
		importId: string;
		bundleDigest: string;
		projectId: string;
		sceneId: string;
	}): Promise<void> {
		const nowIso = this.#now().toISOString();
		await this.#writeRecord({
			storageKey: importId,
			value: {
				schemaVersion: 1,
				importId,
				bundleDigest,
				phase: "staging",
				projectId,
				sceneId,
				mediaItemIds: [],
				startedAtIso: nowIso,
				updatedAtIso: nowIso,
			},
		});
	}

	async recordMediaItem({
		importId,
		mediaItemId,
	}: {
		importId: string;
		mediaItemId: string;
	}): Promise<void> {
		const record = await this.get({ importId });
		if (record === null) {
			throw new Error("Import journal record is missing.");
		}
		await this.#writeRecord({
			storageKey: importId,
			value: {
				...record,
				mediaItemIds: [...record.mediaItemIds, mediaItemId],
				updatedAtIso: this.#nextUpdatedAtIso({
					startedAtIso: record.startedAtIso,
				}),
			},
		});
	}

	async markPublished({ importId }: { importId: string }): Promise<void> {
		const record = await this.get({ importId });
		if (record === null) {
			throw new Error("Import journal record is missing.");
		}
		await this.#writeRecord({
			storageKey: importId,
			value: {
				...record,
				phase: "published",
				updatedAtIso: this.#nextUpdatedAtIso({
					startedAtIso: record.startedAtIso,
				}),
			},
		});
	}

	async complete({ importId }: { importId: string }): Promise<void> {
		assertImportJournalStorageKey({ storageKey: importId });
		const adapter = await this.#getAdapter();
		await adapter.remove(importId);
	}

	async get({
		importId,
	}: {
		importId: string;
	}): Promise<ImportJournalRecordV1 | null> {
		assertImportJournalStorageKey({ storageKey: importId });
		const adapter = await this.#getAdapter();
		const value = await adapter.get(importId);
		return value === null
			? null
			: parseImportJournalRecordV1({ storageKey: importId, value });
	}

	/** Audits every key without allowing corrupt records to authorize cleanup. */
	async audit(): Promise<ImportJournalAuditResult> {
		const adapter = await this.#getAdapter();
		const quarantineAdapter = await this.#getQuarantineAdapter();
		const keys = [...new Set(await adapter.list())];
		const outcomes = await Promise.all(
			keys.map(async (storageKey) => {
				const candidate = await inspectImportJournalCandidate({
					adapter,
					storageKey,
				});
				if (candidate.kind === "valid") return candidate;
				const quarantined =
					candidate.fingerprint !== null &&
					(await hasImportJournalQuarantineMarker({
						adapter: quarantineAdapter,
						fingerprint: candidate.fingerprint,
					}));
				return { kind: quarantined ? "quarantined" : "corrupt" } as const;
			})
		);
		return {
			records: outcomes.flatMap((outcome) =>
				outcome.kind === "valid" ? [outcome.record] : []
			),
			corruptRecordCount: outcomes.filter(
				(outcome) => outcome.kind === "corrupt"
			).length,
			quarantinedRecordCount: outcomes.filter(
				(outcome) => outcome.kind === "quarantined"
			).length,
		};
	}

	/** Isolates corrupt records without removing them or trusting their contents. */
	async quarantineCorruptRecords(): Promise<ImportJournalQuarantineResult> {
		const adapter = await this.#getAdapter();
		const quarantineAdapter = await this.#getQuarantineAdapter();
		const keys = [...new Set(await adapter.list())];
		const quarantinedAtIso = this.#now().toISOString();
		const outcomes = await Promise.all(
			keys.map(async (storageKey) => {
				const candidate = await inspectImportJournalCandidate({
					adapter,
					storageKey,
				});
				if (candidate.kind === "valid" || candidate.fingerprint === null) {
					return false;
				}
				if (
					await hasImportJournalQuarantineMarker({
						adapter: quarantineAdapter,
						fingerprint: candidate.fingerprint,
					})
				) {
					return false;
				}
				try {
					await persistImportJournalQuarantineMarker({
						adapter: quarantineAdapter,
						fingerprint: candidate.fingerprint,
						quarantinedAtIso,
					});
					return true;
				} catch (error) {
					debugError(
						"[ImportJournal] Failed to persist quarantine marker",
						error
					);
					return false;
				}
			})
		);
		const audit = await this.audit();
		return {
			newlyQuarantinedRecordCount: outcomes.filter(Boolean).length,
			corruptRecordCount: audit.corruptRecordCount,
			quarantinedRecordCount: audit.quarantinedRecordCount,
		};
	}

	/** Every valid outstanding record; use audit() when corruption must surface. */
	async list(): Promise<ImportJournalRecordV1[]> {
		return (await this.audit()).records;
	}
}

export const importJournal = new ImportJournal();
