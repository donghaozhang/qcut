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
import { LocalStorageAdapter } from "./localstorage-adapter";
import type { StorageAdapter } from "./types";

export type ImportJournalPhase = "staging" | "published";

export interface ImportJournalRecordV1 {
	schemaVersion: 1;
	/** Plan token of the bundle that started this import. */
	importId: string;
	bundleDigest: string;
	phase: ImportJournalPhase;
	projectId: string;
	sceneId: string;
	mediaItemIds: string[];
	startedAtIso: string;
	updatedAtIso: string;
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
		const adapter = await this.#getAdapter();
		const nowIso = this.#now().toISOString();
		await adapter.set(importId, {
			schemaVersion: 1,
			importId,
			bundleDigest,
			phase: "staging",
			projectId,
			sceneId,
			mediaItemIds: [],
			startedAtIso: nowIso,
			updatedAtIso: nowIso,
		});
	}

	async recordMediaItem({
		importId,
		mediaItemId,
	}: {
		importId: string;
		mediaItemId: string;
	}): Promise<void> {
		const adapter = await this.#getAdapter();
		const record = await adapter.get(importId);
		if (record === null) {
			throw new Error("Import journal record is missing.");
		}
		await adapter.set(importId, {
			...record,
			mediaItemIds: [...record.mediaItemIds, mediaItemId],
			updatedAtIso: this.#now().toISOString(),
		});
	}

	async markPublished({ importId }: { importId: string }): Promise<void> {
		const adapter = await this.#getAdapter();
		const record = await adapter.get(importId);
		if (record === null) {
			throw new Error("Import journal record is missing.");
		}
		await adapter.set(importId, {
			...record,
			phase: "published",
			updatedAtIso: this.#now().toISOString(),
		});
	}

	async complete({ importId }: { importId: string }): Promise<void> {
		const adapter = await this.#getAdapter();
		await adapter.remove(importId);
	}

	async get({
		importId,
	}: {
		importId: string;
	}): Promise<ImportJournalRecordV1 | null> {
		const adapter = await this.#getAdapter();
		return adapter.get(importId);
	}

	/** Every outstanding record, tolerating individually corrupt entries. */
	async list(): Promise<ImportJournalRecordV1[]> {
		const adapter = await this.#getAdapter();
		const keys = await adapter.list();
		const records: ImportJournalRecordV1[] = [];
		for (const key of keys) {
			try {
				const record = await adapter.get(key);
				if (record !== null && record.schemaVersion === 1) {
					records.push(record);
				}
			} catch (error) {
				debugError("[ImportJournal] Skipping unreadable record", key, error);
			}
		}
		return records;
	}
}

export const importJournal = new ImportJournal();
