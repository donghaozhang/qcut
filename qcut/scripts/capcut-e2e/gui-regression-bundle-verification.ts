import { createHash } from "node:crypto";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import type {
	MigrationApi,
	MigrationBundleIds,
	VerifiedMigrationBundle,
} from "./migration-api-contract.js";
import { loadMigrationApi } from "./migration-api-contract.js";
import type {
	CapCutGuiAssetIntegrity,
	CapCutGuiBundleCase,
	CapCutGuiBundleVerificationReport,
} from "./gui-regression-contract.js";

export type CapCutGuiBundleVerifier =
	MigrationApi["verifyCapCut81MigrationBundle"];

export interface CapCutGuiExpectedBundleIntegrity {
	completeMarkerPath: string;
	completeMarkerSha256: string;
	contentSha256: string;
	copiedAssets: readonly CapCutGuiAssetIntegrity[];
	draftFileCount: number;
	draftFolderName: string;
	generatedAssets: readonly CapCutGuiAssetIntegrity[];
	ids: MigrationBundleIds;
	migrationManifestPath: string;
	migrationManifestSha256: string;
	timelineMaterialsSize: number;
	totalDraftFileBytes: number;
}

function sortAssetIntegrity({
	assets,
}: {
	assets: readonly CapCutGuiAssetIntegrity[];
}): CapCutGuiAssetIntegrity[] {
	return [...assets].sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath)
	);
}

function assertAssetInventoryMatches({
	actual,
	expected,
	label,
}: {
	actual: readonly CapCutGuiAssetIntegrity[];
	expected: readonly CapCutGuiAssetIntegrity[];
	label: string;
}): void {
	const actualJson = JSON.stringify(sortAssetIntegrity({ assets: actual }));
	const expectedJson = JSON.stringify(sortAssetIntegrity({ assets: expected }));
	if (actualJson !== expectedJson) {
		throw new Error(`${label} no longer matches the bundle-run manifest.`);
	}
}

function assertIdsMatch({
	actual,
	expected,
}: {
	actual: MigrationBundleIds;
	expected: MigrationBundleIds;
}): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			"Verified bundle IDs no longer match the bundle-run manifest."
		);
	}
}

function createDraftFilesInventorySha256({
	draftFiles,
}: {
	draftFiles: VerifiedMigrationBundle["draftFiles"];
}): string {
	const inventory = [...draftFiles]
		.map(({ bytes, relativePath, sha256 }) => ({ bytes, relativePath, sha256 }))
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
	return createHash("sha256")
		.update(JSON.stringify(inventory), "utf8")
		.digest("hex");
}

async function describeIntegrityFile({
	expectedSha256,
	label,
	path,
}: {
	expectedSha256: string;
	label: string;
	path: string;
}): Promise<{ bytes: number; path: string; sha256: string }> {
	const snapshot = await readRegularFileSnapshot({ label, path });
	if (snapshot.bytes.length === 0) {
		throw new Error(`${label} must remain a non-empty regular file.`);
	}
	const sha256 = createHash("sha256").update(snapshot.bytes).digest("hex");
	if (sha256 !== expectedSha256) {
		throw new Error(`${label} hash no longer matches the bundle-run manifest.`);
	}
	return { bytes: snapshot.bytes.length, path, sha256 };
}

function assertVerifiedSummary({
	expected,
	outputDirectory,
	verified,
}: {
	expected: CapCutGuiExpectedBundleIntegrity;
	outputDirectory: string;
	verified: VerifiedMigrationBundle;
}): void {
	if (
		verified.outputDirectory !== outputDirectory ||
		verified.draftFolderName !== expected.draftFolderName ||
		verified.manifest.content.sha256 !== expected.contentSha256 ||
		verified.manifest.timelineMaterialsSize !==
			expected.timelineMaterialsSize ||
		verified.draftFiles.length !== expected.draftFileCount ||
		verified.draftFiles.reduce((sum, { bytes }) => sum + bytes, 0) !==
			expected.totalDraftFileBytes
	) {
		throw new Error(
			"Migration verifier result no longer matches the bundle-run manifest."
		);
	}
	const contentBytes = Buffer.from(verified.contentText, "utf8");
	if (
		contentBytes.length !== verified.manifest.content.bytes ||
		createHash("sha256").update(contentBytes).digest("hex") !==
			expected.contentSha256
	) {
		throw new Error("Verified content hash does not match its content bytes.");
	}
	assertIdsMatch({ actual: verified.manifest.ids, expected: expected.ids });
	assertAssetInventoryMatches({
		actual: verified.manifest.assets,
		expected: expected.copiedAssets,
		label: "Verified copied assets",
	});
	assertAssetInventoryMatches({
		actual: verified.manifest.generatedAssets,
		expected: expected.generatedAssets,
		label: "Verified generated assets",
	});
}

export async function verifyGuiBundleCaseIntegrity({
	expected,
	outputDirectory,
	verifyBundle,
}: {
	expected: CapCutGuiExpectedBundleIntegrity;
	outputDirectory: string;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<CapCutGuiBundleVerificationReport> {
	const verified = await verifyBundle({ outputDirectory });
	assertVerifiedSummary({ expected, outputDirectory, verified });
	const [completeMarker, migrationManifest] = await Promise.all([
		describeIntegrityFile({
			expectedSha256: expected.completeMarkerSha256,
			label: "Migration complete marker",
			path: expected.completeMarkerPath,
		}),
		describeIntegrityFile({
			expectedSha256: expected.migrationManifestSha256,
			label: "Migration manifest",
			path: expected.migrationManifestPath,
		}),
	]);
	return {
		completeMarker,
		content: verified.manifest.content,
		copiedAssets: sortAssetIntegrity({ assets: verified.manifest.assets }),
		draftFileCount: verified.draftFiles.length,
		draftFilesInventorySha256: createDraftFilesInventorySha256({
			draftFiles: verified.draftFiles,
		}),
		draftFolderName: verified.draftFolderName,
		generatedAssets: sortAssetIntegrity({
			assets: verified.manifest.generatedAssets,
		}),
		ids: verified.manifest.ids,
		migrationManifest,
		outputDirectory: verified.outputDirectory,
		timelineMaterialsSize: verified.manifest.timelineMaterialsSize,
		totalDraftFileBytes: verified.draftFiles.reduce(
			(sum, { bytes }) => sum + bytes,
			0
		),
	};
}

export function createProductionBundleVerifier({
	projectRoot,
}: {
	projectRoot: string;
}): CapCutGuiBundleVerifier {
	let apiPromise: Promise<MigrationApi> | undefined;
	return async ({ outputDirectory }) => {
		apiPromise ??= loadMigrationApi({ projectRoot });
		const api = await apiPromise;
		return api.verifyCapCut81MigrationBundle({ outputDirectory });
	};
}

export async function reverifyPlannedGuiBundles({
	bundles,
	verifyBundle,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<void> {
	await Promise.all(
		bundles.map(async (bundle) => {
			const planned = bundle.verification;
			const actual = await verifyGuiBundleCaseIntegrity({
				expected: {
					completeMarkerPath: bundle.completeMarkerPath,
					completeMarkerSha256: planned.completeMarker.sha256,
					contentSha256: planned.content.sha256,
					copiedAssets: planned.copiedAssets,
					draftFileCount: planned.draftFileCount,
					draftFolderName: planned.draftFolderName,
					generatedAssets: planned.generatedAssets,
					ids: planned.ids,
					migrationManifestPath: bundle.migrationManifestPath,
					migrationManifestSha256: planned.migrationManifest.sha256,
					timelineMaterialsSize: planned.timelineMaterialsSize,
					totalDraftFileBytes: planned.totalDraftFileBytes,
				},
				outputDirectory: bundle.bundleDirectory,
				verifyBundle,
			});
			if (JSON.stringify(actual) !== JSON.stringify(planned)) {
				throw new Error(
					`${bundle.caseId} bundle verification changed after plan creation; GUI adapter execution is refused.`
				);
			}
		})
	);
}
