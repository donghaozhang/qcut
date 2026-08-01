import { basename, posix, relative, sep } from "node:path";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import {
	type CapCutGuiBundleVerifier,
	type CapCutGuiExpectedBundleIntegrity,
	verifyGuiBundleCaseIntegrity,
} from "./gui-regression-bundle-verification.js";
import {
	CAPCUT_GUI_CASE_IDS,
	type CapCutGuiAssetIntegrity,
	type CapCutGuiBundleCase,
	type CapCutGuiCaseId,
} from "./gui-regression-contract.js";
import {
	isSameOrDescendantPath,
	requireCanonicalPath,
	requireNonEmptyString,
	requireRecord,
} from "./gui-regression-filesystem.js";

export interface CapCutGuiBundleRunReport {
	bundles: readonly CapCutGuiBundleCase[];
	manifestPath: string;
	runId: string;
}

function requireNonNegativeInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} must be a non-negative safe integer.`);
	}
	return value;
}

function requireSha256({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return value;
}

function parseAssetIntegrity({
	entry,
	label,
}: {
	entry: unknown;
	label: string;
}): CapCutGuiAssetIntegrity {
	const record = requireRecord({ label, value: entry });
	return {
		bytes: requireNonNegativeInteger({
			label: `${label} bytes`,
			value: record.bytes,
		}),
		relativePath: requireNonEmptyString({
			label: `${label} relativePath`,
			value: record.relativePath,
		}),
		sha256: requireSha256({
			label: `${label} sha256`,
			value: record.sha256,
		}),
	};
}

function parseAssetInventory({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): CapCutGuiAssetIntegrity[] {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array.`);
	}
	const assets = value.map((entry, index) =>
		parseAssetIntegrity({ entry, label: `${label} ${index}` })
	);
	if (
		new Set(assets.map(({ relativePath }) => relativePath)).size !==
		assets.length
	) {
		throw new Error(`${label} contains duplicate relative paths.`);
	}
	return assets;
}

function bindAssetsToBundleRoot({
	assets,
	bundleDirectory,
	draftDirectory,
}: {
	assets: readonly CapCutGuiAssetIntegrity[];
	bundleDirectory: string;
	draftDirectory: string;
}): CapCutGuiAssetIntegrity[] {
	const draftRelativePath = relative(bundleDirectory, draftDirectory)
		.split(sep)
		.join("/");
	return assets.map((asset) => ({
		...asset,
		relativePath: posix.join(draftRelativePath, asset.relativePath),
	}));
}

function parseBundleIds({ value }: { value: unknown }) {
	const record = requireRecord({ label: "Bundle manifest case IDs", value });
	return {
		draftId: requireNonEmptyString({
			label: "Bundle draft ID",
			value: record.draftId,
		}),
		placeholderId: requireNonEmptyString({
			label: "Bundle placeholder ID",
			value: record.placeholderId,
		}),
		projectId: requireNonEmptyString({
			label: "Bundle project ID",
			value: record.projectId,
		}),
		timelineId: requireNonEmptyString({
			label: "Bundle timeline ID",
			value: record.timelineId,
		}),
	};
}

function requireCaseId({ value }: { value: unknown }): CapCutGuiCaseId {
	if (
		typeof value !== "string" ||
		!CAPCUT_GUI_CASE_IDS.some((caseId) => caseId === value)
	) {
		throw new Error(`Unsupported CapCut GUI bundle case: ${String(value)}.`);
	}
	return value as CapCutGuiCaseId;
}

async function inspectBundleCase({
	entry,
	expectedOwnerUid,
	storePath,
	verifyBundle,
}: {
	entry: unknown;
	expectedOwnerUid: number;
	storePath: string;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<CapCutGuiBundleCase> {
	const record = requireRecord({ label: "Bundle manifest case", value: entry });
	const paths = requireRecord({
		label: "Bundle manifest case paths",
		value: record.paths,
	});
	const ids = parseBundleIds({ value: record.ids });
	const hashes = requireRecord({
		label: "Bundle manifest case hashes",
		value: record.hashes,
	});
	const expectedVerification = requireRecord({
		label: "Bundle manifest case verification",
		value: record.verification,
	});
	const bundleDirectory = await requireCanonicalPath({
		expectedKind: "directory",
		label: "Migration bundle directory",
		path: requireNonEmptyString({
			label: "Bundle directory path",
			value: paths.bundleDirectory,
		}),
	});
	const draftDirectory = await requireCanonicalPath({
		expectedKind: "directory",
		label: "Migration bundle draft directory",
		path: requireNonEmptyString({
			label: "Bundle draft directory path",
			value: paths.draftDirectory,
		}),
	});
	const completeMarker = await requireCanonicalPath({
		expectedKind: "file",
		label: "Migration complete marker",
		path: requireNonEmptyString({
			label: "Complete marker path",
			value: paths.completeMarker,
		}),
	});
	const migrationManifest = await requireCanonicalPath({
		expectedKind: "file",
		label: "Migration manifest",
		path: requireNonEmptyString({
			label: "Migration manifest path",
			value: paths.migrationManifest,
		}),
	});
	if (
		!isSameOrDescendantPath({
			candidatePath: draftDirectory.canonicalPath,
			parentPath: bundleDirectory.canonicalPath,
		}) ||
		draftDirectory.canonicalPath === bundleDirectory.canonicalPath
	) {
		throw new Error(
			"Bundle draft directory must be inside its bundle directory."
		);
	}
	if (
		isSameOrDescendantPath({
			candidatePath: bundleDirectory.canonicalPath,
			parentPath: storePath,
		}) ||
		isSameOrDescendantPath({
			candidatePath: storePath,
			parentPath: bundleDirectory.canonicalPath,
		})
	) {
		throw new Error("Migration bundles must not overlap the disposable store.");
	}
	for (const controlFilePath of [
		completeMarker.canonicalPath,
		migrationManifest.canonicalPath,
	]) {
		if (
			!isSameOrDescendantPath({
				candidatePath: controlFilePath,
				parentPath: bundleDirectory.canonicalPath,
			}) ||
			controlFilePath === bundleDirectory.canonicalPath
		) {
			throw new Error(
				"Bundle control files must be inside the bundle directory."
			);
		}
	}
	const ownerUids = [
		Number(bundleDirectory.stats.uid),
		Number(draftDirectory.stats.uid),
		Number(completeMarker.stats.uid),
		Number(migrationManifest.stats.uid),
	];
	const mismatchedOwnerUid = ownerUids.find(
		(ownerUid) => ownerUid !== expectedOwnerUid
	);
	if (mismatchedOwnerUid !== undefined) {
		throw new Error(
			`Migration bundle paths must be owned by process UID ${expectedOwnerUid}; found UID ${mismatchedOwnerUid}.`
		);
	}
	const expected: CapCutGuiExpectedBundleIntegrity = {
		completeMarkerPath: completeMarker.canonicalPath,
		completeMarkerSha256: requireSha256({
			label: "Complete marker hash",
			value: hashes.completeMarkerSha256,
		}),
		contentSha256: requireSha256({
			label: "Content hash",
			value: hashes.contentSha256,
		}),
		copiedAssets: bindAssetsToBundleRoot({
			assets: parseAssetInventory({
				label: "Copied assets",
				value: record.copiedAssets,
			}),
			bundleDirectory: bundleDirectory.canonicalPath,
			draftDirectory: draftDirectory.canonicalPath,
		}),
		draftFileCount: requireNonNegativeInteger({
			label: "Verified draft file count",
			value: expectedVerification.draftFileCount,
		}),
		draftFolderName: basename(draftDirectory.canonicalPath),
		generatedAssets: bindAssetsToBundleRoot({
			assets: parseAssetInventory({
				label: "Generated assets",
				value: record.generatedAssets,
			}),
			bundleDirectory: bundleDirectory.canonicalPath,
			draftDirectory: draftDirectory.canonicalPath,
		}),
		ids,
		migrationManifestPath: migrationManifest.canonicalPath,
		migrationManifestSha256: requireSha256({
			label: "Migration manifest hash",
			value: hashes.migrationManifestSha256,
		}),
		timelineMaterialsSize: requireNonNegativeInteger({
			label: "Timeline materials size",
			value: expectedVerification.timelineMaterialsSize,
		}),
		totalDraftFileBytes: requireNonNegativeInteger({
			label: "Total draft file bytes",
			value: expectedVerification.totalDraftFileBytes,
		}),
	};
	const verification = await verifyGuiBundleCaseIntegrity({
		expected,
		outputDirectory: bundleDirectory.canonicalPath,
		verifyBundle,
	});
	return {
		bundleDirectory: bundleDirectory.canonicalPath,
		caseId: requireCaseId({ value: record.caseId }),
		completeMarkerPath: completeMarker.canonicalPath,
		draftDirectory: draftDirectory.canonicalPath,
		draftId: ids.draftId,
		draftName: requireNonEmptyString({
			label: "Bundle draft name",
			value: record.draftName,
		}),
		migrationManifestPath: migrationManifest.canonicalPath,
		verification,
	};
}

export async function inspectBundleRun({
	bundleManifestPath,
	expectedOwnerUid,
	storePath,
	verifyBundle,
}: {
	bundleManifestPath: string;
	expectedOwnerUid: number;
	storePath: string;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<CapCutGuiBundleRunReport> {
	const manifestFile = await requireCanonicalPath({
		expectedKind: "file",
		label: "Bundle run manifest",
		path: bundleManifestPath,
	});
	if (Number(manifestFile.stats.uid) !== expectedOwnerUid) {
		throw new Error(
			`Bundle run manifest must be owned by process UID ${expectedOwnerUid}.`
		);
	}
	let parsed: unknown;
	try {
		const snapshot = await readRegularFileSnapshot({
			label: "Bundle run manifest",
			path: manifestFile.canonicalPath,
		});
		parsed = JSON.parse(snapshot.bytes.toString("utf8"));
	} catch {
		throw new Error("Bundle run manifest must contain valid JSON.");
	}
	const manifest = requireRecord({
		label: "Bundle run manifest",
		value: parsed,
	});
	if (manifest.schemaVersion !== 1 || manifest.targetPlatform !== "macos") {
		throw new Error("Bundle run manifest must use schema 1 and target macOS.");
	}
	if (!Array.isArray(manifest.bundles)) {
		throw new Error("Bundle run manifest must contain a bundles array.");
	}
	const bundles = await Promise.all(
		manifest.bundles.map((entry) =>
			inspectBundleCase({ entry, expectedOwnerUid, storePath, verifyBundle })
		)
	);
	const caseIds = bundles.map(({ caseId }) => caseId);
	if (
		caseIds.length !== CAPCUT_GUI_CASE_IDS.length ||
		caseIds.some((caseId, index) => caseId !== CAPCUT_GUI_CASE_IDS[index])
	) {
		throw new Error(
			`Bundle run manifest cases must be ordered exactly as ${CAPCUT_GUI_CASE_IDS.join(", ")}.`
		);
	}
	if (new Set(bundles.map(({ draftId }) => draftId)).size !== bundles.length) {
		throw new Error("Bundle run manifest contains duplicate draft IDs.");
	}
	return {
		bundles,
		manifestPath: manifestFile.canonicalPath,
		runId: requireNonEmptyString({
			label: "Bundle run ID",
			value: manifest.runId,
		}),
	};
}
