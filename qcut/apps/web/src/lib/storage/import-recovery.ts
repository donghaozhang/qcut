/**
 * Import recovery (JYI-010).
 *
 * Runs at startup: any journal record still in `staging` means a crash or
 * reload interrupted an import before publish — its partial data is deleted
 * (the project record was never written, so nothing was ever visible). A
 * `published` record whose project reads back cleanly just finishes its
 * bookkeeping; one whose project is missing gets the same cleanup.
 *
 * @module lib/storage/import-recovery
 */

import { debugError, debugLog } from "@/lib/debug/debug-config";
import type { ImportJournal } from "./import-journal";
import { importJournal } from "./import-journal";
import type { ImportStagingStorage } from "./import-staging-adapter";
import { storageService } from "./storage-service";

export interface ImportRecoveryResult {
	rolledBackImportIds: string[];
	completedImportIds: string[];
}

async function rollbackRecord({
	storage,
	projectId,
	sceneId,
}: {
	storage: ImportStagingStorage;
	projectId: string;
	sceneId: string;
}): Promise<void> {
	await Promise.all([
		storage.deleteProjectMedia(projectId),
		storage.deleteProjectTimeline({ projectId }),
		storage.deleteProjectTimeline({ projectId, sceneId }),
	]);
	await storage.deleteProject(projectId);
}

/**
 * Finishes or rolls back every interrupted import. Safe to run on every
 * app start; an empty journal is a no-op.
 */
export async function recoverPendingImports({
	journal = importJournal,
	storage = storageService,
}: {
	journal?: ImportJournal;
	storage?: ImportStagingStorage;
} = {}): Promise<ImportRecoveryResult> {
	const result: ImportRecoveryResult = {
		rolledBackImportIds: [],
		completedImportIds: [],
	};
	const records = await journal.list();
	for (const record of records) {
		try {
			if (record.phase === "staging") {
				await rollbackRecord({
					storage,
					projectId: record.projectId,
					sceneId: record.sceneId,
				});
				await journal.complete({ importId: record.importId });
				result.rolledBackImportIds.push(record.importId);
				debugLog(
					"[ImportRecovery] Rolled back interrupted import",
					record.importId
				);
				continue;
			}
			const project = await storage.loadProject({ id: record.projectId });
			if (project === null) {
				// Published flag without a readable project: clean up remains.
				await rollbackRecord({
					storage,
					projectId: record.projectId,
					sceneId: record.sceneId,
				});
				await journal.complete({ importId: record.importId });
				result.rolledBackImportIds.push(record.importId);
				continue;
			}
			await journal.complete({ importId: record.importId });
			result.completedImportIds.push(record.importId);
		} catch (error) {
			// Leave the record for the next startup rather than losing it.
			debugError(
				"[ImportRecovery] Failed to recover import",
				record.importId,
				error
			);
		}
	}
	return result;
}
