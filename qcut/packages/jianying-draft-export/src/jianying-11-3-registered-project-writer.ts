import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	failJianying113RegisteredProjectWriteback,
	type Jianying113RegisteredProjectRecoveryResult,
	type Jianying113RegisteredProjectWritebackResult,
	type RecoverJianying113RegisteredProjectWritebackOptions,
	type WriteJianying113RegisteredProjectContentOptions,
} from "./jianying-11-3-registered-project-contract.js";
import { inspectJianying113ProjectSource } from "./jianying-11-3-project-source.js";
import {
	JOURNAL_FILE_NAME,
	JOURNAL_SCHEMA,
	type Jianying113WritebackJournalV1,
	readJournal,
	writeJournal,
} from "./jianying-11-3-registered-project-journal.js";
import {
	assertJianyingClosed,
	assertMatchingContent,
	buildTransactionPaths,
	canonicalProjectDirectory,
	getNodeErrorCode,
	pathExists,
	QCUT_LOCK_FILE_NAME,
	readContentIdentity,
	readRegularFile,
	removeArtifacts,
	resolveContentPath,
	restoreUncommittedTransaction,
	SHA256_PATTERN,
	sha256,
	syncDirectories,
	type TransactionPaths,
	verifySourceUnchanged,
	writeExclusiveFile,
} from "./jianying-11-3-registered-project-transaction.js";

function recoveryRequired({ message }: { message: string }): never {
	failJianying113RegisteredProjectWriteback({
		code: "RECOVERY_REQUIRED",
		message,
	});
}

export async function writeJianying113RegisteredProjectContent({
	assertTargetAppClosed,
	contentBytes,
	expectedSourceSha256,
	instrumentation,
	profileId,
	projectDirectory,
}: WriteJianying113RegisteredProjectContentOptions): Promise<Jianying113RegisteredProjectWritebackResult> {
	if (!SHA256_PATTERN.test(expectedSourceSha256)) {
		failJianying113RegisteredProjectWriteback({
			code: "CONTENT_INVALID",
			message: "Expected Jianying source digest must be lowercase SHA-256 hex.",
		});
	}
	const preparedIdentity = readContentIdentity({ contentBytes, profileId });
	const canonical = await canonicalProjectDirectory({ projectDirectory });
	await assertJianyingClosed({
		assertTargetAppClosed,
		projectDirectory: canonical,
	});
	const journalPath = join(canonical, JOURNAL_FILE_NAME);
	if (await pathExists({ path: journalPath })) {
		recoveryRequired({
			message:
				"A previous Jianying writeback transaction must be recovered first.",
		});
	}
	const transactionId = randomUUID();
	const lockPath = join(canonical, QCUT_LOCK_FILE_NAME);
	try {
		await writeExclusiveFile({
			bytes: new TextEncoder().encode(`${transactionId}\n`),
			path: lockPath,
		});
	} catch (error) {
		if (getNodeErrorCode({ error }) === "EEXIST") {
			failJianying113RegisteredProjectWriteback({
				code: "WRITEBACK_ALREADY_RUNNING",
				message:
					"Another QCut Jianying writeback transaction is already running.",
			});
		}
		throw error;
	}

	let journal: Jianying113WritebackJournalV1 | undefined;
	let paths: TransactionPaths | undefined;
	let committed = false;
	try {
		const source = await inspectJianying113ProjectSource({
			expectedContentSha256: expectedSourceSha256,
			projectDirectory: canonical,
		});
		const targetPath = await resolveContentPath({
			contentRelativePath: source.contentRelativePath,
			projectDirectory: canonical,
		});
		const sourceState = await readRegularFile({ path: targetPath });
		const sourceIdentity = readContentIdentity({
			contentBytes: sourceState.bytes,
			profileId: preparedIdentity.profileId,
		});
		if (sourceIdentity.documentId !== preparedIdentity.documentId) {
			failJianying113RegisteredProjectWriteback({
				code: "CONTENT_INVALID",
				message:
					"Prepared Jianying content changes the subdraft document identity.",
			});
		}
		paths = buildTransactionPaths({ contentPath: targetPath, transactionId });
		await Promise.all([
			writeExclusiveFile({
				bytes: contentBytes,
				mode: sourceState.mode,
				path: paths.temporaryPath,
			}),
			writeExclusiveFile({
				bytes: sourceState.bytes,
				mode: sourceState.mode,
				path: paths.rollbackPath,
			}),
		]);
		journal = {
			committed: false,
			contentRelativePath: source.contentRelativePath,
			contentSha256: sha256({ bytes: contentBytes }),
			documentId: sourceIdentity.documentId,
			expectedSourceSha256,
			profileId: preparedIdentity.profileId,
			schema: JOURNAL_SCHEMA,
			schemaVersion: 1,
			subdraftId: source.subdraftId,
			transactionId,
		};
		await writeJournal({ journal, journalPath, replace: false });
		const transactionDirectories = [canonical, dirname(targetPath)];
		const warnings = await syncDirectories({
			directories: transactionDirectories,
		});
		await assertJianyingClosed({
			assertTargetAppClosed,
			projectDirectory: canonical,
		});
		await verifySourceUnchanged({
			expectedIdentity: sourceState.identity,
			expectedSourceSha256,
			path: targetPath,
		});
		await rename(paths.temporaryPath, targetPath);
		await instrumentation?.afterContentReplaced?.();
		await assertJianyingClosed({
			assertTargetAppClosed,
			projectDirectory: canonical,
		});
		const written = await readRegularFile({ path: targetPath });
		assertMatchingContent({
			bytes: written.bytes,
			digest: journal.contentSha256,
			documentId: journal.documentId,
			profileId: journal.profileId,
		});
		warnings.push(
			...(await syncDirectories({ directories: transactionDirectories }))
		);
		await writeJournal({
			journal: { ...journal, committed: true },
			journalPath,
			replace: true,
		});
		committed = true;
		warnings.push(...(await syncDirectories({ directories: [canonical] })));
		await instrumentation?.afterJournalCommitted?.();
		await removeArtifacts({ paths });
		await rm(journalPath, { force: true });
		warnings.push(
			...(await syncDirectories({ directories: transactionDirectories }))
		);
		return {
			contentRelativePath: journal.contentRelativePath,
			contentSha256: journal.contentSha256,
			profileId: journal.profileId,
			subdraftId: journal.subdraftId,
			transactionId,
			warnings: [...new Set(warnings)],
		};
	} catch (error) {
		if (journal !== undefined && paths !== undefined && !committed) {
			try {
				await assertJianyingClosed({
					assertTargetAppClosed,
					projectDirectory: canonical,
				});
				await restoreUncommittedTransaction({ journal, paths });
				await rm(journalPath, { force: true });
				await syncDirectories({
					directories: [canonical, dirname(paths.targetPath)],
				});
			} catch {
				recoveryRequired({
					message:
						"Jianying writeback failed and automatic rollback requires recovery.",
				});
			}
		} else if (journal === undefined && paths !== undefined) {
			await removeArtifacts({ paths });
		}
		if (committed) {
			recoveryRequired({
				message:
					"Jianying content committed, but transaction cleanup requires recovery.",
			});
		}
		throw error;
	} finally {
		if (!(await pathExists({ path: journalPath }))) {
			await rm(lockPath, { force: true });
		}
	}
}

export async function recoverJianying113RegisteredProjectWriteback({
	assertTargetAppClosed,
	projectDirectory,
}: RecoverJianying113RegisteredProjectWritebackOptions): Promise<Jianying113RegisteredProjectRecoveryResult> {
	const canonical = await canonicalProjectDirectory({ projectDirectory });
	await assertJianyingClosed({
		assertTargetAppClosed,
		projectDirectory: canonical,
	});
	const journalPath = join(canonical, JOURNAL_FILE_NAME);
	const lockPath = join(canonical, QCUT_LOCK_FILE_NAME);
	if (!(await pathExists({ path: journalPath }))) {
		if (!(await pathExists({ path: lockPath }))) {
			return { action: "none", warnings: [] };
		}
		await rm(lockPath, { force: true });
		return {
			action: "cleared-stale-lock",
			warnings: await syncDirectories({ directories: [canonical] }),
		};
	}
	const journal = await readJournal({ journalPath });
	const targetPath = await resolveContentPath({
		contentRelativePath: journal.contentRelativePath,
		projectDirectory: canonical,
	});
	const paths = buildTransactionPaths({
		contentPath: targetPath,
		transactionId: journal.transactionId,
	});
	if (journal.committed) {
		const committedContent = await readRegularFile({ path: targetPath });
		assertMatchingContent({
			bytes: committedContent.bytes,
			digest: journal.contentSha256,
			documentId: journal.documentId,
			profileId: journal.profileId,
		});
		await removeArtifacts({ paths });
	} else {
		await restoreUncommittedTransaction({ journal, paths });
	}
	await Promise.all([
		rm(journalPath, { force: true }),
		rm(lockPath, { force: true }),
	]);
	const warnings = await syncDirectories({
		directories: [canonical, dirname(targetPath)],
	});
	return {
		action: journal.committed ? "committed-cleanup" : "rolled-back",
		transactionId: journal.transactionId,
		warnings,
	};
}

export const jianying113RegisteredProjectWriterTesting = Object.freeze({
	JOURNAL_FILE_NAME,
	QCUT_LOCK_FILE_NAME,
});
