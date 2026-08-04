import { constants, type BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, realpath, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { buildCapCut81ActiveContentMirrorPaths } from "@qcut/editor-core/jianying-draft";
import {
	CapCut81SameProfileWritebackError,
	failCapCut81SameProfileWriteback,
	type CapCut81SameProfileRecoveryResult,
} from "./capcut-8-1-same-profile-contract.js";

export const CAPCUT_WRITEBACK_MAX_CONTENT_BYTES = 64 * 1024 * 1024;
export const CAPCUT_WRITEBACK_LOCK_FILE_NAME = ".qcut-writeback.lock";
export const CAPCUT_WRITEBACK_JOURNAL_FILE_NAME =
	".qcut-writeback-journal.json";
export const CAPCUT_WRITEBACK_JOURNAL_SCHEMA =
	"qcut.capcut-8.1.same-profile-writeback-journal";

const CAPCUT_LOCK_FILE_NAME = ".locked";
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface CapCutWritebackFileIdentity {
	dev: string;
	ino: string;
	mtimeNs: string;
	size: string;
}

export interface CapCutWritebackMirrorDescriptor {
	absolutePath: string;
	relativePath: string;
	rollbackPath: string;
	temporaryPath: string;
}

export interface CapCutWritebackMirrorState
	extends CapCutWritebackMirrorDescriptor {
	identity: CapCutWritebackFileIdentity;
	sourceBytes: Uint8Array;
}

export interface CapCutWritebackJournalV1 {
	schema: typeof CAPCUT_WRITEBACK_JOURNAL_SCHEMA;
	schemaVersion: 1;
	transactionId: string;
	timelineId: string;
	expectedSourceSha256: string;
	contentSha256: string;
	committed: boolean;
}

export function getNodeErrorCode({
	error,
}: {
	error: unknown;
}): string | undefined {
	if (!(error instanceof Error) || !("code" in error)) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

export async function pathExists({ path }: { path: string }): Promise<boolean> {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if (getNodeErrorCode({ error }) === "ENOENT") return false;
		throw error;
	}
}

export async function assertCapCutClosed({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<void> {
	if (await isCapCutProjectLocked({ draftDirectory })) {
		failCapCut81SameProfileWriteback({
			code: "CAPCUT_PROJECT_LOCKED",
			message: "CapCut must be closed before same-profile writeback.",
		});
	}
}

export async function isCapCutProjectLocked({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<boolean> {
	return pathExists({ path: join(draftDirectory, CAPCUT_LOCK_FILE_NAME) });
}

export function identityFromStats({
	stats,
}: {
	stats: BigIntStats;
}): CapCutWritebackFileIdentity {
	return {
		dev: stats.dev.toString(),
		ino: stats.ino.toString(),
		mtimeNs: stats.mtimeNs.toString(),
		size: stats.size.toString(),
	};
}

export function identitiesEqual({
	left,
	right,
}: {
	left: CapCutWritebackFileIdentity;
	right: CapCutWritebackFileIdentity;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

export async function readRegularFile({
	path,
}: {
	path: string;
}): Promise<{ bytes: Uint8Array; identity: CapCutWritebackFileIdentity }> {
	const metadata = await lstat(path, { bigint: true });
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		failCapCut81SameProfileWriteback({
			code: "SOURCE_FILE_UNSAFE",
			message: "A CapCut writeback file is not a regular file.",
		});
	}
	if (metadata.size > BigInt(CAPCUT_WRITEBACK_MAX_CONTENT_BYTES)) {
		failCapCut81SameProfileWriteback({
			code: "SOURCE_FILE_UNSAFE",
			message: "A CapCut writeback file exceeds 64 MiB.",
		});
	}
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const before = identityFromStats({
			stats: await handle.stat({ bigint: true }),
		});
		const bytes = await handle.readFile();
		const after = identityFromStats({
			stats: await handle.stat({ bigint: true }),
		});
		if (!identitiesEqual({ left: before, right: after })) {
			failCapCut81SameProfileWriteback({
				code: "SOURCE_STATE_CHANGED",
				message: "A CapCut writeback file changed while it was read.",
			});
		}
		return { bytes, identity: after };
	} finally {
		await handle.close();
	}
}

export async function canonicalDraftDirectory({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<string> {
	let canonical: string;
	try {
		canonical = await realpath(resolve(draftDirectory));
		const metadata = await lstat(canonical);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error();
	} catch {
		failCapCut81SameProfileWriteback({
			code: "DRAFT_DIRECTORY_INVALID",
			message: "CapCut draft directory is missing or not a regular directory.",
		});
	}
	return canonical;
}

function artifactPath({
	targetPath,
	transactionId,
	type,
}: {
	targetPath: string;
	transactionId: string;
	type: "next" | "rollback";
}): string {
	return join(
		dirname(targetPath),
		`.${basename(targetPath)}.qcut-${transactionId}.${type}`
	);
}

export function buildMirrorDescriptors({
	draftDirectory,
	timelineId,
	transactionId,
}: {
	draftDirectory: string;
	timelineId: string;
	transactionId: string;
}): CapCutWritebackMirrorDescriptor[] {
	return buildCapCut81ActiveContentMirrorPaths({ timelineId }).map(
		(relativePath) => {
			const absolutePath = join(draftDirectory, ...relativePath.split("/"));
			return {
				absolutePath,
				relativePath,
				rollbackPath: artifactPath({
					targetPath: absolutePath,
					transactionId,
					type: "rollback",
				}),
				temporaryPath: artifactPath({
					targetPath: absolutePath,
					transactionId,
					type: "next",
				}),
			};
		}
	);
}

export async function writeExclusiveFile({
	bytes,
	path,
}: {
	bytes: Uint8Array;
	path: string;
}): Promise<void> {
	const handle = await open(path, "wx", 0o600);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function writeJournal({
	journal,
	journalPath,
	replace,
}: {
	journal: CapCutWritebackJournalV1;
	journalPath: string;
	replace: boolean;
}): Promise<void> {
	const bytes = new TextEncoder().encode(`${JSON.stringify(journal)}\n`);
	if (!replace) {
		await writeExclusiveFile({ bytes, path: journalPath });
		return;
	}
	const temporaryPath = `${journalPath}.${journal.transactionId}.next`;
	await writeExclusiveFile({ bytes, path: temporaryPath });
	await rename(temporaryPath, journalPath);
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<string | undefined> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, "r");
		await handle.sync();
		return undefined;
	} catch (error) {
		const code = getNodeErrorCode({ error });
		if (code && ["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code)) {
			return `Directory fsync is unsupported (${code}).`;
		}
		throw error;
	} finally {
		await handle?.close();
	}
}

export async function syncWritebackDirectories({
	directories,
}: {
	directories: readonly string[];
}): Promise<string[]> {
	const results = await Promise.all(
		[...new Set(directories)].map((directory) => syncDirectory({ directory }))
	);
	return results.flatMap((warning) => (warning ? [warning] : []));
}

export async function removeArtifacts({
	mirrors,
}: {
	mirrors: readonly CapCutWritebackMirrorDescriptor[];
}): Promise<void> {
	await Promise.all(
		mirrors.flatMap(({ rollbackPath, temporaryPath }) => [
			rm(rollbackPath, { force: true }),
			rm(temporaryPath, { force: true }),
		])
	);
}

export async function restoreRollbacks({
	mirrors,
}: {
	mirrors: readonly CapCutWritebackMirrorDescriptor[];
}): Promise<void> {
	await Promise.all(
		mirrors.map(async (mirror) => {
			if (await pathExists({ path: mirror.rollbackPath })) {
				await rename(mirror.rollbackPath, mirror.absolutePath);
			}
			await rm(mirror.temporaryPath, { force: true });
		})
	);
}

function parseJournal({ value }: { value: unknown }): CapCutWritebackJournalV1 {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		!("schema" in value) ||
		value.schema !== CAPCUT_WRITEBACK_JOURNAL_SCHEMA ||
		!("schemaVersion" in value) ||
		value.schemaVersion !== 1 ||
		!("transactionId" in value) ||
		typeof value.transactionId !== "string" ||
		!UUID_PATTERN.test(value.transactionId) ||
		!("timelineId" in value) ||
		typeof value.timelineId !== "string" ||
		!UUID_PATTERN.test(value.timelineId) ||
		!("expectedSourceSha256" in value) ||
		typeof value.expectedSourceSha256 !== "string" ||
		!/^[0-9a-f]{64}$/u.test(value.expectedSourceSha256) ||
		!("contentSha256" in value) ||
		typeof value.contentSha256 !== "string" ||
		!/^[0-9a-f]{64}$/u.test(value.contentSha256) ||
		!("committed" in value) ||
		typeof value.committed !== "boolean"
	) {
		failCapCut81SameProfileWriteback({
			code: "RECOVERY_REQUIRED",
			message:
				"QCut writeback journal is malformed and requires manual recovery.",
		});
	}
	return value as CapCutWritebackJournalV1;
}

async function verifyMirrorDigest({
	digest,
	mirrors,
}: {
	digest: string;
	mirrors: readonly CapCutWritebackMirrorDescriptor[];
}): Promise<void> {
	const matches = await Promise.all(
		mirrors.map(async ({ absolutePath }) => {
			const { bytes } = await readRegularFile({ path: absolutePath });
			return createHash("sha256").update(bytes).digest("hex") === digest;
		})
	);
	if (matches.some((matchesDigest) => !matchesDigest)) {
		failCapCut81SameProfileWriteback({
			code: "RECOVERY_REQUIRED",
			message: "Recovered CapCut mirrors failed digest verification.",
		});
	}
}

async function readJournal({
	journalPath,
}: {
	journalPath: string;
}): Promise<CapCutWritebackJournalV1> {
	const { bytes } = await readRegularFile({ path: journalPath });
	try {
		return parseJournal({
			value: JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(bytes)
			),
		});
	} catch (error) {
		if (error instanceof CapCut81SameProfileWritebackError) throw error;
		failCapCut81SameProfileWriteback({
			code: "RECOVERY_REQUIRED",
			message: "QCut writeback journal cannot be decoded.",
		});
	}
}

export async function recoverCapCut81SameProfileWriteback({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<CapCut81SameProfileRecoveryResult> {
	const canonical = await canonicalDraftDirectory({ draftDirectory });
	await assertCapCutClosed({ draftDirectory: canonical });
	const journalPath = join(canonical, CAPCUT_WRITEBACK_JOURNAL_FILE_NAME);
	if (!(await pathExists({ path: journalPath }))) {
		// A lock with no journal means the writer crashed before any mirror
		// was touched (mirror mutation starts only after the journal exists).
		// Clearing it is safe and prevents a permanent
		// WRITEBACK_ALREADY_RUNNING lockout.
		const lockPath = join(canonical, CAPCUT_WRITEBACK_LOCK_FILE_NAME);
		if (await pathExists({ path: lockPath })) {
			await rm(lockPath, { force: true });
			const warnings = await syncWritebackDirectories({
				directories: [canonical],
			});
			return { action: "cleared-stale-lock", warnings };
		}
		return { action: "none", warnings: [] };
	}
	const journal = await readJournal({ journalPath });
	const mirrors = buildMirrorDescriptors({
		draftDirectory: canonical,
		timelineId: journal.timelineId,
		transactionId: journal.transactionId,
	});
	if (journal.committed) {
		await verifyMirrorDigest({ digest: journal.contentSha256, mirrors });
		await removeArtifacts({ mirrors });
	} else {
		const rollbackAvailability = await Promise.all(
			mirrors.map(({ rollbackPath }) => pathExists({ path: rollbackPath }))
		);
		if (rollbackAvailability.some((available) => !available)) {
			failCapCut81SameProfileWriteback({
				code: "RECOVERY_REQUIRED",
				message: "An uncommitted writeback is missing a rollback mirror.",
			});
		}
		await restoreRollbacks({ mirrors });
		await verifyMirrorDigest({ digest: journal.expectedSourceSha256, mirrors });
	}
	await rm(journalPath, { force: true });
	await rm(join(canonical, CAPCUT_WRITEBACK_LOCK_FILE_NAME), { force: true });
	const warnings = await syncWritebackDirectories({
		directories: [
			canonical,
			...mirrors.map(({ absolutePath }) => dirname(absolutePath)),
		],
	});
	return {
		action: journal.committed ? "committed-cleanup" : "rolled-back",
		transactionId: journal.transactionId,
		warnings,
	};
}

export const capCut81SameProfileWriterTesting = Object.freeze({
	JOURNAL_FILE_NAME: CAPCUT_WRITEBACK_JOURNAL_FILE_NAME,
	QCUT_LOCK_FILE_NAME: CAPCUT_WRITEBACK_LOCK_FILE_NAME,
	buildMirrorStates: buildMirrorDescriptors,
});
