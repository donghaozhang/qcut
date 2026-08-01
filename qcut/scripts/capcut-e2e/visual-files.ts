import { createHash } from "node:crypto";
import { constants as fileSystemConstants, type BigIntStats } from "node:fs";
import { lstat, mkdtemp, open, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type {
	VisualCaptureEvidence,
	VisualFileEvidence,
} from "./visual-contract.js";

const MAXIMUM_VISUAL_FILE_BYTES = 512 * 1024 * 1024;

export interface VisualOutputLayout {
	finalDirectory: string;
	stagingDirectory: string;
}

export interface StagedVisualFile {
	evidence: VisualFileEvidence;
	stagingPath: string;
}

export interface VisualFileSnapshot {
	bytes: Buffer;
	evidence: VisualFileEvidence;
}

export interface VisualJsonFileSnapshot extends VisualFileSnapshot {
	value: unknown;
}

export interface VisualFileSnapshotTestingHooks {
	afterBytesRead?: () => Promise<void>;
}

interface CaptureLocation {
	canonicalCapturesDirectory: string | null;
	canonicalParentDirectory: string | null;
	path: string;
}

function getErrorCode({ error }: { error: unknown }): string | null {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}
	return typeof error.code === "string" ? error.code : null;
}

function isMissingPathError({ error }: { error: unknown }): boolean {
	return getErrorCode({ error }) === "ENOENT";
}

function isSameFileIdentity({
	left,
	right,
}: {
	left: BigIntStats;
	right: BigIntStats;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mode === right.mode &&
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

function isSameOrDescendantPath({
	candidatePath,
	parentPath,
}: {
	candidatePath: string;
	parentPath: string;
}): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

function changedDuringSnapshotError({
	label,
	path,
}: {
	label: string;
	path: string;
}): Error {
	return new Error(
		`${label} changed while its file-integrity snapshot was read: ${path}`
	);
}

async function requireCanonicalPath({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if (isMissingPathError({ error })) {
			throw changedDuringSnapshotError({ label, path });
		}
		throw error;
	}
}

async function readRegularFileSnapshot({
	allowMissing,
	label,
	path,
	testingHooks,
}: {
	allowMissing: boolean;
	label: string;
	path: string;
	testingHooks?: VisualFileSnapshotTestingHooks;
}): Promise<VisualFileSnapshot | null> {
	let pathStatsBeforeOpen: BigIntStats;
	try {
		pathStatsBeforeOpen = await lstat(path, { bigint: true });
	} catch (error) {
		if (allowMissing && isMissingPathError({ error })) return null;
		throw error;
	}
	if (pathStatsBeforeOpen.isSymbolicLink()) {
		throw new Error(`${label} must not be a symbolic link: ${path}`);
	}
	if (!pathStatsBeforeOpen.isFile() || pathStatsBeforeOpen.size <= 0n) {
		throw new Error(`${label} is not a non-empty regular file: ${path}`);
	}
	if (pathStatsBeforeOpen.size > BigInt(MAXIMUM_VISUAL_FILE_BYTES)) {
		throw new Error(
			`${label} exceeds the ${MAXIMUM_VISUAL_FILE_BYTES}-byte evidence limit: ${path}`
		);
	}

	const canonicalPath = await requireCanonicalPath({ label, path });
	const noFollowFlag = fileSystemConstants.O_NOFOLLOW ?? 0;
	let fileHandle: Awaited<ReturnType<typeof open>>;
	try {
		fileHandle = await open(
			canonicalPath,
			fileSystemConstants.O_RDONLY | noFollowFlag
		);
	} catch (error) {
		if (isMissingPathError({ error }) || getErrorCode({ error }) === "ELOOP") {
			throw changedDuringSnapshotError({ label, path });
		}
		throw error;
	}

	let bytes: Buffer;
	let openedStats: BigIntStats;
	try {
		openedStats = await fileHandle.stat({ bigint: true });
		if (
			!openedStats.isFile() ||
			!isSameFileIdentity({ left: pathStatsBeforeOpen, right: openedStats })
		) {
			throw changedDuringSnapshotError({ label, path });
		}
		bytes = await fileHandle.readFile();
		await testingHooks?.afterBytesRead?.();
		const openedStatsAfterRead = await fileHandle.stat({ bigint: true });
		if (
			!isSameFileIdentity({ left: openedStats, right: openedStatsAfterRead })
		) {
			throw changedDuringSnapshotError({ label, path });
		}
	} finally {
		await fileHandle.close();
	}

	let pathStatsAfterRead: BigIntStats;
	try {
		pathStatsAfterRead = await lstat(path, { bigint: true });
	} catch (error) {
		if (isMissingPathError({ error })) {
			throw changedDuringSnapshotError({ label, path });
		}
		throw error;
	}
	const canonicalPathAfterRead = await requireCanonicalPath({ label, path });
	if (
		pathStatsAfterRead.isSymbolicLink() ||
		canonicalPathAfterRead !== canonicalPath ||
		!isSameFileIdentity({ left: openedStats, right: pathStatsAfterRead }) ||
		BigInt(bytes.length) !== openedStats.size
	) {
		throw changedDuringSnapshotError({ label, path });
	}
	return {
		bytes,
		evidence: {
			bytes: bytes.length,
			path,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		},
	};
}

async function inspectCaptureLocation({
	capturesDirectory,
	path,
}: {
	capturesDirectory: string;
	path: string;
}): Promise<CaptureLocation> {
	if (!isAbsolute(capturesDirectory) || !isAbsolute(path)) {
		throw new Error(
			"Visual capture paths and their allowed directory must be absolute."
		);
	}
	const resolvedCapturesDirectory = resolve(capturesDirectory);
	const resolvedPath = resolve(path);
	const captureRelativePath = relative(resolvedCapturesDirectory, resolvedPath);
	if (
		captureRelativePath.length === 0 ||
		captureRelativePath === ".." ||
		captureRelativePath.startsWith(`..${sep}`) ||
		isAbsolute(captureRelativePath)
	) {
		throw new Error(
			`Visual capture is outside its allowed captures directory: ${path}`
		);
	}

	let capturesDirectoryStats: BigIntStats;
	try {
		capturesDirectoryStats = await lstat(resolvedCapturesDirectory, {
			bigint: true,
		});
	} catch (error) {
		if (isMissingPathError({ error })) {
			return {
				canonicalCapturesDirectory: null,
				canonicalParentDirectory: null,
				path: resolvedPath,
			};
		}
		throw error;
	}
	if (
		capturesDirectoryStats.isSymbolicLink() ||
		!capturesDirectoryStats.isDirectory()
	) {
		throw new Error(
			`Visual captures directory must be a non-symlink directory: ${capturesDirectory}`
		);
	}
	const canonicalCapturesDirectory = await realpath(resolvedCapturesDirectory);
	const parentDirectory = dirname(resolvedPath);
	let canonicalParentDirectory: string;
	try {
		canonicalParentDirectory = await realpath(parentDirectory);
	} catch (error) {
		if (isMissingPathError({ error })) {
			return {
				canonicalCapturesDirectory,
				canonicalParentDirectory: null,
				path: resolvedPath,
			};
		}
		throw error;
	}
	if (
		!isSameOrDescendantPath({
			candidatePath: canonicalParentDirectory,
			parentPath: canonicalCapturesDirectory,
		}) ||
		relative(resolvedCapturesDirectory, parentDirectory) !==
			relative(canonicalCapturesDirectory, canonicalParentDirectory)
	) {
		throw new Error(
			`Visual capture must not traverse a symbolic link outside or within its allowed captures directory: ${path}`
		);
	}
	return {
		canonicalCapturesDirectory,
		canonicalParentDirectory,
		path: resolvedPath,
	};
}

function assertStableCaptureLocation({
	after,
	before,
}: {
	after: CaptureLocation;
	before: CaptureLocation;
}): void {
	if (
		after.path !== before.path ||
		after.canonicalCapturesDirectory !== before.canonicalCapturesDirectory ||
		after.canonicalParentDirectory !== before.canonicalParentDirectory
	) {
		throw new Error(
			`Visual capture location changed while its file-integrity snapshot was read: ${before.path}`
		);
	}
}

export async function readVisualFileSnapshot({
	path,
	testingHooks,
}: {
	path: string;
	testingHooks?: VisualFileSnapshotTestingHooks;
}): Promise<VisualFileSnapshot> {
	const snapshot = await readRegularFileSnapshot({
		allowMissing: false,
		label: "Visual oracle file",
		path,
		testingHooks,
	});
	if (!snapshot) throw new Error(`Visual oracle file is required: ${path}`);
	return snapshot;
}

export async function readVisualJsonFileSnapshot({
	label,
	path,
	testingHooks,
}: {
	label: string;
	path: string;
	testingHooks?: VisualFileSnapshotTestingHooks;
}): Promise<VisualJsonFileSnapshot> {
	const snapshot = await readVisualFileSnapshot({ path, testingHooks });
	let value: unknown;
	try {
		value = JSON.parse(snapshot.bytes.toString("utf8")) as unknown;
	} catch {
		throw new Error(`${label} must contain valid JSON: ${path}`);
	}
	return { ...snapshot, value };
}

export async function describeVisualFile({
	path,
	testingHooks,
}: {
	path: string;
	testingHooks?: VisualFileSnapshotTestingHooks;
}): Promise<VisualFileEvidence> {
	return (await readVisualFileSnapshot({ path, testingHooks })).evidence;
}

export async function describeVisualCapture({
	capturesDirectory,
	path,
	testingHooks,
}: {
	capturesDirectory: string;
	path: string;
	testingHooks?: VisualFileSnapshotTestingHooks;
}): Promise<VisualCaptureEvidence> {
	const locationBeforeRead = await inspectCaptureLocation({
		capturesDirectory,
		path,
	});
	const snapshot = await readRegularFileSnapshot({
		allowMissing: true,
		label: "Visual capture",
		path: locationBeforeRead.path,
		testingHooks,
	});
	if (!snapshot) return { exists: false, path: locationBeforeRead.path };
	const locationAfterRead = await inspectCaptureLocation({
		capturesDirectory,
		path: locationBeforeRead.path,
	});
	assertStableCaptureLocation({
		after: locationAfterRead,
		before: locationBeforeRead,
	});
	return { exists: true, ...snapshot.evidence };
}

export async function describeStagedVisualFile({
	layout,
	stagingPath,
}: {
	layout: VisualOutputLayout;
	stagingPath: string;
}): Promise<StagedVisualFile> {
	const evidence = await describeVisualFile({ path: stagingPath });
	return {
		evidence: {
			...evidence,
			path: relocateVisualPath({ layout, path: stagingPath }),
		},
		stagingPath,
	};
}

export async function createVisualOutputLayout({
	runDirectory,
}: {
	runDirectory: string;
}): Promise<VisualOutputLayout> {
	const finalDirectory = join(runDirectory, "visual-oracle");
	try {
		await lstat(finalDirectory);
	} catch (error: unknown) {
		if (getErrorCode({ error }) !== "ENOENT") throw error;
		const stagingDirectory = await mkdtemp(
			join(runDirectory, ".visual-oracle-staging-")
		);
		return { finalDirectory, stagingDirectory };
	}
	throw new Error(
		`Visual oracle output already exists and will not be overwritten: ${finalDirectory}`
	);
}

export function relocateVisualPath({
	layout,
	path,
}: {
	layout: VisualOutputLayout;
	path: string;
}): string {
	const relativePath = relative(layout.stagingDirectory, path);
	if (
		relativePath.length === 0 ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		throw new Error(`Visual output is outside its staging directory: ${path}`);
	}
	return join(layout.finalDirectory, relativePath);
}

export async function publishVisualOutput({
	layout,
}: {
	layout: VisualOutputLayout;
}): Promise<void> {
	try {
		await rename(layout.stagingDirectory, layout.finalDirectory);
	} catch (error: unknown) {
		const code = getErrorCode({ error });
		if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(code ?? "")) {
			throw new Error(
				`Visual oracle output appeared during generation and was not overwritten: ${layout.finalDirectory}`
			);
		}
		throw error;
	}
}

export async function removeVisualStaging({
	layout,
}: {
	layout: VisualOutputLayout;
}): Promise<void> {
	await rm(layout.stagingDirectory, { force: true, recursive: true });
}
