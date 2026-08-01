import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
	readFixtureRun,
	type SourceRunEvidence,
} from "./bundle-fixture-run.js";
import {
	createBundleOutputLayout,
	type BundleOutputLayout,
	publishBundleOutput,
	relocateBundlePath,
	removeBundleStaging,
} from "./bundle-output-layout.js";
import {
	type BundleSemanticEvidence,
	verifyWrittenBundleCaseSemantics,
} from "./bundle-semantic-evidence.js";
import {
	buildMigrationCases,
	type MigrationCaseDefinition,
} from "./migration-case-builder.js";
import {
	loadMigrationApi,
	type MigrationBundleWriteResult,
	type MigrationExportPlan,
	type MigrationExportSession,
	type VerifiedMigrationBundle,
} from "./migration-api-contract.js";
import {
	assertMigrationCaseAssetInventory,
	type ExpectedMigrationSourceAssets,
} from "./migration-result-guard.js";
import { assertPlanMatchesWarningAllowlist } from "./migration-warning-guard.js";
import {
	getBundledTargetKey,
	requireBundledToolVersion,
	resolveBundledToolPath,
	sha256File,
} from "./runtime.js";
import {
	analyzeStickerAsset,
	type StickerAssetEvidence,
} from "./sticker-evidence.js";

const PROJECT_ROOT = resolve(process.cwd());
const RUNS_ROOT = join(PROJECT_ROOT, ".tmp", "capcut-e2e", "runs");
const BUNDLE_MANIFEST_FILE_NAME = "bundle-run-manifest.json";
const DEFAULT_CAPCUT_APP_PATH = "/Applications/CapCut.app";
const STICKER_PATH = join(
	PROJECT_ROOT,
	"plugins",
	"qcut",
	"assets",
	"icon.png"
);

interface BundleCaseSummary {
	allowedWarnings: MigrationCaseDefinition["allowedWarnings"];
	caseId: MigrationCaseDefinition["caseId"];
	copiedAssets: MigrationBundleWriteResult["copiedAssets"];
	draftName: string;
	generatedAssets: MigrationBundleWriteResult["generatedAssets"];
	hashes: {
		completeMarkerSha256: string;
		contentSha256: string;
		migrationManifestSha256: string;
		snapshotSha256: string;
	};
	ids: MigrationBundleWriteResult["ids"];
	paths: {
		bundleDirectory: string;
		completeMarker: string;
		draftDirectory: string;
		migrationManifest: string;
	};
	plan: {
		blockerFingerprints: readonly string[];
		canCommit: boolean;
		issueSetFingerprint: string;
		issues: readonly Readonly<MigrationExportPlan["issues"][number]>[];
		requestFingerprint: string;
		warningFingerprints: readonly string[];
	};
	semantics: BundleSemanticEvidence;
	verification: {
		draftFileCount: number;
		timelineMaterialsSize: number;
		totalDraftFileBytes: number;
	};
}

export interface BundleRunManifest {
	bundles: BundleCaseSummary[];
	createdAt: string;
	runId: string;
	schemaVersion: 1;
	sourceRun: SourceRunEvidence;
	sticker: StickerAssetEvidence;
	targetPlatform: "macos" | "windows";
}

export interface BundleGeneratorCliOptions {
	capCutAppPath: string;
	runId: string;
}

function createTextSha256({ value }: { value: string }): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateRunId({ runId }: { runId: string }): void {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(runId)) {
		throw new Error(
			"Run ID must use 1-128 ASCII letters, digits, dots, underscores, or hyphens."
		);
	}
}

export function parseBundleGeneratorCliOptions({
	args,
}: {
	args: string[];
}): BundleGeneratorCliOptions {
	if (
		(args.length !== 2 && args.length !== 4) ||
		args[0] !== "--run-id" ||
		!args[1] ||
		(args.length === 4 &&
			(args[2] !== "--capcut-app-path" || !args[3] || !isAbsolute(args[3])))
	) {
		throw new Error(
			"Usage: bun scripts/capcut-e2e/generate-bundles.ts --run-id <existing-fixture-run> [--capcut-app-path <absolute-CapCut.app>]"
		);
	}
	validateRunId({ runId: args[1] });
	return {
		capCutAppPath: args[3] ?? DEFAULT_CAPCUT_APP_PATH,
		runId: args[1],
	};
}

export function parseBundleRunId({ args }: { args: string[] }): string {
	return parseBundleGeneratorCliOptions({ args }).runId;
}

function getTargetPlatform(): "macos" | "windows" {
	if (process.platform === "darwin") return "macos";
	if (process.platform === "win32") return "windows";
	throw new Error("CapCut migration bundles can run only on macOS or Windows.");
}

function assertVerifiedResult({
	result,
	verified,
}: {
	result: MigrationBundleWriteResult;
	verified: VerifiedMigrationBundle;
}): void {
	if (
		verified.outputDirectory !== result.outputDirectory ||
		verified.draftFolderName !== result.draftFolderName ||
		verified.manifest.content.sha256 !== result.contentSha256 ||
		JSON.stringify(verified.manifest.ids) !== JSON.stringify(result.ids)
	) {
		throw new Error(
			"Verified migration bundle does not match its write result."
		);
	}
	if (result.durabilityWarnings.length > 0) {
		throw new Error(
			`Migration durability warnings are not allowlisted: ${result.durabilityWarnings.join(" | ")}`
		);
	}
}

function relocateBundleSummary({
	bundle,
	layout,
}: {
	bundle: BundleCaseSummary;
	layout: BundleOutputLayout;
}): BundleCaseSummary {
	return {
		...bundle,
		paths: {
			bundleDirectory: relocateBundlePath({
				layout,
				path: bundle.paths.bundleDirectory,
			}),
			completeMarker: relocateBundlePath({
				layout,
				path: bundle.paths.completeMarker,
			}),
			draftDirectory: relocateBundlePath({
				layout,
				path: bundle.paths.draftDirectory,
			}),
			migrationManifest: relocateBundlePath({
				layout,
				path: bundle.paths.migrationManifest,
			}),
		},
	};
}

async function generateBundleCase({
	caseDefinition,
	createdAtUnixSeconds,
	expectedAssets,
	session,
	verifyBundle,
}: {
	caseDefinition: MigrationCaseDefinition;
	createdAtUnixSeconds: number;
	expectedAssets: ExpectedMigrationSourceAssets;
	session: MigrationExportSession;
	verifyBundle: ({
		outputDirectory,
	}: {
		outputDirectory: string;
	}) => Promise<VerifiedMigrationBundle>;
}): Promise<BundleCaseSummary> {
	const plan = await session.plan({
		input: {
			createdAtUnixSeconds,
			draftName: caseDefinition.draftName,
			snapshot: caseDefinition.snapshot,
			targetPlatform: getTargetPlatform(),
		},
	});
	assertPlanMatchesWarningAllowlist({
		allowedWarnings: caseDefinition.allowedWarnings,
		caseId: caseDefinition.caseId,
		plan,
	});
	const result = await session.commit({
		input: {
			acceptedWarningFingerprints: plan.warningFingerprints,
			planToken: plan.planToken,
		},
	});
	assertMigrationCaseAssetInventory({
		caseId: caseDefinition.caseId,
		copiedAssets: result.copiedAssets,
		expectedAssets,
		generatedAssets: result.generatedAssets,
	});
	const verified = await verifyBundle({
		outputDirectory: result.outputDirectory,
	});
	assertVerifiedResult({ result, verified });
	const semantics = await verifyWrittenBundleCaseSemantics({
		caseId: caseDefinition.caseId,
		contentText: verified.contentText,
		draftDirectory: result.draftDirectory,
		generatedAssets: result.generatedAssets,
	});
	const snapshotText = JSON.stringify(caseDefinition.snapshot);
	const [completeMarkerSha256, migrationManifestSha256] = await Promise.all([
		sha256File({ filePath: result.completeMarkerPath }),
		sha256File({ filePath: result.manifestPath }),
	]);
	return {
		allowedWarnings: caseDefinition.allowedWarnings,
		caseId: caseDefinition.caseId,
		copiedAssets: result.copiedAssets,
		draftName: caseDefinition.draftName,
		generatedAssets: result.generatedAssets,
		hashes: {
			completeMarkerSha256,
			contentSha256: result.contentSha256,
			migrationManifestSha256,
			snapshotSha256: createTextSha256({ value: snapshotText }),
		},
		ids: result.ids,
		paths: {
			bundleDirectory: result.outputDirectory,
			completeMarker: result.completeMarkerPath,
			draftDirectory: result.draftDirectory,
			migrationManifest: result.manifestPath,
		},
		plan: {
			blockerFingerprints: plan.blockerFingerprints,
			canCommit: plan.canCommit,
			issueSetFingerprint: plan.issueSetFingerprint,
			issues: plan.issues,
			requestFingerprint: plan.requestFingerprint,
			warningFingerprints: plan.warningFingerprints,
		},
		semantics,
		verification: {
			draftFileCount: verified.draftFiles.length,
			timelineMaterialsSize: verified.manifest.timelineMaterialsSize,
			totalDraftFileBytes: verified.draftFiles.reduce(
				(sum, { bytes }) => sum + bytes,
				0
			),
		},
	};
}

async function generateBundleCases({
	caseDefinitions,
	createdAtUnixSeconds,
	expectedAssets,
	session,
	verifyBundle,
}: {
	caseDefinitions: MigrationCaseDefinition[];
	createdAtUnixSeconds: number;
	expectedAssets: ExpectedMigrationSourceAssets;
	session: MigrationExportSession;
	verifyBundle: ({
		outputDirectory,
	}: {
		outputDirectory: string;
	}) => Promise<VerifiedMigrationBundle>;
}): Promise<BundleCaseSummary[]> {
	return caseDefinitions.reduce<Promise<BundleCaseSummary[]>>(
		(summaryPromise, caseDefinition) =>
			summaryPromise.then(async (summaries) => {
				const summary = await generateBundleCase({
					caseDefinition,
					createdAtUnixSeconds,
					expectedAssets,
					session,
					verifyBundle,
				});
				return [...summaries, summary];
			}),
		Promise.resolve([])
	);
}

export async function generateMigrationBundles({
	capCutAppPath = DEFAULT_CAPCUT_APP_PATH,
	runId,
}: {
	capCutAppPath?: string;
	runId: string;
}): Promise<{ manifest: BundleRunManifest; manifestPath: string }> {
	validateRunId({ runId });
	if (!isAbsolute(capCutAppPath)) {
		throw new Error("CapCut application path must be absolute.");
	}
	const fixtureRun = await readFixtureRun({ runId, runsRoot: RUNS_ROOT });
	const targetKey = getBundledTargetKey();
	const [ffmpegPath, ffprobePath] = await Promise.all([
		resolveBundledToolPath({
			projectRoot: PROJECT_ROOT,
			targetKey,
			tool: "ffmpeg",
		}),
		resolveBundledToolPath({
			projectRoot: PROJECT_ROOT,
			targetKey,
			tool: "ffprobe",
		}),
	]);
	await Promise.all([
		requireBundledToolVersion({ tool: "ffmpeg", toolPath: ffmpegPath }),
		requireBundledToolVersion({ tool: "ffprobe", toolPath: ffprobePath }),
	]);
	const [migrationApi, sticker] = await Promise.all([
		loadMigrationApi({ projectRoot: PROJECT_ROOT }),
		analyzeStickerAsset({
			ffmpegPath,
			ffprobePath,
			imagePath: STICKER_PATH,
		}),
	]);
	const createdAtUnixSeconds = Math.floor(
		Date.parse(fixtureRun.manifest.createdAt) / 1000
	);
	if (!Number.isSafeInteger(createdAtUnixSeconds)) {
		throw new Error("Fixture manifest has an invalid creation timestamp.");
	}
	const outputLayout = await createBundleOutputLayout({
		runDirectory: fixtureRun.runDirectory,
	});
	try {
		const session = new migrationApi.CapCut81MigrationExportSession({
			allowedSourceRootDirectory: PROJECT_ROOT,
			capCutAppPath,
			ffprobePath,
			outputParentDirectory: outputLayout.stagingDirectory,
		});
		let stagingBundles: BundleCaseSummary[];
		try {
			stagingBundles = await generateBundleCases({
				caseDefinitions: buildMigrationCases({
					sources: {
						audioPath: fixtureRun.sourceAudio.path,
						sticker: {
							height: sticker.geometry.height,
							path: sticker.path,
							width: sticker.geometry.width,
						},
						videoPath: fixtureRun.sourceVideo.path,
					},
				}),
				createdAtUnixSeconds,
				expectedAssets: {
					sourceAudio: fixtureRun.sourceAudio,
					sourceVideo: fixtureRun.sourceVideo,
					sticker,
				},
				session,
				verifyBundle: migrationApi.verifyCapCut81MigrationBundle,
			});
		} finally {
			session.dispose();
		}
		const bundles = stagingBundles.map((bundle) =>
			relocateBundleSummary({ bundle, layout: outputLayout })
		);
		const manifest: BundleRunManifest = {
			bundles,
			createdAt: new Date().toISOString(),
			runId,
			schemaVersion: 1,
			sourceRun: fixtureRun.sourceRun,
			sticker,
			targetPlatform: getTargetPlatform(),
		};
		const stagingManifestPath = join(
			outputLayout.stagingDirectory,
			BUNDLE_MANIFEST_FILE_NAME
		);
		await writeFile(
			stagingManifestPath,
			`${JSON.stringify(manifest, null, 2)}\n`,
			"utf8"
		);
		await publishBundleOutput({ layout: outputLayout });
		const manifestPath = join(
			outputLayout.finalDirectory,
			BUNDLE_MANIFEST_FILE_NAME
		);
		return { manifest, manifestPath };
	} catch (error: unknown) {
		await removeBundleStaging({ layout: outputLayout });
		throw error;
	}
}

async function main(): Promise<void> {
	try {
		const result = await generateMigrationBundles(
			parseBundleGeneratorCliOptions({ args: process.argv.slice(2) })
		);
		process.stdout.write(
			`${JSON.stringify(
				{
					bundles: result.manifest.bundles.map(
						({ caseId, ids, paths, plan }) => ({
							caseId,
							ids,
							outputDirectory: paths.bundleDirectory,
							warnings: plan.issues.filter(
								({ severity }) => severity === "warning"
							),
						})
					),
					manifestPath: result.manifestPath,
				},
				null,
				2
			)}\n`
		);
	} catch (error: unknown) {
		process.stderr.write(
			`[capcut-e2e-bundles] ${error instanceof Error ? error.message : String(error)}\n`
		);
		process.exitCode = 1;
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	PROJECT_ROOT,
	"scripts",
	"capcut-e2e",
	"generate-bundles.ts"
);
if (entryPath === expectedEntryPath) {
	void main();
}
