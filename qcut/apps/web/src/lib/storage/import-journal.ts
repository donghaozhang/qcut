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
import { LocalStorageAdapter } from "./localstorage-adapter";
import type { StorageAdapter } from "./types";

export type {
	ImportJournalPhase,
	ImportJournalRecordV1,
} from "./import-journal-validation";

export interface ImportJournalAuditResult {
	records: ImportJournalRecordV1[];
	corruptRecordCount: number;
}

const JOURNAL_DB_NAME = "qcut-import-journal";
const JOURNAL_STORE_NAME = "records";

async function createDefaultJournalAdapter(): Promise<
	StorageAdapter<ImportJournalRecordV1>
> {
	if (
		typeof window !== "undefined" &&
		(window as unknown as { electronAPI?: { storage?: unknown } }).electronAPI
			?.storage
	) {
		try {
			const adapter = new ElectronStorageAdapter<ImportJournalRecordV1>(
				JOURNAL_DB_NAME,
				JOURNAL_STORE_NAME
			);
			await adapter.list();
			return adapter;
		} catch {
			// Fall through to IndexedDB.
		}
	}
	try {
		const adapter = new IndexedDBAdapter<ImportJournalRecordV1>(
			JOURNAL_DB_NAME,
			JOURNAL_STORE_NAME,
			1
		);
		await adapter.list();
		return adapter;
	} catch {
		return new LocalStorageAdapter<ImportJournalRecordV1>(
			JOURNAL_DB_NAME,
			JOURNAL_STORE_NAME
		);
	}
}

export class ImportJournal {
	#adapter: StorageAdapter<ImportJournalRecordV1> | null;
	readonly #now: () => Date;

	constructor({
		adapter,
		now = () => new Date(),
	}: {
		adapter?: StorageAdapter<ImportJournalRecordV1>;
		now?: () => Date;
	} = {}) {
		this.#adapter = adapter ?? null;
		this.#now = now;
	}

	async #getAdapter(): Promise<StorageAdapter<ImportJournalRecordV1>> {
		if (this.#adapter === null) {
			this.#adapter = await createDefaultJournalAdapter();
		}
		return this.#adapter;
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
		const keys = [...new Set(await adapter.list())];
		const outcomes = await Promise.all(
			keys.map(async (storageKey) => {
				try {
					assertImportJournalStorageKey({ storageKey });
					const value = await adapter.get(storageKey);
					if (value === null) {
						throw new Error("Import journal record is unreadable.");
					}
					return {
						corrupt: false as const,
						record: parseImportJournalRecordV1({ storageKey, value }),
					};
				} catch (error) {
					debugError(
						"[ImportJournal] Leaving unreadable or corrupt record untouched",
						error
					);
					return { corrupt: true as const };
				}
			})
		);
		return {
			records: outcomes.flatMap((outcome) =>
				outcome.corrupt ? [] : [outcome.record]
			),
			corruptRecordCount: outcomes.filter((outcome) => outcome.corrupt).length,
		};
	}

	/** Every valid outstanding record; use audit() when corruption must surface. */
	async list(): Promise<ImportJournalRecordV1[]> {
		return (await this.audit()).records;
	}
}

export const importJournal = new ImportJournal();
