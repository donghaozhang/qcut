import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import type { CapCutGuiBundleCase } from "./gui-regression-contract.js";
import {
	captureCapCutGuiStoreInventory,
	type CapCutGuiStoreInventoryEntry,
	type CapCutGuiStoreSentinelIntegrity,
} from "./gui-regression-store-inventory.js";

export const CAPCUT_GUI_EVIDENCE_MAXIMUM_BYTES = 256 * 1024 * 1024;

export interface CapCutGuiRootFingerprint {
	bytes: number;
	draftCount: number;
	draftIds: readonly string[];
	inode: string;
	modifiedAtMilliseconds: number;
	path: string;
	sha256: string;
	storeInventory: readonly CapCutGuiStoreInventoryEntry[];
	storeInventorySha256: string;
	storePath: string;
	storeSentinelIntegrity: CapCutGuiStoreSentinelIntegrity;
}

export interface CapCutGuiCapturedEvidenceFile {
	bytes: number;
	device: string;
	evidenceStatus: "captured";
	inode: string;
	modifiedAtMilliseconds: number;
	path: string;
	sha256: string;
	visualVerificationStatus: "unverified";
}

function parseRootMetadata({
	bundles,
	bytes,
	canonicalStorePath,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	bytes: Buffer;
	canonicalStorePath: string;
}): {
	draftIds: string[];
} {
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error("Disposable root_meta_info.json must contain valid JSON.");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Disposable root_meta_info.json must contain an object.");
	}
	const root = parsed as Record<string, unknown>;
	if (root.root_path !== canonicalStorePath) {
		throw new Error(
			"Disposable root_meta_info.json root_path must match the canonical store path."
		);
	}
	if (!Array.isArray(root.all_draft_store)) {
		throw new Error(
			"Disposable root_meta_info.json must contain all_draft_store."
		);
	}
	const bundlesByDraftId = new Map(
		bundles.map((bundle) => [bundle.draftId, bundle] as const)
	);
	const draftIds = root.all_draft_store.map((entry, index) => {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			throw new Error(`Root draft entry ${index} must be an object.`);
		}
		const draftId = (entry as Record<string, unknown>).draft_id;
		if (typeof draftId !== "string" || draftId.length === 0) {
			throw new Error(`Root draft entry ${index} must contain draft_id.`);
		}
		const bundle = bundlesByDraftId.get(draftId);
		if (!bundle) {
			throw new Error(`Root draft entry ${index} has an unplanned draft_id.`);
		}
		const expectedDraftPath = join(
			canonicalStorePath,
			bundle.verification.draftFolderName
		);
		const record = entry as Record<string, unknown>;
		if (
			record.draft_fold_path !== expectedDraftPath ||
			record.draft_root_path !== canonicalStorePath
		) {
			throw new Error(
				`Root draft entry ${index} does not map ${draftId} to its planned draft directory.`
			);
		}
		return draftId;
	});
	if (root.draft_ids !== draftIds.length) {
		throw new Error(
			"Disposable root_meta_info.json draft_ids must match its entries."
		);
	}
	if (new Set(draftIds).size !== draftIds.length) {
		throw new Error(
			"Disposable root_meta_info.json contains duplicate draft IDs."
		);
	}
	return { draftIds };
}

export async function captureCapCutGuiRootFingerprint({
	bundles,
	canonicalStorePath,
	expectedStoreSentinelIntegrity,
	ownerUid,
	rootMetaInfoPath,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	canonicalStorePath: string;
	expectedStoreSentinelIntegrity?: CapCutGuiStoreSentinelIntegrity;
	ownerUid: number;
	rootMetaInfoPath: string;
}): Promise<CapCutGuiRootFingerprint> {
	const snapshot = await readRegularFileSnapshot({
		label: "Disposable root_meta_info.json",
		path: rootMetaInfoPath,
	});
	const { bytes, identity } = snapshot;
	const { draftIds } = parseRootMetadata({
		bundles,
		bytes,
		canonicalStorePath,
	});
	const bundlesByDraftId = new Map(
		bundles.map((bundle) => [bundle.draftId, bundle] as const)
	);
	const registeredFolderNames = draftIds.map((draftId) => {
		const bundle = bundlesByDraftId.get(draftId);
		if (!bundle) throw new Error(`Registered draft ${draftId} is not planned.`);
		return bundle.verification.draftFolderName;
	});
	const storeInventory = await captureCapCutGuiStoreInventory({
		canonicalStorePath,
		expectedSentinelIntegrity: expectedStoreSentinelIntegrity,
		ownerUid,
		registeredFolderNames,
		rootMetaInfoFileName: basename(rootMetaInfoPath),
	});
	const rootSnapshotAfterInventory = await readRegularFileSnapshot({
		label: "Disposable root_meta_info.json",
		path: rootMetaInfoPath,
	});
	if (
		!rootSnapshotAfterInventory.bytes.equals(bytes) ||
		rootSnapshotAfterInventory.identity.device !== identity.device ||
		rootSnapshotAfterInventory.identity.inode !== identity.inode ||
		rootSnapshotAfterInventory.identity.modifiedAtNanoseconds !==
			identity.modifiedAtNanoseconds
	) {
		throw new Error(
			"Disposable root_meta_info.json changed while store inventory was captured."
		);
	}
	return {
		bytes: bytes.length,
		draftCount: draftIds.length,
		draftIds,
		inode: identity.inode.toString(),
		modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
		path: rootMetaInfoPath,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		storeInventory: storeInventory.entries,
		storeInventorySha256: storeInventory.sha256,
		storePath: canonicalStorePath,
		storeSentinelIntegrity: storeInventory.sentinelIntegrity,
	};
}

export function assertExpectedDraftIds({
	actualDraftIds,
	expectedDraftIds,
}: {
	actualDraftIds: readonly string[];
	expectedDraftIds: readonly string[];
}): void {
	const actual = [...actualDraftIds].sort();
	const expected = [...expectedDraftIds].sort();
	if (
		actual.length !== expected.length ||
		actual.some((draftId, index) => draftId !== expected[index])
	) {
		throw new Error(
			`Disposable store draft IDs changed unexpectedly; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
		);
	}
}

function rootFingerprintsMatch({
	actual,
	expected,
}: {
	actual: CapCutGuiRootFingerprint;
	expected: CapCutGuiRootFingerprint;
}): boolean {
	return (
		actual.path === expected.path &&
		actual.sha256 === expected.sha256 &&
		actual.bytes === expected.bytes &&
		actual.inode === expected.inode &&
		actual.modifiedAtMilliseconds === expected.modifiedAtMilliseconds &&
		actual.draftCount === expected.draftCount &&
		JSON.stringify(actual.draftIds) === JSON.stringify(expected.draftIds) &&
		actual.storePath === expected.storePath &&
		actual.storeInventorySha256 === expected.storeInventorySha256 &&
		JSON.stringify(actual.storeInventory) ===
			JSON.stringify(expected.storeInventory) &&
		JSON.stringify(actual.storeSentinelIntegrity) ===
			JSON.stringify(expected.storeSentinelIntegrity)
	);
}

export function assertRootFingerprintContinuity({
	actual,
	expected,
}: {
	actual: CapCutGuiRootFingerprint;
	expected: CapCutGuiRootFingerprint;
}): void {
	if (!rootFingerprintsMatch({ actual, expected })) {
		throw new Error(
			"Disposable root_meta_info.json changed between adapter step boundaries; GUI adapter execution is refused."
		);
	}
}

export function assertNoUnexpectedDraftIds({
	actualDraftIds,
	allowedDraftIds,
}: {
	actualDraftIds: readonly string[];
	allowedDraftIds: readonly string[];
}): void {
	const allowed = new Set(allowedDraftIds);
	const unexpected = actualDraftIds.filter((draftId) => !allowed.has(draftId));
	const hasDuplicate = new Set(actualDraftIds).size !== actualDraftIds.length;
	if (unexpected.length > 0 || hasDuplicate) {
		throw new Error(
			`Disposable store contains unexpected or duplicate draft IDs; allowed ${JSON.stringify([...allowed].sort())}, received ${JSON.stringify([...actualDraftIds].sort())}.`
		);
	}
}

export function assertRootFingerprintUnchanged({
	actual,
	expected,
}: {
	actual: CapCutGuiRootFingerprint;
	expected: CapCutGuiRootFingerprint;
}): void {
	if (expected.draftCount !== 0 || expected.draftIds.length !== 0) {
		throw new Error(
			"GUI execution requires an empty preflight root fingerprint."
		);
	}
	if (!rootFingerprintsMatch({ actual, expected })) {
		throw new Error(
			"Disposable root_meta_info.json changed after preflight; GUI adapter execution is refused."
		);
	}
}

export async function writeJsonEvidence({
	path,
	value,
}: {
	path: string;
	value: unknown;
}): Promise<void> {
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
		encoding: "utf8",
		flag: "wx",
		mode: 0o600,
	});
}

export async function createGuiEvidenceDirectory({
	evidenceDirectory,
	ownerUid,
}: {
	evidenceDirectory: string;
	ownerUid: number;
}): Promise<void> {
	const parentPath = resolve(evidenceDirectory, "..");
	const [canonicalParentPath, parentStats] = await Promise.all([
		realpath(parentPath),
		lstat(parentPath, { bigint: true }),
	]);
	if (
		canonicalParentPath !== parentPath ||
		parentStats.isSymbolicLink() ||
		!parentStats.isDirectory()
	) {
		throw new Error(
			"CapCut GUI evidence parent must be a canonical directory."
		);
	}
	if (Number(parentStats.uid) !== ownerUid) {
		throw new Error(
			"CapCut GUI evidence parent must be owned by the isolated process user."
		);
	}
	await mkdir(evidenceDirectory, { mode: 0o700 });
}

export async function requireGuiEvidenceFiles({
	evidencePaths,
	ownerUid,
}: {
	evidencePaths: readonly string[];
	ownerUid: number;
}): Promise<CapCutGuiCapturedEvidenceFile[]> {
	return evidencePaths.reduce<Promise<CapCutGuiCapturedEvidenceFile[]>>(
		async (recordsPromise, evidencePath) => {
			const records = await recordsPromise;
			const snapshot = await readRegularFileSnapshot({
				label: "GUI regression evidence",
				maximumBytes: CAPCUT_GUI_EVIDENCE_MAXIMUM_BYTES,
				path: evidencePath,
			});
			const statsAfterSnapshot = await lstat(evidencePath, { bigint: true });
			if (
				statsAfterSnapshot.isSymbolicLink() ||
				!statsAfterSnapshot.isFile() ||
				Number(statsAfterSnapshot.uid) !== ownerUid ||
				statsAfterSnapshot.dev !== snapshot.identity.device ||
				statsAfterSnapshot.ino !== snapshot.identity.inode ||
				statsAfterSnapshot.mtimeNs !==
					snapshot.identity.modifiedAtNanoseconds ||
				statsAfterSnapshot.size !== snapshot.identity.size
			) {
				throw new Error(
					`GUI regression evidence must remain a regular file owned by UID ${ownerUid}: ${evidencePath}`
				);
			}
			if (snapshot.bytes.length === 0) {
				throw new Error(
					`GUI regression evidence must be non-empty: ${evidencePath}`
				);
			}
			return [
				...records,
				{
					bytes: snapshot.bytes.length,
					device: snapshot.identity.device.toString(),
					evidenceStatus: "captured",
					inode: snapshot.identity.inode.toString(),
					modifiedAtMilliseconds: snapshot.modifiedAtMilliseconds,
					path: evidencePath,
					sha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
					visualVerificationStatus: "unverified",
				},
			];
		},
		Promise.resolve([])
	);
}

export async function assertGuiEvidenceRecordsUnchanged({
	records,
	ownerUid,
}: {
	records: readonly CapCutGuiCapturedEvidenceFile[];
	ownerUid: number;
}): Promise<void> {
	const current = await requireGuiEvidenceFiles({
		evidencePaths: records.map(({ path }) => path),
		ownerUid,
	});
	if (JSON.stringify(current) !== JSON.stringify(records)) {
		throw new Error(
			"GUI regression evidence changed after capture; result persistence is refused."
		);
	}
}

export const capCutGuiRegressionEvidenceTesting = Object.freeze({
	parseRootMetadata,
});
