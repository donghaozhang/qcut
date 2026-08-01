import { createHash } from "node:crypto";
import { constants as fileSystemConstants, type BigIntStats } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const CAPCUT_E2E_SENTINEL_FILE_NAME =
	".qcut-capcut-e2e-disposable-store.json";
export const CAPCUT_E2E_SENTINEL_SCHEMA = "qcut.capcut-e2e.disposable-store";
export const CAPCUT_E2E_SENTINEL_VERSION = 1;
export const CAPCUT_E2E_SENTINEL_PURPOSE =
	"qcut-capcut-e2e-only-do-not-use-for-personal-drafts";

const DEFAULT_FORBIDDEN_HOME_DIRECTORY = "/Users/peter";
const ROOT_META_INFO_FILE_NAME = "root_meta_info.json";
const MAXIMUM_CONTROL_FILE_BYTES = 1024 * 1024;
const STORE_PATH_SEGMENTS = [
	"Movies",
	"CapCut",
	"User Data",
	"Projects",
	"com.lveditor.draft",
] as const;

export interface DisposableCapCutStoreSentinel {
	canonicalStorePath: string;
	purpose: typeof CAPCUT_E2E_SENTINEL_PURPOSE;
	schema: typeof CAPCUT_E2E_SENTINEL_SCHEMA;
	version: typeof CAPCUT_E2E_SENTINEL_VERSION;
}

export interface DisposableCapCutStorePreflightReport {
	canonicalStorePath: string;
	dedicatedTestHomePath: string;
	draftCount: number;
	draftIds: string[];
	rootMetaInfo: {
		bytes: number;
		device: string;
		inode: string;
		modifiedAtMilliseconds: number;
		path: string;
		sha256: string;
	};
	sentinel: DisposableCapCutStoreSentinel;
}

interface RegularFileSnapshot {
	bytes: Buffer;
	identity: {
		device: bigint;
		inode: bigint;
		modifiedAtNanoseconds: bigint;
		size: bigint;
	};
	modifiedAtMilliseconds: number;
}

interface ParsedRootMetaInfo {
	draftCount: number;
	draftIds: string[];
}

function isMissingPathError({ error }: { error: unknown }): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isSameOrDescendantPath({
	ancestorPath,
	candidatePath,
}: {
	ancestorPath: string;
	candidatePath: string;
}): boolean {
	const relativePath = relative(ancestorPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

function isForbiddenHomePath({
	candidatePath,
	forbiddenHomePaths,
}: {
	candidatePath: string;
	forbiddenHomePaths: readonly string[];
}): boolean {
	return forbiddenHomePaths.some((forbiddenHomePath) =>
		isSameOrDescendantPath({
			ancestorPath: forbiddenHomePath,
			candidatePath,
		})
	);
}

async function requirePathStats({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<BigIntStats> {
	try {
		return await lstat(path, { bigint: true });
	} catch (error) {
		if (isMissingPathError({ error })) {
			throw new Error(`${label} is required.`);
		}
		throw error;
	}
}

async function requireCanonicalDirectory({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<{ canonicalPath: string; stats: BigIntStats }> {
	const stats = await requirePathStats({ label, path });
	if (stats.isSymbolicLink()) {
		throw new Error(`${label} must not be a symbolic link.`);
	}
	if (!stats.isDirectory()) {
		throw new Error(`${label} must be a directory.`);
	}
	return {
		canonicalPath: await realpath(path),
		stats,
	};
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
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

async function readRegularFileSnapshot({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<RegularFileSnapshot> {
	const pathStatsBeforeOpen = await requirePathStats({ label, path });
	if (pathStatsBeforeOpen.isSymbolicLink()) {
		throw new Error(`${label} must not be a symbolic link.`);
	}
	if (!pathStatsBeforeOpen.isFile()) {
		throw new Error(`${label} must be a regular file.`);
	}

	const noFollowFlag =
		typeof fileSystemConstants.O_NOFOLLOW === "number"
			? fileSystemConstants.O_NOFOLLOW
			: 0;
	const fileHandle = await open(
		path,
		fileSystemConstants.O_RDONLY | noFollowFlag
	);
	let openedStats: BigIntStats;
	let bytes: Buffer;
	try {
		openedStats = await fileHandle.stat({ bigint: true });
		if (!openedStats.isFile()) {
			throw new Error(`${label} must be a regular file.`);
		}
		if (openedStats.size > BigInt(MAXIMUM_CONTROL_FILE_BYTES)) {
			throw new Error(`${label} exceeds ${MAXIMUM_CONTROL_FILE_BYTES} bytes.`);
		}
		if (
			!isSameFileIdentity({ left: pathStatsBeforeOpen, right: openedStats })
		) {
			throw new Error(`${label} changed during preflight.`);
		}
		bytes = await fileHandle.readFile();
		const statsAfterRead = await fileHandle.stat({ bigint: true });
		if (!isSameFileIdentity({ left: openedStats, right: statsAfterRead })) {
			throw new Error(`${label} changed during preflight.`);
		}
	} finally {
		await fileHandle.close();
	}

	const pathStatsAfterRead = await requirePathStats({ label, path });
	if (
		pathStatsAfterRead.isSymbolicLink() ||
		!isSameFileIdentity({ left: openedStats, right: pathStatsAfterRead })
	) {
		throw new Error(`${label} changed during preflight.`);
	}
	if (BigInt(bytes.length) !== openedStats.size) {
		throw new Error(`${label} changed during preflight.`);
	}

	return {
		bytes,
		identity: {
			device: openedStats.dev,
			inode: openedStats.ino,
			modifiedAtNanoseconds: openedStats.mtimeNs,
			size: openedStats.size,
		},
		modifiedAtMilliseconds: Number(openedStats.mtimeNs) / 1_000_000,
	};
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return value as Record<string, unknown>;
}

function parseJsonRecord({
	bytes,
	label,
}: {
	bytes: Buffer;
	label: string;
}): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error(`${label} must contain valid JSON.`);
	}
	return requireRecord({ label, value: parsed });
}

function assertExactKeys({
	expectedKeys,
	label,
	value,
}: {
	expectedKeys: string[];
	label: string;
	value: Record<string, unknown>;
}): void {
	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	if (
		actualKeys.length !== sortedExpectedKeys.length ||
		actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
	) {
		throw new Error(
			`${label} must contain exactly: ${sortedExpectedKeys.join(", ")}.`
		);
	}
}

function parseSentinel({
	canonicalStorePath,
	snapshot,
}: {
	canonicalStorePath: string;
	snapshot: RegularFileSnapshot;
}): DisposableCapCutStoreSentinel {
	const label = "CapCut E2E disposable-store sentinel";
	const value = parseJsonRecord({ bytes: snapshot.bytes, label });
	assertExactKeys({
		expectedKeys: ["canonicalStorePath", "purpose", "schema", "version"],
		label,
		value,
	});
	if (value.schema !== CAPCUT_E2E_SENTINEL_SCHEMA) {
		throw new Error(`${label} has an unsupported schema.`);
	}
	if (value.version !== CAPCUT_E2E_SENTINEL_VERSION) {
		throw new Error(`${label} has an unsupported version.`);
	}
	if (value.purpose !== CAPCUT_E2E_SENTINEL_PURPOSE) {
		throw new Error(`${label} has an invalid purpose.`);
	}
	if (value.canonicalStorePath !== canonicalStorePath) {
		throw new Error(
			`${label} canonicalStorePath does not match the current store.`
		);
	}
	return {
		canonicalStorePath,
		purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
		schema: CAPCUT_E2E_SENTINEL_SCHEMA,
		version: CAPCUT_E2E_SENTINEL_VERSION,
	};
}

function requireDraftId({
	entry,
	index,
}: {
	entry: unknown;
	index: number;
}): string {
	const record = requireRecord({
		label: `root_meta_info.json draft entry ${index}`,
		value: entry,
	});
	if (typeof record.draft_id !== "string" || record.draft_id.length === 0) {
		throw new Error(
			`root_meta_info.json draft entry ${index} must have a draft_id.`
		);
	}
	return record.draft_id;
}

function parseRootMetaInfo({
	canonicalStorePath,
	snapshot,
}: {
	canonicalStorePath: string;
	snapshot: RegularFileSnapshot;
}): ParsedRootMetaInfo {
	const value = parseJsonRecord({
		bytes: snapshot.bytes,
		label: ROOT_META_INFO_FILE_NAME,
	});
	if (value.root_path !== canonicalStorePath) {
		throw new Error(
			"root_meta_info.json root_path must match the canonical store path."
		);
	}
	if (!Array.isArray(value.all_draft_store)) {
		throw new Error("root_meta_info.json all_draft_store must be an array.");
	}
	if (
		typeof value.draft_ids !== "number" ||
		!Number.isSafeInteger(value.draft_ids) ||
		value.draft_ids < 0
	) {
		throw new Error(
			"root_meta_info.json draft_ids must be a non-negative safe integer."
		);
	}
	const draftIds = value.all_draft_store.map((entry, index) =>
		requireDraftId({ entry, index })
	);
	if (value.draft_ids !== draftIds.length) {
		throw new Error(
			"root_meta_info.json draft_ids must match all_draft_store length."
		);
	}
	if (new Set(draftIds).size !== draftIds.length) {
		throw new Error("root_meta_info.json contains duplicate draft IDs.");
	}
	return {
		draftCount: draftIds.length,
		draftIds,
	};
}

function assertExpectedStoreEntries({ entries }: { entries: string[] }): void {
	const expectedEntries = [
		CAPCUT_E2E_SENTINEL_FILE_NAME,
		ROOT_META_INFO_FILE_NAME,
	].sort();
	const sortedEntries = [...entries].sort();
	if (
		sortedEntries.length !== expectedEntries.length ||
		sortedEntries.some((entry, index) => entry !== expectedEntries[index])
	) {
		throw new Error(
			"Disposable CapCut store must contain only its sentinel and root_meta_info.json."
		);
	}
}

function assertDirectoryIdentityUnchanged({
	after,
	before,
	label,
}: {
	after: BigIntStats;
	before: BigIntStats;
	label: string;
}): void {
	if (
		after.isSymbolicLink() ||
		!after.isDirectory() ||
		after.dev !== before.dev ||
		after.ino !== before.ino
	) {
		throw new Error(`${label} changed during preflight.`);
	}
}

export async function preflightDisposableCapCutStore({
	dedicatedTestHomeDirectory,
	forbiddenHomeDirectory = DEFAULT_FORBIDDEN_HOME_DIRECTORY,
}: {
	dedicatedTestHomeDirectory: string;
	forbiddenHomeDirectory?: string;
}): Promise<DisposableCapCutStorePreflightReport> {
	if (!isAbsolute(dedicatedTestHomeDirectory)) {
		throw new Error("Dedicated CapCut E2E home must be an absolute path.");
	}
	const requestedHomePath = resolve(dedicatedTestHomeDirectory);
	const forbiddenHomePaths = [
		resolve(DEFAULT_FORBIDDEN_HOME_DIRECTORY),
		resolve(forbiddenHomeDirectory),
	];
	if (
		isForbiddenHomePath({
			candidatePath: requestedHomePath,
			forbiddenHomePaths,
		})
	) {
		throw new Error(
			"Dedicated CapCut E2E home must not be Peter's real home directory or any descendant."
		);
	}

	const home = await requireCanonicalDirectory({
		label: "Dedicated CapCut E2E home",
		path: requestedHomePath,
	});
	if (
		isForbiddenHomePath({
			candidatePath: home.canonicalPath,
			forbiddenHomePaths,
		})
	) {
		throw new Error(
			"Dedicated CapCut E2E home must not resolve to Peter's real home directory or any descendant."
		);
	}

	const expectedStorePath = join(home.canonicalPath, ...STORE_PATH_SEGMENTS);
	const store = await requireCanonicalDirectory({
		label: "Disposable CapCut store",
		path: expectedStorePath,
	});
	if (store.canonicalPath !== expectedStorePath) {
		throw new Error(
			"Disposable CapCut store must not traverse symbolic links."
		);
	}

	const entriesBeforeRead = await readdir(store.canonicalPath);
	const rootMetaInfoPath = join(store.canonicalPath, ROOT_META_INFO_FILE_NAME);
	const sentinelPath = join(store.canonicalPath, CAPCUT_E2E_SENTINEL_FILE_NAME);
	const [rootMetaInfoSnapshot, sentinelSnapshot] = await Promise.all([
		readRegularFileSnapshot({
			label: ROOT_META_INFO_FILE_NAME,
			path: rootMetaInfoPath,
		}),
		readRegularFileSnapshot({
			label: "CapCut E2E disposable-store sentinel",
			path: sentinelPath,
		}),
	]);
	const sentinel = parseSentinel({
		canonicalStorePath: store.canonicalPath,
		snapshot: sentinelSnapshot,
	});
	const rootMetaInfo = parseRootMetaInfo({
		canonicalStorePath: store.canonicalPath,
		snapshot: rootMetaInfoSnapshot,
	});
	if (rootMetaInfo.draftCount !== 0) {
		throw new Error(
			`Disposable CapCut store must be empty; found ${rootMetaInfo.draftCount} draft(s): ${rootMetaInfo.draftIds.join(", ")}.`
		);
	}
	assertExpectedStoreEntries({ entries: entriesBeforeRead });

	const [entriesAfterRead, homeStatsAfterRead, storeStatsAfterRead] =
		await Promise.all([
			readdir(store.canonicalPath),
			lstat(home.canonicalPath, { bigint: true }),
			lstat(store.canonicalPath, { bigint: true }),
		]);
	assertExpectedStoreEntries({ entries: entriesAfterRead });
	assertDirectoryIdentityUnchanged({
		after: homeStatsAfterRead,
		before: home.stats,
		label: "Dedicated CapCut E2E home",
	});
	assertDirectoryIdentityUnchanged({
		after: storeStatsAfterRead,
		before: store.stats,
		label: "Disposable CapCut store",
	});

	return {
		canonicalStorePath: store.canonicalPath,
		dedicatedTestHomePath: home.canonicalPath,
		draftCount: rootMetaInfo.draftCount,
		draftIds: rootMetaInfo.draftIds,
		rootMetaInfo: {
			bytes: Number(rootMetaInfoSnapshot.identity.size),
			device: rootMetaInfoSnapshot.identity.device.toString(),
			inode: rootMetaInfoSnapshot.identity.inode.toString(),
			modifiedAtMilliseconds: rootMetaInfoSnapshot.modifiedAtMilliseconds,
			path: rootMetaInfoPath,
			sha256: createHash("sha256")
				.update(rootMetaInfoSnapshot.bytes)
				.digest("hex"),
		},
		sentinel,
	};
}
