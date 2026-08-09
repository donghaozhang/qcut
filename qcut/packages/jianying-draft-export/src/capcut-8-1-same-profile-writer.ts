import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { rename, rm } from "node:fs/promises";
import {
	buildCapCut81ActiveContentMirrorPaths,
	CAPCUT_8_1_NEW_VERSION,
	CAPCUT_8_1_PROFILE_ID,
	CAPCUT_8_1_SAVED_NEW_VERSION,
} from "@qcut/editor-core/jianying-draft";
import {
	CapCut81SameProfileWritebackError,
	failCapCut81SameProfileWriteback,
	type CapCut81SameProfileWritebackResult,
	type WriteCapCut81SameProfileContentOptions,
} from "./capcut-8-1-same-profile-contract.js";
import {
	CAPCUT_WRITEBACK_JOURNAL_FILE_NAME,
	CAPCUT_WRITEBACK_JOURNAL_SCHEMA,
	CAPCUT_WRITEBACK_LOCK_FILE_NAME,
	CAPCUT_WRITEBACK_MAX_CONTENT_BYTES,
	assertCapCutClosed,
	buildMirrorDescriptors,
	canonicalDraftDirectory,
	getNodeErrorCode,
	identitiesEqual,
	isCapCutProjectLocked,
	pathExists,
	readRegularFile,
	removeArtifacts,
	restoreRollbacks,
	syncWritebackDirectories,
	writeExclusiveFile,
	writeJournal,
	type CapCutWritebackJournalV1,
	type CapCutWritebackMirrorDescriptor,
	type CapCutWritebackMirrorState,
} from "./capcut-8-1-same-profile-transaction.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assertSha256({ value }: { value: string }): void {
	if (!/^[0-9a-f]{64}$/u.test(value)) {
		failCapCut81SameProfileWriteback({
			code: "CONTENT_INVALID",
			message: "Expected source digest must be lowercase SHA-256 hex.",
		});
	}
}

function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function parseContentIdentity({ contentBytes }: { contentBytes: Uint8Array }): {
	timelineId: string;
} {
	if (
		contentBytes.byteLength === 0 ||
		contentBytes.byteLength > CAPCUT_WRITEBACK_MAX_CONTENT_BYTES
	) {
		failCapCut81SameProfileWriteback({
			code: "CONTENT_INVALID",
			message: "Patched CapCut content is empty or exceeds 64 MiB.",
		});
	}
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes);
	} catch {
		failCapCut81SameProfileWriteback({
			code: "CONTENT_INVALID",
			message: "Patched CapCut content is not valid UTF-8.",
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		failCapCut81SameProfileWriteback({
			code: "CONTENT_INVALID",
			message: "Patched CapCut content is not valid JSON.",
		});
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		Array.isArray(parsed) ||
		!("id" in parsed) ||
		typeof parsed.id !== "string" ||
		!UUID_PATTERN.test(parsed.id) ||
		!("new_version" in parsed) ||
		(parsed.new_version !== CAPCUT_8_1_NEW_VERSION &&
			parsed.new_version !== CAPCUT_8_1_SAVED_NEW_VERSION)
	) {
		failCapCut81SameProfileWriteback({
			code: "CONTENT_INVALID",
			message:
				"Patched content does not match the verified CapCut 8.1 identity.",
		});
	}
	return { timelineId: parsed.id };
}

async function readMirrorStates({
	expectedSourceSha256,
	mirrors,
}: {
	expectedSourceSha256: string;
	mirrors: readonly CapCutWritebackMirrorDescriptor[];
}): Promise<CapCutWritebackMirrorState[]> {
	return Promise.all(
		mirrors.map(async (mirror) => {
			const source = await readRegularFile({ path: mirror.absolutePath });
			if (sha256({ bytes: source.bytes }) !== expectedSourceSha256) {
				failCapCut81SameProfileWriteback({
					code: "MIRROR_CONTENT_MISMATCH",
					message:
						"CapCut active-content mirrors no longer match the imported source.",
				});
			}
			return {
				...mirror,
				identity: source.identity,
				sourceBytes: source.bytes,
			};
		})
	);
}

async function stageMirrorFiles({
	contentBytes,
	mirrors,
}: {
	contentBytes: Uint8Array;
	mirrors: readonly CapCutWritebackMirrorState[];
}): Promise<void> {
	await Promise.all(
		mirrors.flatMap((mirror) => [
			writeExclusiveFile({
				bytes: contentBytes,
				path: mirror.temporaryPath,
			}),
			writeExclusiveFile({
				bytes: mirror.sourceBytes,
				path: mirror.rollbackPath,
			}),
		])
	);
}

async function verifySourceIdentities({
	mirrors,
}: {
	mirrors: readonly CapCutWritebackMirrorState[];
}): Promise<void> {
	await Promise.all(
		mirrors.map(async (mirror) => {
			const current = await readRegularFile({ path: mirror.absolutePath });
			if (
				!identitiesEqual({ left: current.identity, right: mirror.identity }) ||
				sha256({ bytes: current.bytes }) !==
					sha256({ bytes: mirror.sourceBytes })
			) {
				failCapCut81SameProfileWriteback({
					code: "SOURCE_STATE_CHANGED",
					message: "CapCut content changed before transaction commit.",
				});
			}
		})
	);
}

async function replaceMirrors({
	draftDirectory,
	instrumentation,
	mirrors,
}: {
	draftDirectory: string;
	instrumentation: WriteCapCut81SameProfileContentOptions["instrumentation"];
	mirrors: readonly CapCutWritebackMirrorState[];
}): Promise<void> {
	await mirrors.reduce<Promise<number>>(async (previousPromise, mirror) => {
		const replacedCount = await previousPromise;
		await assertCapCutClosed({ draftDirectory });
		await rename(mirror.temporaryPath, mirror.absolutePath);
		const nextCount = replacedCount + 1;
		await instrumentation?.afterMirrorReplaced?.({
			replacedCount: nextCount,
			relativePath: mirror.relativePath,
		});
		return nextCount;
	}, Promise.resolve(0));
}

async function verifyWrittenMirrors({
	contentSha256,
	mirrors,
}: {
	contentSha256: string;
	mirrors: readonly CapCutWritebackMirrorState[];
}): Promise<void> {
	await Promise.all(
		mirrors.map(async (mirror) => {
			const written = await readRegularFile({ path: mirror.absolutePath });
			if (sha256({ bytes: written.bytes }) !== contentSha256) {
				failCapCut81SameProfileWriteback({
					code: "TRANSACTION_FAILED",
					message:
						"A CapCut active-content mirror failed post-write verification.",
				});
			}
		})
	);
}

function getTransactionDirectories({
	draftDirectory,
	mirrors,
}: {
	draftDirectory: string;
	mirrors: readonly CapCutWritebackMirrorDescriptor[];
}): string[] {
	return [
		draftDirectory,
		...mirrors.map(({ absolutePath }) => dirname(absolutePath)),
	];
}

export async function writeCapCut81SameProfileContent({
	contentBytes,
	draftDirectory,
	expectedSourceSha256,
	instrumentation,
	profileId,
}: WriteCapCut81SameProfileContentOptions): Promise<CapCut81SameProfileWritebackResult> {
	if (profileId !== CAPCUT_8_1_PROFILE_ID) {
		failCapCut81SameProfileWriteback({
			code: "PROFILE_MISMATCH",
			message: "Same-profile writer only accepts the exact CapCut 8.1 profile.",
		});
	}
	assertSha256({ value: expectedSourceSha256 });
	const { timelineId } = parseContentIdentity({ contentBytes });
	const canonical = await canonicalDraftDirectory({ draftDirectory });
	await assertCapCutClosed({ draftDirectory: canonical });
	const journalPath = join(canonical, CAPCUT_WRITEBACK_JOURNAL_FILE_NAME);
	if (await pathExists({ path: journalPath })) {
		failCapCut81SameProfileWriteback({
			code: "RECOVERY_REQUIRED",
			message: "A previous QCut writeback transaction must be recovered first.",
		});
	}
	const transactionId = randomUUID();
	const lockPath = join(canonical, CAPCUT_WRITEBACK_LOCK_FILE_NAME);
	try {
		await writeExclusiveFile({
			bytes: new TextEncoder().encode(`${transactionId}\n`),
			path: lockPath,
		});
	} catch (error) {
		if (getNodeErrorCode({ error }) === "EEXIST") {
			failCapCut81SameProfileWriteback({
				code: "WRITEBACK_ALREADY_RUNNING",
				message: "Another QCut writeback transaction is already running.",
			});
		}
		throw error;
	}

	const mirrorDescriptors = buildMirrorDescriptors({
		draftDirectory: canonical,
		timelineId,
		transactionId,
	});
	const transactionDirectories = getTransactionDirectories({
		draftDirectory: canonical,
		mirrors: mirrorDescriptors,
	});
	const contentSha256 = sha256({ bytes: contentBytes });
	let journalWritten = false;
	let committed = false;
	try {
		const mirrors = await readMirrorStates({
			expectedSourceSha256,
			mirrors: mirrorDescriptors,
		});
		await stageMirrorFiles({ contentBytes, mirrors });
		const journal: CapCutWritebackJournalV1 = {
			schema: CAPCUT_WRITEBACK_JOURNAL_SCHEMA,
			schemaVersion: 1,
			transactionId,
			timelineId,
			expectedSourceSha256,
			contentSha256,
			committed: false,
		};
		await writeJournal({ journal, journalPath, replace: false });
		journalWritten = true;
		const warnings = await syncWritebackDirectories({
			directories: transactionDirectories,
		});
		await assertCapCutClosed({ draftDirectory: canonical });
		await verifySourceIdentities({ mirrors });
		await replaceMirrors({
			draftDirectory: canonical,
			instrumentation,
			mirrors,
		});
		await verifyWrittenMirrors({ contentSha256, mirrors });
		warnings.push(
			...(await syncWritebackDirectories({
				directories: transactionDirectories,
			}))
		);
		await writeJournal({
			journal: { ...journal, committed: true },
			journalPath,
			replace: true,
		});
		warnings.push(
			...(await syncWritebackDirectories({ directories: [canonical] }))
		);
		committed = true;
		await removeArtifacts({ mirrors });
		await rm(journalPath, { force: true });
		warnings.push(
			...(await syncWritebackDirectories({
				directories: transactionDirectories,
			}))
		);
		return {
			contentSha256,
			mirrorRelativePaths: buildCapCut81ActiveContentMirrorPaths({
				timelineId,
			}),
			replacedMirrorCount: 4,
			timelineId,
			transactionId,
			warnings: [...new Set(warnings)],
		};
	} catch (error) {
		if (
			journalWritten &&
			!committed &&
			(await isCapCutProjectLocked({ draftDirectory: canonical }))
		) {
			throw new CapCut81SameProfileWritebackError({
				code: "RECOVERY_REQUIRED",
				message:
					"CapCut opened during writeback; close it before recovering the transaction.",
			});
		}
		try {
			if (journalWritten && !committed) {
				await restoreRollbacks({ mirrors: mirrorDescriptors });
			} else {
				await removeArtifacts({ mirrors: mirrorDescriptors });
			}
			await rm(journalPath, { force: true });
			await syncWritebackDirectories({ directories: transactionDirectories });
		} catch {
			throw new CapCut81SameProfileWritebackError({
				code: "RECOVERY_REQUIRED",
				message: "Writeback failed and automatic rollback requires recovery.",
			});
		}
		throw error;
	} finally {
		if (
			!journalWritten ||
			committed ||
			!(await pathExists({ path: journalPath }))
		) {
			await rm(lockPath, { force: true });
		}
	}
}
