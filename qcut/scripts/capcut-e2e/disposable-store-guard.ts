import { createHash } from "node:crypto";
import type { BigIntStats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	assertExactKeys,
	parseJsonRecord,
	readRegularFileSnapshot,
	type RegularFileSnapshot,
	requirePathStats,
	requireRecord,
} from "./disposable-store-control-file.js";

export const CAPCUT_E2E_SENTINEL_FILE_NAME =
	".qcut-capcut-e2e-disposable-store.json";
export const CAPCUT_E2E_SENTINEL_SCHEMA = "qcut.capcut-e2e.disposable-store";
export const CAPCUT_E2E_SENTINEL_VERSION = 1;
export const CAPCUT_E2E_SENTINEL_PURPOSE =
	"qcut-capcut-e2e-only-do-not-use-for-personal-drafts";

const DEFAULT_FORBIDDEN_HOME_DIRECTORY = "/Users/peter";
const ROOT_META_INFO_FILE_NAME = "root_meta_info.json";
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

interface ParsedRootMetaInfo {
	draftCount: number;
	draftIds: string[];
}

function isSameOrDescendantPath({
	ancestorPath,
	candidatePath,
}: {
	ancestorPath: string;
	candidatePath: string;
}): boolean {
	const isCaseInsensitivePlatform =
		process.platform === "darwin" || process.platform === "win32";
	const comparableAncestorPath = isCaseInsensitivePlatform
		? ancestorPath.toLowerCase()
		: ancestorPath;
	const comparableCandidatePath = isCaseInsensitivePlatform
		? candidatePath.toLowerCase()
		: candidatePath;
	const relativePath = relative(
		comparableAncestorPath,
		comparableCandidatePath
	);
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
