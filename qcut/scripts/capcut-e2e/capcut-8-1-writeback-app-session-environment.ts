import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
	CAPCUT_E2E_SENTINEL_FILE_NAME,
	CAPCUT_E2E_SENTINEL_PURPOSE,
	CAPCUT_E2E_SENTINEL_SCHEMA,
	CAPCUT_E2E_SENTINEL_VERSION,
} from "./disposable-store-guard.js";
import {
	assertExactKeys,
	parseJsonRecord,
	readRegularFileSnapshot,
	requireRecord,
} from "./disposable-store-control-file.js";

const FORBIDDEN_REAL_HOME = "/Users/peter";
const ROOT_META_INFO_FILE_NAME = "root_meta_info.json";

export type CapCut81WritebackAppUserIdentityReader = () => {
	homeDirectory: string;
	uid: number;
};

function pathIsStrictlyInside({
	candidate,
	parent,
}: {
	candidate: string;
	parent: string;
}): boolean {
	const fromParent = relative(parent, candidate);
	return (
		fromParent !== "" &&
		fromParent !== ".." &&
		!fromParent.startsWith(`..${sep}`) &&
		!isAbsolute(fromParent)
	);
}

export async function assertCapCut81WritebackDedicatedUser({
	dedicatedTestHomeDirectory,
	readUserIdentity,
}: {
	dedicatedTestHomeDirectory: string;
	readUserIdentity: CapCut81WritebackAppUserIdentityReader;
}): Promise<{ canonicalHomeDirectory: string; uid: number }> {
	if (!isAbsolute(dedicatedTestHomeDirectory)) {
		throw new Error("Dedicated CapCut writeback home must be absolute.");
	}
	const requestedHome = resolve(dedicatedTestHomeDirectory);
	const [canonicalHomeDirectory, stats] = await Promise.all([
		realpath(requestedHome),
		lstat(requestedHome, { bigint: true }),
	]);
	const identity = readUserIdentity();
	if (
		canonicalHomeDirectory !== requestedHome ||
		stats.isSymbolicLink() ||
		!stats.isDirectory() ||
		canonicalHomeDirectory === FORBIDDEN_REAL_HOME ||
		pathIsStrictlyInside({
			candidate: canonicalHomeDirectory,
			parent: FORBIDDEN_REAL_HOME,
		}) ||
		resolve(identity.homeDirectory) !== canonicalHomeDirectory ||
		Number(stats.uid) !== identity.uid ||
		process.getuid?.() !== identity.uid
	) {
		throw new Error(
			"CapCut writeback app capture requires the active dedicated macOS test account."
		);
	}
	return { canonicalHomeDirectory, uid: identity.uid };
}

export function getCapCut81WritebackStoreDirectory({
	homeDirectory,
}: {
	homeDirectory: string;
}): string {
	return join(
		homeDirectory,
		"Movies",
		"CapCut",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
}

export async function assertCapCut81WritebackStoreRegistration({
	draftDirectory,
	homeDirectory,
}: {
	draftDirectory: string;
	homeDirectory: string;
}): Promise<void> {
	const storeDirectory = getCapCut81WritebackStoreDirectory({ homeDirectory });
	const [canonicalStore, sentinelSnapshot, rootSnapshot] = await Promise.all([
		realpath(storeDirectory),
		readRegularFileSnapshot({
			label: "CapCut disposable-store sentinel",
			path: join(storeDirectory, CAPCUT_E2E_SENTINEL_FILE_NAME),
		}),
		readRegularFileSnapshot({
			label: ROOT_META_INFO_FILE_NAME,
			path: join(storeDirectory, ROOT_META_INFO_FILE_NAME),
		}),
	]);
	if (canonicalStore !== storeDirectory) {
		throw new Error("CapCut disposable store must be canonical.");
	}
	const sentinel = parseJsonRecord({
		bytes: sentinelSnapshot.bytes,
		label: "CapCut disposable-store sentinel",
	});
	assertExactKeys({
		expectedKeys: ["canonicalStorePath", "purpose", "schema", "version"],
		label: "CapCut disposable-store sentinel",
		value: sentinel,
	});
	if (
		sentinel.canonicalStorePath !== storeDirectory ||
		sentinel.purpose !== CAPCUT_E2E_SENTINEL_PURPOSE ||
		sentinel.schema !== CAPCUT_E2E_SENTINEL_SCHEMA ||
		sentinel.version !== CAPCUT_E2E_SENTINEL_VERSION
	) {
		throw new Error("CapCut disposable-store sentinel is invalid.");
	}
	const root = parseJsonRecord({
		bytes: rootSnapshot.bytes,
		label: ROOT_META_INFO_FILE_NAME,
	});
	if (
		root.root_path !== storeDirectory ||
		!Array.isArray(root.all_draft_store)
	) {
		throw new Error("CapCut root metadata does not bind the disposable store.");
	}
	const matchingEntries = root.all_draft_store.filter((entry) => {
		const record = requireRecord({
			label: "CapCut root metadata draft entry",
			value: entry,
		});
		return (
			record.draft_fold_path === draftDirectory &&
			record.draft_root_path === storeDirectory
		);
	});
	if (matchingEntries.length !== 1) {
		throw new Error(
			"CapCut writeback draft must have exactly one disposable-store registration."
		);
	}
}

export function requireCapCut81WritebackSessionLocation({
	homeDirectory,
	sessionDirectory,
}: {
	homeDirectory: string;
	sessionDirectory: string;
}): string {
	if (!isAbsolute(sessionDirectory)) {
		throw new Error("CapCut writeback app session path must be absolute.");
	}
	const requested = resolve(sessionDirectory);
	if (!pathIsStrictlyInside({ candidate: requested, parent: homeDirectory })) {
		throw new Error(
			"CapCut writeback app session must be inside the dedicated home."
		);
	}
	return requested;
}

export async function assertCapCut81WritebackSessionDirectory({
	homeDirectory,
	sessionDirectory,
}: {
	homeDirectory: string;
	sessionDirectory: string;
}): Promise<string> {
	const requested = requireCapCut81WritebackSessionLocation({
		homeDirectory,
		sessionDirectory,
	});
	const [canonical, stats] = await Promise.all([
		realpath(requested),
		lstat(requested, { bigint: true }),
	]);
	if (
		canonical !== requested ||
		stats.isSymbolicLink() ||
		!stats.isDirectory()
	) {
		throw new Error(
			"CapCut writeback app session must be a canonical directory inside the dedicated home."
		);
	}
	return canonical;
}
