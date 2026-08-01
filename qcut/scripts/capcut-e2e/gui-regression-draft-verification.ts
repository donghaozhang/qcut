import { createHash } from "node:crypto";
import { join, sep } from "node:path";
import { verifyBundleCaseSemantics } from "./bundle-semantic-evidence.js";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import type {
	CapCutGuiAssetIntegrity,
	CapCutGuiBundleCase,
	CapCutGuiDraftFileIntegrity,
	CapCutGuiStepAction,
} from "./gui-regression-contract.js";
import type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";
import type { CapCutGuiStoreInventoryEntry } from "./gui-regression-store-inventory.js";

const MAXIMUM_SEMANTIC_FILE_BYTES = 256 * 1024 * 1024;
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";

export type CapCutGuiDraftVerificationPhase =
	| "final"
	| "installed"
	| "reopened"
	| "saved";

export interface CapCutGuiDraftFileProof extends CapCutGuiDraftFileIntegrity {
	device: string;
	inode: string;
	path: string;
}

export interface CapCutGuiInstalledDraftVerification {
	caseId: CapCutGuiBundleCase["caseId"];
	directoryCount: number;
	draftDirectory: string;
	fileCount: number;
	installedInventorySha256: string;
	phase: "installed";
	sourceInventorySha256: string;
	status: "source-byte-equivalent";
}

export interface CapCutGuiSemanticDraftVerification {
	caseId: CapCutGuiBundleCase["caseId"];
	contentFiles: readonly CapCutGuiDraftFileProof[];
	generatedLutFile?: CapCutGuiDraftFileProof;
	immutableAssetFiles: readonly CapCutGuiDraftFileProof[];
	phase: "final" | "reopened" | "saved";
	semanticEvidence: ReturnType<typeof verifyBundleCaseSemantics>;
	status: "semantic-and-immutable-assets-verified";
}

export type CapCutGuiDraftPhaseVerification =
	| CapCutGuiInstalledDraftVerification
	| CapCutGuiSemanticDraftVerification;

export type CapCutGuiDraftPhaseVerifier = ({
	bundle,
	phase,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	phase: CapCutGuiDraftVerificationPhase;
	rootFingerprint: CapCutGuiRootFingerprint;
}) => Promise<CapCutGuiDraftPhaseVerification>;

interface DraftInventory {
	directories: string[];
	files: CapCutGuiDraftFileIntegrity[];
}

function createInventorySha256({
	inventory,
}: {
	inventory: DraftInventory;
}): string {
	return createHash("sha256")
		.update(JSON.stringify(inventory), "utf8")
		.digest("hex");
}

function getInstalledDraftEntries({
	bundle,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	rootFingerprint: CapCutGuiRootFingerprint;
}): CapCutGuiStoreInventoryEntry[] {
	const folderName = bundle.verification.draftFolderName;
	const nestedPrefix = `${folderName}${sep}`;
	return rootFingerprint.storeInventory.filter(
		({ relativePath }) =>
			relativePath === folderName || relativePath.startsWith(nestedPrefix)
	);
}

function toDraftRelativePath({
	folderName,
	storeRelativePath,
}: {
	folderName: string;
	storeRelativePath: string;
}): string {
	if (storeRelativePath === folderName) return ".";
	return storeRelativePath
		.slice(`${folderName}${sep}`.length)
		.split(sep)
		.join("/");
}

function parseInventoryFileBytes({
	entry,
}: {
	entry: CapCutGuiStoreInventoryEntry;
}): number {
	const bytes = BigInt(entry.bytes);
	if (bytes > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`Installed draft file is too large: ${entry.relativePath}`);
	}
	return Number(bytes);
}

function buildInstalledDraftInventory({
	bundle,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	rootFingerprint: CapCutGuiRootFingerprint;
}): DraftInventory {
	const folderName = bundle.verification.draftFolderName;
	const entries = getInstalledDraftEntries({ bundle, rootFingerprint });
	const directories = entries
		.filter(({ type }) => type === "directory")
		.map(({ relativePath }) =>
			toDraftRelativePath({ folderName, storeRelativePath: relativePath })
		)
		.sort();
	const files = entries
		.filter(
			(entry): entry is CapCutGuiStoreInventoryEntry & { sha256: string } =>
				entry.type === "file" && entry.sha256 !== null
		)
		.map((entry) => ({
			bytes: parseInventoryFileBytes({ entry }),
			relativePath: toDraftRelativePath({
				folderName,
				storeRelativePath: entry.relativePath,
			}),
			sha256: entry.sha256,
		}))
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	return { directories, files };
}

function buildExpectedDraftInventory({
	bundle,
}: {
	bundle: CapCutGuiBundleCase;
}): DraftInventory {
	return {
		directories: [".", ...bundle.verification.draftDirectories].sort(),
		files: [...bundle.verification.draftFiles].sort((left, right) =>
			left.relativePath.localeCompare(right.relativePath)
		),
	};
}

function verifyInstalledDraft({
	bundle,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	rootFingerprint: CapCutGuiRootFingerprint;
}): CapCutGuiInstalledDraftVerification {
	const actual = buildInstalledDraftInventory({ bundle, rootFingerprint });
	const expected = buildExpectedDraftInventory({ bundle });
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${bundle.caseId} installed draft inventory does not exactly match its verified source bundle.`
		);
	}
	const installedInventorySha256 = createInventorySha256({ inventory: actual });
	const sourceInventorySha256 = createInventorySha256({ inventory: expected });
	return {
		caseId: bundle.caseId,
		directoryCount: actual.directories.length,
		draftDirectory: join(
			rootFingerprint.storePath,
			bundle.verification.draftFolderName
		),
		fileCount: actual.files.length,
		installedInventorySha256,
		phase: "installed",
		sourceInventorySha256,
		status: "source-byte-equivalent",
	};
}

function getStoreInventoryFile({
	bundle,
	relativePath,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	relativePath: string;
	rootFingerprint: CapCutGuiRootFingerprint;
}): CapCutGuiStoreInventoryEntry & { sha256: string } {
	const storeRelativePath = join(
		bundle.verification.draftFolderName,
		...relativePath.split("/")
	);
	const entry = rootFingerprint.storeInventory.find(
		(candidate) => candidate.relativePath === storeRelativePath
	);
	if (entry?.type !== "file" || entry.sha256 === null) {
		throw new Error(
			`${bundle.caseId} ${relativePath} is missing from the bound draft inventory.`
		);
	}
	return { ...entry, sha256: entry.sha256 };
}

async function readInventoryBoundDraftFile({
	bundle,
	relativePath,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	relativePath: string;
	rootFingerprint: CapCutGuiRootFingerprint;
}): Promise<{ bytes: Buffer; proof: CapCutGuiDraftFileProof }> {
	const entry = getStoreInventoryFile({
		bundle,
		relativePath,
		rootFingerprint,
	});
	const path = join(
		rootFingerprint.storePath,
		bundle.verification.draftFolderName,
		...relativePath.split("/")
	);
	const snapshot = await readRegularFileSnapshot({
		label: `${bundle.caseId} ${relativePath}`,
		maximumBytes: MAXIMUM_SEMANTIC_FILE_BYTES,
		path,
	});
	const sha256 = createHash("sha256").update(snapshot.bytes).digest("hex");
	if (
		snapshot.identity.device.toString() !== entry.device ||
		snapshot.identity.inode.toString() !== entry.inode ||
		snapshot.identity.size.toString() !== entry.bytes ||
		snapshot.modifiedAtMilliseconds !== entry.modifiedAtMilliseconds ||
		sha256 !== entry.sha256
	) {
		throw new Error(
			`${bundle.caseId} ${relativePath} changed after its draft inventory was captured.`
		);
	}
	return {
		bytes: snapshot.bytes,
		proof: {
			bytes: snapshot.bytes.length,
			device: entry.device,
			inode: entry.inode,
			path,
			relativePath,
			sha256,
		},
	};
}

function getActiveContentRelativePaths({
	bundle,
}: {
	bundle: CapCutGuiBundleCase;
}): string[] {
	const timelineId = bundle.verification.ids.timelineId;
	return [
		"draft_info.json",
		"template-2.tmp",
		`Timelines/${timelineId}/draft_info.json`,
		`Timelines/${timelineId}/template-2.tmp`,
	];
}

function getDraftRelativeAssetPath({
	asset,
	bundle,
}: {
	asset: CapCutGuiAssetIntegrity;
	bundle: CapCutGuiBundleCase;
}): string {
	const draftPrefix = `${DRAFT_STORE_DIRECTORY_NAME}/${bundle.verification.draftFolderName}/`;
	if (!asset.relativePath.startsWith(draftPrefix)) {
		throw new Error(
			`${bundle.caseId} immutable asset is outside its verified draft directory.`
		);
	}
	return asset.relativePath.slice(draftPrefix.length);
}

async function verifyImmutableAssets({
	bundle,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	rootFingerprint: CapCutGuiRootFingerprint;
}): Promise<{
	generatedLutSnapshot?: { bytes: Buffer; proof: CapCutGuiDraftFileProof };
	proofs: CapCutGuiDraftFileProof[];
}> {
	const generatedAssets = bundle.verification.generatedAssets;
	if (
		(bundle.caseId === "lut-mask" && generatedAssets.length !== 1) ||
		(bundle.caseId !== "lut-mask" && generatedAssets.length !== 0)
	) {
		throw new Error(
			`${bundle.caseId} has an unexpected generated immutable asset inventory.`
		);
	}
	const expectedAssets = [
		...bundle.verification.copiedAssets.map((asset) => ({
			asset,
			kind: "copied" as const,
		})),
		...generatedAssets.map((asset) => ({
			asset,
			kind: "generated" as const,
		})),
	];
	const snapshots = await Promise.all(
		expectedAssets.map(async ({ asset, kind }) => {
			const snapshot = await readInventoryBoundDraftFile({
				bundle,
				relativePath: getDraftRelativeAssetPath({ asset, bundle }),
				rootFingerprint,
			});
			if (
				snapshot.proof.bytes !== asset.bytes ||
				snapshot.proof.sha256 !== asset.sha256
			) {
				throw new Error(
					`${bundle.caseId} immutable asset ${snapshot.proof.relativePath} no longer matches its verified bundle hash.`
				);
			}
			return { ...snapshot, kind };
		})
	);
	const generatedLutSnapshot = snapshots.find(
		({ kind }) => kind === "generated"
	);
	return {
		...(generatedLutSnapshot ? { generatedLutSnapshot } : {}),
		proofs: snapshots.map(({ proof }) => proof),
	};
}

async function verifySemanticDraft({
	bundle,
	phase,
	rootFingerprint,
}: {
	bundle: CapCutGuiBundleCase;
	phase: "final" | "reopened" | "saved";
	rootFingerprint: CapCutGuiRootFingerprint;
}): Promise<CapCutGuiSemanticDraftVerification> {
	const contentSnapshots = await Promise.all(
		getActiveContentRelativePaths({ bundle }).map((relativePath) =>
			readInventoryBoundDraftFile({ bundle, relativePath, rootFingerprint })
		)
	);
	const immutableAssets = await verifyImmutableAssets({
		bundle,
		rootFingerprint,
	});
	const lutSnapshot = immutableAssets.generatedLutSnapshot;
	const semanticEvidence = contentSnapshots.map(({ bytes }) =>
		verifyBundleCaseSemantics({
			caseId: bundle.caseId,
			contentText: bytes.toString("utf8"),
			...(lutSnapshot
				? { generatedLutText: lutSnapshot.bytes.toString("utf8") }
				: {}),
		})
	);
	const firstEvidence = semanticEvidence[0];
	if (
		!firstEvidence ||
		semanticEvidence.some(
			(evidence) => JSON.stringify(evidence) !== JSON.stringify(firstEvidence)
		)
	) {
		throw new Error(
			`${bundle.caseId} active content mirrors do not share identical semantic evidence.`
		);
	}
	return {
		caseId: bundle.caseId,
		contentFiles: contentSnapshots.map(({ proof }) => proof),
		...(lutSnapshot ? { generatedLutFile: lutSnapshot.proof } : {}),
		immutableAssetFiles: immutableAssets.proofs,
		phase,
		semanticEvidence: firstEvidence,
		status: "semantic-and-immutable-assets-verified",
	};
}

export function getDraftVerificationPhase({
	action,
}: {
	action: CapCutGuiStepAction;
}): CapCutGuiDraftVerificationPhase | null {
	if (action === "install-bundle") return "installed";
	if (action === "save-and-quit") return "saved";
	if (action === "reopen-draft") return "reopened";
	return null;
}

export const verifyCapCutGuiDraftPhase: CapCutGuiDraftPhaseVerifier = async ({
	bundle,
	phase,
	rootFingerprint,
}) => {
	if (phase === "installed") {
		return verifyInstalledDraft({ bundle, rootFingerprint });
	}
	return verifySemanticDraft({ bundle, phase, rootFingerprint });
};
