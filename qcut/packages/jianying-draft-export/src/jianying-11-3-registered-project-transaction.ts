import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, realpath, rename, rm } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import type { Jianying113ProfileId } from "@qcut/editor-core/jianying-draft";
import {
	failJianying113RegisteredProjectWriteback,
	type WriteJianying113RegisteredProjectContentOptions,
} from "./jianying-11-3-registered-project-contract.js";
import {
	readJianying113ContentIdentity,
	type Jianying113ContentIdentity,
} from "./jianying-11-3-content-profile.js";
import type { Jianying113WritebackJournalV1 } from "./jianying-11-3-registered-project-journal.js";

const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const JIANYING_LOCK_FILE_NAME = ".locked";
export const QCUT_LOCK_FILE_NAME = ".qcut-jianying-writeback.lock";
export const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CONTENT_RELATIVE_PATH_PATTERN =
	/^subdraft\/(?:[^/]+\/)?draft_content\.json$/u;

export interface FileIdentity {
	dev: string;
	ino: string;
	mtimeNs: string;
	size: string;
}

export interface ContentFileState {
	bytes: Uint8Array;
	identity: FileIdentity;
	mode: number;
}

export interface TransactionPaths {
	rollbackPath: string;
	targetPath: string;
	temporaryPath: string;
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

export function sha256({ bytes }: { bytes: Uint8Array }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function identityFromStats({ stats }: { stats: BigIntStats }): FileIdentity {
	return {
		dev: stats.dev.toString(),
		ino: stats.ino.toString(),
		mtimeNs: stats.mtimeNs.toString(),
		size: stats.size.toString(),
	};
}

function identitiesEqual({
	left,
	right,
}: {
	left: FileIdentity;
	right: FileIdentity;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

export async function canonicalProjectDirectory({
	projectDirectory,
}: {
	projectDirectory: string;
}): Promise<string> {
	try {
		const canonical = await realpath(resolve(projectDirectory));
		const metadata = await lstat(canonical);
		if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error();
		return canonical;
	} catch {
		failJianying113RegisteredProjectWriteback({
			code: "PROJECT_DIRECTORY_INVALID",
			message:
				"Jianying registered project directory is missing or not a regular directory.",
		});
	}
}

export async function assertJianyingClosed({
	assertTargetAppClosed,
	projectDirectory,
}: {
	assertTargetAppClosed: WriteJianying113RegisteredProjectContentOptions["assertTargetAppClosed"];
	projectDirectory: string;
}): Promise<void> {
	await assertTargetAppClosed({ projectDirectory });
	if (
		await pathExists({ path: join(projectDirectory, JIANYING_LOCK_FILE_NAME) })
	) {
		failJianying113RegisteredProjectWriteback({
			code: "JIANYING_PROJECT_LOCKED",
			message:
				"Jianying Professional must be closed before registered-project writeback.",
		});
	}
}

export function readContentIdentity({
	contentBytes,
	profileId,
}: {
	contentBytes: Uint8Array;
	profileId: string;
}): Jianying113ContentIdentity {
	if (
		contentBytes.byteLength === 0 ||
		contentBytes.byteLength > MAX_CONTENT_BYTES
	) {
		failJianying113RegisteredProjectWriteback({
			code: "CONTENT_INVALID",
			message: "Jianying content is empty or exceeds 64 MiB.",
		});
	}
	try {
		return readJianying113ContentIdentity({ contentBytes, profileId });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		failJianying113RegisteredProjectWriteback({
			code: message.includes("unsupported 11.3 profile id")
				? "PROFILE_MISMATCH"
				: "CONTENT_INVALID",
			message,
		});
	}
}

export async function readRegularFile({
	path,
}: {
	path: string;
}): Promise<ContentFileState> {
	const metadata = await lstat(path, { bigint: true });
	if (
		!metadata.isFile() ||
		metadata.isSymbolicLink() ||
		metadata.size > BigInt(MAX_CONTENT_BYTES)
	) {
		failJianying113RegisteredProjectWriteback({
			code: "SOURCE_FILE_UNSAFE",
			message: "Jianying subdraft content is not a bounded regular file.",
		});
	}
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	const handle = await open(path, constants.O_RDONLY | noFollowFlag);
	try {
		const beforeStats = await handle.stat({ bigint: true });
		const before = identityFromStats({ stats: beforeStats });
		const bytes = await handle.readFile();
		const afterStats = await handle.stat({ bigint: true });
		const after = identityFromStats({ stats: afterStats });
		if (!identitiesEqual({ left: before, right: after })) {
			failJianying113RegisteredProjectWriteback({
				code: "SOURCE_STATE_CHANGED",
				message: "Jianying subdraft content changed while it was read.",
			});
		}
		return {
			bytes,
			identity: after,
			mode: Number(afterStats.mode & 0o777n),
		};
	} finally {
		await handle.close();
	}
}

export async function writeExclusiveFile({
	bytes,
	mode = 0o600,
	path,
}: {
	bytes: Uint8Array;
	mode?: number;
	path: string;
}): Promise<void> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	const handle = await open(
		path,
		constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag,
		mode
	);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<string | undefined> {
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(directory, constants.O_RDONLY);
		await handle.sync();
		return undefined;
	} catch (error) {
		const code = getNodeErrorCode({ error });
		if (code && ["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code)) {
			return `Directory fsync is unsupported (${code}).`;
		}
		throw error;
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

export async function syncDirectories({
	directories,
}: {
	directories: readonly string[];
}): Promise<string[]> {
	const results = await Promise.all(
		[...new Set(directories)].map((directory) => syncDirectory({ directory }))
	);
	return results.flatMap((warning) => (warning === undefined ? [] : [warning]));
}

export function buildTransactionPaths({
	contentPath,
	transactionId,
}: {
	contentPath: string;
	transactionId: string;
}): TransactionPaths {
	const artifactPrefix = join(
		dirname(contentPath),
		`.${basename(contentPath)}.qcut-${transactionId}`
	);
	return {
		rollbackPath: `${artifactPrefix}.rollback`,
		targetPath: contentPath,
		temporaryPath: `${artifactPrefix}.next`,
	};
}

export async function resolveContentPath({
	contentRelativePath,
	projectDirectory,
}: {
	contentRelativePath: string;
	projectDirectory: string;
}): Promise<string> {
	if (contentRelativePath.match(CONTENT_RELATIVE_PATH_PATTERN) === null) {
		failJianying113RegisteredProjectWriteback({
			code: "RECOVERY_REQUIRED",
			message: "Jianying writeback journal contains an unsafe content path.",
		});
	}
	const targetPath = join(projectDirectory, ...contentRelativePath.split("/"));
	const lexicalParent = dirname(targetPath);
	const realParent = await realpath(lexicalParent);
	const relativePath = relative(projectDirectory, targetPath);
	if (
		realParent !== lexicalParent ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		failJianying113RegisteredProjectWriteback({
			code: "SOURCE_FILE_UNSAFE",
			message: "Jianying subdraft path escapes through a symbolic link.",
		});
	}
	return targetPath;
}

export async function removeArtifacts({
	paths,
}: {
	paths: TransactionPaths;
}): Promise<void> {
	await Promise.all([
		rm(paths.rollbackPath, { force: true }),
		rm(paths.temporaryPath, { force: true }),
	]);
}

export function assertMatchingContent({
	bytes,
	digest,
	documentId,
	profileId,
}: {
	bytes: Uint8Array;
	digest: string;
	documentId: string;
	profileId: Jianying113ProfileId;
}): void {
	const identity = readContentIdentity({ contentBytes: bytes, profileId });
	if (sha256({ bytes }) !== digest || identity.documentId !== documentId) {
		failJianying113RegisteredProjectWriteback({
			code: "SOURCE_STATE_CHANGED",
			message:
				"Jianying subdraft identity no longer matches the writeback plan.",
		});
	}
}

export async function restoreUncommittedTransaction({
	journal,
	paths,
}: {
	journal: Jianying113WritebackJournalV1;
	paths: TransactionPaths;
}): Promise<void> {
	if (await pathExists({ path: paths.rollbackPath })) {
		const rollback = await readRegularFile({ path: paths.rollbackPath });
		assertMatchingContent({
			bytes: rollback.bytes,
			digest: journal.expectedSourceSha256,
			documentId: journal.documentId,
			profileId: journal.profileId,
		});
		await rename(paths.rollbackPath, paths.targetPath);
	}
	await rm(paths.temporaryPath, { force: true });
	const restored = await readRegularFile({ path: paths.targetPath });
	assertMatchingContent({
		bytes: restored.bytes,
		digest: journal.expectedSourceSha256,
		documentId: journal.documentId,
		profileId: journal.profileId,
	});
}

export async function verifySourceUnchanged({
	expectedIdentity,
	expectedSourceSha256,
	path,
}: {
	expectedIdentity: FileIdentity;
	expectedSourceSha256: string;
	path: string;
}): Promise<void> {
	const current = await readRegularFile({ path });
	if (
		!identitiesEqual({ left: current.identity, right: expectedIdentity }) ||
		sha256({ bytes: current.bytes }) !== expectedSourceSha256
	) {
		failJianying113RegisteredProjectWriteback({
			code: "SOURCE_STATE_CHANGED",
			message: "Jianying subdraft changed before transaction commit.",
		});
	}
}
