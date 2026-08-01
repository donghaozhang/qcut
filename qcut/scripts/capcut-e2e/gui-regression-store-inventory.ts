import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join, sep } from "node:path";
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
} from "./disposable-store-control-file.js";

const MAXIMUM_GUI_STORE_INVENTORY_FILE_BYTES = 256 * 1024 * 1024;
const MAXIMUM_GUI_STORE_INVENTORY_TOTAL_BYTES = 512 * 1024 * 1024;
const MAXIMUM_GUI_STORE_INVENTORY_ENTRIES = 10_000;
const MAXIMUM_GUI_STORE_INVENTORY_DEPTH = 64;

interface InventoryBudget {
	entries: number;
	totalFileBytes: bigint;
}

export interface CapCutGuiStoreInventoryEntry {
	bytes: string;
	changedAtMilliseconds: number;
	device: string;
	inode: string;
	modifiedAtMilliseconds: number;
	ownerUid: number;
	relativePath: string;
	sha256: string | null;
	type: "directory" | "file";
}

export interface CapCutGuiStoreSentinelIntegrity {
	bytes: number;
	device: string;
	inode: string;
	modifiedAtMilliseconds: number;
	path: string;
	sha256: string;
}

function requireInventoryEntryType({
	isDirectory,
	isFile,
	relativePath,
}: {
	isDirectory: boolean;
	isFile: boolean;
	relativePath: string;
}): "directory" | "file" {
	if (isDirectory) return "directory";
	if (isFile) return "file";
	throw new Error(
		`Disposable store inventory supports only files and directories: ${relativePath}`
	);
}

async function captureInventoryNode({
	absolutePath,
	budget,
	depth,
	ownerUid,
	relativePath,
}: {
	absolutePath: string;
	budget: InventoryBudget;
	depth: number;
	ownerUid: number;
	relativePath: string;
}): Promise<CapCutGuiStoreInventoryEntry[]> {
	if (depth > MAXIMUM_GUI_STORE_INVENTORY_DEPTH) {
		throw new Error(
			`Disposable store inventory exceeds maximum depth ${MAXIMUM_GUI_STORE_INVENTORY_DEPTH}.`
		);
	}
	budget.entries += 1;
	if (budget.entries > MAXIMUM_GUI_STORE_INVENTORY_ENTRIES) {
		throw new Error(
			`Disposable store inventory exceeds ${MAXIMUM_GUI_STORE_INVENTORY_ENTRIES} entries.`
		);
	}
	const before = await lstat(absolutePath, { bigint: true });
	if (before.isSymbolicLink()) {
		throw new Error(
			`Disposable store inventory must not contain symlinks: ${relativePath}`
		);
	}
	if (Number(before.uid) !== ownerUid) {
		throw new Error(
			`Disposable store inventory must be owned by process UID ${ownerUid}: ${relativePath}`
		);
	}
	const type = requireInventoryEntryType({
		isDirectory: before.isDirectory(),
		isFile: before.isFile(),
		relativePath,
	});
	if (type === "file") {
		budget.totalFileBytes += before.size;
		if (
			budget.totalFileBytes > BigInt(MAXIMUM_GUI_STORE_INVENTORY_TOTAL_BYTES)
		) {
			throw new Error(
				`Disposable store inventory exceeds ${MAXIMUM_GUI_STORE_INVENTORY_TOTAL_BYTES} total file bytes.`
			);
		}
		const snapshot = await readRegularFileSnapshot({
			label: `Disposable store inventory file ${relativePath}`,
			maximumBytes: MAXIMUM_GUI_STORE_INVENTORY_FILE_BYTES,
			path: absolutePath,
		});
		if (
			snapshot.identity.device !== before.dev ||
			snapshot.identity.inode !== before.ino ||
			snapshot.identity.modifiedAtNanoseconds !== before.mtimeNs ||
			snapshot.identity.size !== before.size
		) {
			throw new Error(
				`Disposable store inventory file changed before snapshot: ${relativePath}`
			);
		}
		return [
			{
				bytes: snapshot.identity.size.toString(),
				changedAtMilliseconds: Number(before.ctimeNs) / 1_000_000,
				device: snapshot.identity.device.toString(),
				inode: snapshot.identity.inode.toString(),
				modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
				ownerUid,
				relativePath,
				sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
				type,
			},
		];
	}

	const directoryEntry: CapCutGuiStoreInventoryEntry = {
		bytes: before.size.toString(),
		changedAtMilliseconds: Number(before.ctimeNs) / 1_000_000,
		device: before.dev.toString(),
		inode: before.ino.toString(),
		modifiedAtMilliseconds: Number(before.mtimeNs) / 1_000_000,
		ownerUid,
		relativePath,
		sha256: null,
		type,
	};
	const namesBefore = (await readdir(absolutePath)).sort();
	const nestedEntries = await namesBefore.reduce<
		Promise<CapCutGuiStoreInventoryEntry[]>
	>(async (entriesPromise, name) => {
		const entries = await entriesPromise;
		const childEntries = await captureInventoryNode({
			absolutePath: join(absolutePath, name),
			budget,
			depth: depth + 1,
			ownerUid,
			relativePath: relativePath === "." ? name : join(relativePath, name),
		});
		return [...entries, ...childEntries];
	}, Promise.resolve([]));
	const [after, namesAfter] = await Promise.all([
		lstat(absolutePath, { bigint: true }),
		readdir(absolutePath).then((names) => names.sort()),
	]);
	if (
		after.isSymbolicLink() ||
		!after.isDirectory() ||
		after.dev !== before.dev ||
		after.ino !== before.ino ||
		after.mtimeNs !== before.mtimeNs ||
		JSON.stringify(namesAfter) !== JSON.stringify(namesBefore)
	) {
		throw new Error(
			`Disposable store inventory changed while it was captured: ${relativePath}`
		);
	}
	return [directoryEntry, ...nestedEntries];
}

function assertStoreTopLevelInventory({
	canonicalStorePath,
	inventory,
	registeredFolderNames,
	rootMetaInfoFileName,
}: {
	canonicalStorePath: string;
	inventory: readonly CapCutGuiStoreInventoryEntry[];
	registeredFolderNames: readonly string[];
	rootMetaInfoFileName: string;
}): void {
	const expectedTopLevelPaths = [
		CAPCUT_E2E_SENTINEL_FILE_NAME,
		rootMetaInfoFileName,
		...registeredFolderNames,
	].sort();
	const actualTopLevelPaths = inventory
		.filter(
			({ relativePath }) => relativePath !== "." && !relativePath.includes(sep)
		)
		.map(({ relativePath }) => relativePath)
		.sort();
	if (
		JSON.stringify(actualTopLevelPaths) !==
		JSON.stringify(expectedTopLevelPaths)
	) {
		throw new Error(
			`Disposable store contains an orphan or missing top-level entry; expected ${JSON.stringify(expectedTopLevelPaths)}, received ${JSON.stringify(actualTopLevelPaths)}.`
		);
	}
	for (const folderName of registeredFolderNames) {
		const directory = inventory.find(
			({ relativePath }) => relativePath === folderName
		);
		const hasContent = inventory.some(({ relativePath }) =>
			relativePath.startsWith(`${folderName}${sep}`)
		);
		if (directory?.type !== "directory" || !hasContent) {
			throw new Error(
				`Registered draft directory must be a non-empty canonical directory: ${join(canonicalStorePath, folderName)}`
			);
		}
	}
}

async function inspectStoreSentinel({
	canonicalStorePath,
}: {
	canonicalStorePath: string;
}): Promise<CapCutGuiStoreSentinelIntegrity> {
	const path = join(canonicalStorePath, CAPCUT_E2E_SENTINEL_FILE_NAME);
	const snapshot = await readRegularFileSnapshot({
		label: "CapCut E2E disposable-store sentinel",
		path,
	});
	const value = parseJsonRecord({
		bytes: snapshot.bytes,
		label: "CapCut E2E disposable-store sentinel",
	});
	assertExactKeys({
		expectedKeys: ["canonicalStorePath", "purpose", "schema", "version"],
		label: "CapCut E2E disposable-store sentinel",
		value,
	});
	if (
		value.canonicalStorePath !== canonicalStorePath ||
		value.purpose !== CAPCUT_E2E_SENTINEL_PURPOSE ||
		value.schema !== CAPCUT_E2E_SENTINEL_SCHEMA ||
		value.version !== CAPCUT_E2E_SENTINEL_VERSION
	) {
		throw new Error(
			"CapCut E2E disposable-store sentinel no longer matches the isolated store."
		);
	}
	return {
		bytes: snapshot.bytes.length,
		device: snapshot.identity.device.toString(),
		inode: snapshot.identity.inode.toString(),
		modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
		path,
		sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
	};
}

function assertStoreSentinelUnchanged({
	actual,
	expected,
}: {
	actual: CapCutGuiStoreSentinelIntegrity;
	expected: CapCutGuiStoreSentinelIntegrity;
}): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			"CapCut E2E disposable-store sentinel changed after preflight; GUI adapter execution is refused."
		);
	}
}

export async function captureCapCutGuiStoreInventory({
	canonicalStorePath,
	expectedSentinelIntegrity,
	ownerUid,
	registeredFolderNames,
	rootMetaInfoFileName,
}: {
	canonicalStorePath: string;
	expectedSentinelIntegrity?: CapCutGuiStoreSentinelIntegrity;
	ownerUid: number;
	registeredFolderNames: readonly string[];
	rootMetaInfoFileName: string;
}): Promise<{
	entries: CapCutGuiStoreInventoryEntry[];
	sentinelIntegrity: CapCutGuiStoreSentinelIntegrity;
	sha256: string;
}> {
	const sentinelBefore = await inspectStoreSentinel({ canonicalStorePath });
	if (expectedSentinelIntegrity) {
		assertStoreSentinelUnchanged({
			actual: sentinelBefore,
			expected: expectedSentinelIntegrity,
		});
	}
	const entries = await captureInventoryNode({
		absolutePath: canonicalStorePath,
		budget: { entries: 0, totalFileBytes: 0n },
		depth: 0,
		ownerUid,
		relativePath: ".",
	});
	assertStoreTopLevelInventory({
		canonicalStorePath,
		inventory: entries,
		registeredFolderNames,
		rootMetaInfoFileName,
	});
	const sentinelAfter = await inspectStoreSentinel({ canonicalStorePath });
	assertStoreSentinelUnchanged({
		actual: sentinelAfter,
		expected: sentinelBefore,
	});
	const sentinelEntry = entries.find(
		({ relativePath }) => relativePath === CAPCUT_E2E_SENTINEL_FILE_NAME
	);
	if (
		sentinelEntry?.type !== "file" ||
		sentinelEntry.bytes !== String(sentinelAfter.bytes) ||
		sentinelEntry.device !== sentinelAfter.device ||
		sentinelEntry.inode !== sentinelAfter.inode ||
		sentinelEntry.modifiedAtMilliseconds !==
			sentinelAfter.modifiedAtMilliseconds ||
		sentinelEntry.sha256 !== sentinelAfter.sha256
	) {
		throw new Error(
			"Disposable-store sentinel inventory identity is inconsistent."
		);
	}
	return {
		entries,
		sentinelIntegrity: sentinelAfter,
		sha256: createHash("sha256")
			.update(JSON.stringify(entries), "utf8")
			.digest("hex"),
	};
}
