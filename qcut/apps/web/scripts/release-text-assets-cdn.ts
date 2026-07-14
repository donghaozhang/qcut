import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { S3Client } from "@aws-sdk/client-s3";
import {
	buildTextAssetUploadPlan,
	buildTextAssetUploadPlanReport,
	createS3UploadFile,
	uploadTextAssetPlan,
	writeTextAssetUploadPlanReport,
	type TextAssetUploadPlanItem,
	type TextAssetUploadSummary,
} from "./upload-text-assets-cdn";
import {
	applyTextDesignerReadyPreset,
	buildDesignerAssetGapReport,
	buildTextAssetPublishManifest,
	buildTextMarketplacePublishEntry,
	parseCommaSeparatedList,
	readGeneratedManifest,
	summarizeDesignerCategoryCoverage,
	summarizeTextAssetProvenance,
	summarizeVerifyIssues,
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	verifyDesignerCategoryCoverage,
	verifyDesignerAssetCoverage,
	verifyLocalFiles,
	verifyRemoteFiles,
	writeDesignerAssetGapChecklist,
	writeDesignerAssetGapReport,
	writePublishManifest,
	type TextAssetDesignerGapReport,
	type TextAssetProvenanceSummary,
	type VerifyIssue,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetReleaseOptions = {
	archivePath?: string;
	baseUrl: string;
	bucket: string;
	cacheControl: string;
	dryRun: boolean;
	generatedManifestPath: string;
	metadataCacheControl: string;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	prefix: string;
	publishManifestPath: string;
	publicDir: string;
	remoteConcurrency: number;
	requiredDesignerCategories: string[];
	skipRemoteCheck: boolean;
	stageDir?: string;
	uploadConcurrency: number;
	uploadPlanPath?: string;
};

export type TextAssetReleaseSummary = {
	archiveBytes?: number;
	archivePath?: string;
	archiveSha256?: string;
	archivedFiles: number;
	baseUrl: string;
	designerGapChecklistPath?: string;
	designerGapReportPath?: string;
	designerReady: boolean;
	designerReadyMissing: number;
	dryRun: boolean;
	localIssueSummary: ReturnType<typeof summarizeVerifyIssues>["issueSummary"];
	localIssues: readonly VerifyIssue[];
	manifestPath: string;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	provenance: TextAssetProvenanceSummary;
	remoteIssueSummary: ReturnType<typeof summarizeVerifyIssues>["issueSummary"];
	remoteIssues: readonly VerifyIssue[];
	requiredDesignerCategories: readonly string[];
	stageDir?: string;
	stagedFiles: number;
	stageManifestPath?: string;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	upload: TextAssetUploadSummary;
	uploadPlanPath?: string;
};

export type TextAssetReleaseReadiness = {
	designerImported: number;
	designerReady: boolean;
	generated: number;
	missingDesignerAssets: number;
	requiredDesignerCategories: readonly string[];
	status: "designer-ready" | "generated-fallback";
	totalAssets: number;
};

export type TextAssetStageArchiveSummary = {
	archivePath: string;
	byteSize: number;
	fileCount: number;
	format: "tar.gz";
	sha256: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE_URL = "https://assets.qcut.app";
const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const DEFAULT_PUBLISH_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../dist/text-assets-publish-manifest.json"
);
const DEFAULT_METADATA_CACHE_CONTROL =
	"public, max-age=300, stale-while-revalidate=86400";
const STAGE_MANIFEST_FILE = "_qcut-text-assets-release.json";
const STAGE_README_FILE = "_qcut-text-assets-release-readme.md";
const STAGE_DESIGNER_GAP_CHECKLIST_FILE =
	"_qcut-text-designer-gap-checklist.csv";
const STAGE_DESIGNER_GAP_REPORT_FILE = "_qcut-text-designer-gap-report.json";
const STAGE_RELEASE_METADATA_FILE_COUNT = 4;
const execFileAsync = promisify(execFile);

export function parseTextAssetReleaseArgs({
	argv,
	env = process.env,
}: {
	argv: string[];
	env?: NodeJS.ProcessEnv;
}): TextAssetReleaseOptions {
	const options: TextAssetReleaseOptions = {
		baseUrl: env.QCUT_TEXT_ASSET_CDN_URL ?? DEFAULT_BASE_URL,
		bucket: env.QCUT_TEXT_ASSET_BUCKET ?? "",
		cacheControl: env.QCUT_TEXT_ASSET_CACHE_CONTROL ?? DEFAULT_CACHE_CONTROL,
		dryRun: false,
		generatedManifestPath:
			env.QCUT_TEXT_ASSET_GENERATED_MANIFEST ?? DEFAULT_GENERATED_MANIFEST_PATH,
		metadataCacheControl:
			env.QCUT_TEXT_ASSET_METADATA_CACHE_CONTROL ??
			DEFAULT_METADATA_CACHE_CONTROL,
		minDesignerAssets: parseNonNegativeInteger({
			name: "QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS",
			value: env.QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS ?? "0",
		}),
		minDesignerAssetsPerCategory: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS_PER_CATEGORY",
			value: env.QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS_PER_CATEGORY ?? "1",
		}),
		prefix: env.QCUT_TEXT_ASSET_CDN_PREFIX ?? "",
		publishManifestPath:
			env.QCUT_TEXT_ASSET_PUBLISH_MANIFEST ?? DEFAULT_PUBLISH_MANIFEST_PATH,
		publicDir: env.QCUT_TEXT_ASSET_PUBLIC_DIR ?? DEFAULT_PUBLIC_DIR,
		remoteConcurrency: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_REMOTE_CONCURRENCY",
			value: env.QCUT_TEXT_ASSET_REMOTE_CONCURRENCY ?? "16",
		}),
		requiredDesignerCategories: parseCommaSeparatedList({
			value: env.QCUT_TEXT_ASSET_REQUIRED_DESIGNER_CATEGORIES,
		}),
		skipRemoteCheck: false,
		uploadConcurrency: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_UPLOAD_CONCURRENCY",
			value: env.QCUT_TEXT_ASSET_UPLOAD_CONCURRENCY ?? "8",
		}),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--archive-path") {
			options.archivePath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--base-url") {
			options.baseUrl = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--bucket") {
			options.bucket = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--cache-control") {
			options.cacheControl = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--metadata-cache-control") {
			options.metadataCacheControl = requireValue({
				argv,
				index,
				name: arg,
			});
			index += 1;
			continue;
		}
		if (arg === "--min-designer-assets") {
			options.minDesignerAssets = parseNonNegativeInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--min-designer-assets-per-category") {
			options.minDesignerAssetsPerCategory = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--require-designer-categories") {
			options.requiredDesignerCategories = parseCommaSeparatedList({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--designer-ready") {
			Object.assign(options, applyTextDesignerReadyPreset({ options }));
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			options.skipRemoteCheck = true;
			continue;
		}
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--prefix") {
			options.prefix = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--publish-manifest") {
			options.publishManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--public-dir") {
			options.publicDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--remote-concurrency") {
			options.remoteConcurrency = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--skip-remote-check") {
			options.skipRemoteCheck = true;
			continue;
		}
		if (arg === "--stage-dir") {
			options.stageDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--upload-concurrency") {
			options.uploadConcurrency = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--write-upload-plan") {
			options.uploadPlanPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!options.bucket && !(options.dryRun && options.stageDir)) {
		throw new Error(
			"Missing bucket. Set QCUT_TEXT_ASSET_BUCKET or --bucket, or use --dry-run with --stage-dir for a local release artifact."
		);
	}
	if (options.archivePath && !options.stageDir) {
		throw new Error("--archive-path requires --stage-dir");
	}
	return options;
}

export async function releaseTextAssetsToCdn({
	archiveStage = createTextAssetStageArchive,
	options,
	uploadFile,
	verifyRemote = verifyRemoteFiles,
}: {
	archiveStage?: ({
		archivePath,
		stagedFileCount,
		stageDir,
	}: {
		archivePath: string;
		stagedFileCount: number;
		stageDir: string;
	}) => Promise<TextAssetStageArchiveSummary>;
	options: TextAssetReleaseOptions;
	uploadFile: Parameters<typeof uploadTextAssetPlan>[0]["uploadFile"];
	verifyRemote?: typeof verifyRemoteFiles;
}): Promise<TextAssetReleaseSummary> {
	const generatedAt = new Date().toISOString();
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const marketplace = await buildTextMarketplacePublishEntry({
		baseUrl: options.baseUrl,
		generatedManifest,
		publicDir: options.publicDir,
	});
	const provenance = summarizeTextAssetProvenance({ generatedManifest });
	const designerCoverageIssues = verifyDesignerAssetCoverage({
		minDesignerAssets: options.minDesignerAssets,
		provenance,
	});
	const designerCategoryIssues = verifyDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const designerGapReport = buildDesignerAssetGapReport({
		coverage: summarizeDesignerCategoryCoverage({
			generatedManifest,
			minDesignerAssetsPerCategory: TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
			requiredDesignerCategories: [...TEXT_DESIGNER_READY_CATEGORY_IDS],
		}),
		generatedAt,
		generatedManifest,
		minDesignerAssetsPerCategory: TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
		requiredDesignerCategories: [...TEXT_DESIGNER_READY_CATEGORY_IDS],
	});
	const releaseReadiness = buildTextAssetReleaseReadiness({
		designerGapReport,
		provenance,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const { issues: manifestIssues, manifest } = buildTextAssetPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt,
		generatedManifest,
		publicDir: options.publicDir,
		supplementalAssets: marketplace.entry ? [marketplace.entry] : [],
	});
	await writePublishManifest({
		manifest,
		writePath: options.publishManifestPath,
	});
	const localIssues = [
		...marketplace.issues,
		...designerCoverageIssues,
		...designerCategoryIssues,
		...manifestIssues,
		...(await verifyLocalFiles({ manifest })),
	];
	if (localIssues.length > 0) {
		return buildReleaseSummary({
			designerReadyMissing: designerGapReport.totalMissing,
			localIssues,
			manifestPath: options.publishManifestPath,
			remoteIssues: [],
			upload: emptyUploadSummary({
				bucket: options.bucket,
				dryRun: options.dryRun,
			}),
			manifest,
			options,
			provenance,
		});
	}
	const items = buildTextAssetUploadPlan({
		bucket: options.bucket,
		cacheControl: options.cacheControl,
		manifest,
		metadataCacheControl: options.metadataCacheControl,
		prefix: options.prefix,
	});
	if (options.uploadPlanPath) {
		await writeTextAssetUploadPlanReport({
			report: buildTextAssetUploadPlanReport({
				generatedAt: new Date().toISOString(),
				items,
				prefix: options.prefix,
			}),
			writePath: options.uploadPlanPath,
		});
	}
	const staging = options.stageDir
		? await stageTextAssetUploadPlan({
				designerGapReport,
				items,
				prefix: options.prefix,
				provenance,
				releaseReadiness,
				requiredDesignerCategories: options.requiredDesignerCategories,
				stageDir: options.stageDir,
			})
		: undefined;
	const archive =
		options.archivePath && options.stageDir
			? await archiveStage({
					archivePath: options.archivePath,
					stagedFileCount: staging?.fileCount ?? 0,
					stageDir: options.stageDir,
				})
			: undefined;
	const upload = await uploadTextAssetPlan({
		concurrency: options.uploadConcurrency,
		dryRun: options.dryRun,
		items,
		uploadFile,
	});
	const remoteIssues =
		options.dryRun || options.skipRemoteCheck
			? []
			: await verifyRemote({
					concurrency: options.remoteConcurrency,
					manifest,
				});
	return buildReleaseSummary({
		designerReadyMissing: designerGapReport.totalMissing,
		localIssues,
		manifest,
		manifestPath: options.publishManifestPath,
		options,
		provenance,
		remoteIssues,
		stageArchiveBytes: archive?.byteSize,
		stageDesignerGapChecklistPath: staging?.designerGapChecklistPath,
		stageDesignerGapReportPath: staging?.designerGapReportPath,
		stageArchivePath: archive?.archivePath,
		stageArchiveSha256: archive?.sha256,
		stageArchivedFiles: archive?.fileCount,
		stageManifestPath: staging?.manifestPath,
		stagedFiles: staging?.fileCount,
		upload,
	});
}

export async function stageTextAssetUploadPlan({
	designerGapReport,
	items,
	prefix,
	provenance,
	releaseReadiness,
	requiredDesignerCategories = [],
	stageDir,
}: {
	designerGapReport?: TextAssetDesignerGapReport;
	items: readonly TextAssetUploadPlanItem[];
	prefix: string;
	provenance?: TextAssetProvenanceSummary;
	releaseReadiness?: TextAssetReleaseReadiness;
	requiredDesignerCategories?: readonly string[];
	stageDir: string;
}): Promise<{
	designerGapChecklistPath?: string;
	designerGapReportPath?: string;
	fileCount: number;
	manifestPath: string;
}> {
	const resolvedStageDir = resolve(stageDir);
	await Promise.all(
		items.map(async (item) => {
			const targetPath = resolve(resolvedStageDir, item.key);
			const relativeTarget = relative(resolvedStageDir, targetPath);
			if (relativeTarget.startsWith("..") || relativeTarget === "") {
				throw new Error(
					`Text asset stage target escapes stage directory: ${item.key}`
				);
			}
			await mkdir(dirname(targetPath), { recursive: true });
			await copyFile(item.localPath, targetPath);
		})
	);
	const manifestPath = join(resolvedStageDir, STAGE_MANIFEST_FILE);
	const readmePath = join(resolvedStageDir, STAGE_README_FILE);
	const designerGapReportPath = join(
		resolvedStageDir,
		STAGE_DESIGNER_GAP_REPORT_FILE
	);
	const designerGapChecklistPath = join(
		resolvedStageDir,
		STAGE_DESIGNER_GAP_CHECKLIST_FILE
	);
	const releaseManifest = {
		...buildTextAssetUploadPlanReport({
			generatedAt: new Date().toISOString(),
			items,
			prefix,
		}),
		releaseReadiness,
	};
	await writeFile(
		manifestPath,
		`${JSON.stringify(releaseManifest, null, "\t")}\n`,
		"utf8"
	);
	await writeFile(
		readmePath,
		renderTextAssetReleaseReadme({
			designerGapReport,
			items,
			prefix,
			provenance,
			releaseReadiness,
			requiredDesignerCategories,
		}),
		"utf8"
	);
	if (designerGapReport) {
		await writeDesignerAssetGapReport({
			report: designerGapReport,
			writePath: designerGapReportPath,
		});
		await writeDesignerAssetGapChecklist({
			report: designerGapReport,
			writePath: designerGapChecklistPath,
		});
	}
	return {
		designerGapChecklistPath: designerGapReport
			? designerGapChecklistPath
			: undefined,
		designerGapReportPath: designerGapReport
			? designerGapReportPath
			: undefined,
		fileCount: items.length,
		manifestPath,
	};
}

function renderTextAssetReleaseReadme({
	designerGapReport,
	items,
	prefix,
	provenance,
	releaseReadiness,
	requiredDesignerCategories,
}: {
	designerGapReport?: TextAssetDesignerGapReport;
	items: readonly TextAssetUploadPlanItem[];
	prefix: string;
	provenance?: TextAssetProvenanceSummary;
	releaseReadiness?: TextAssetReleaseReadiness;
	requiredDesignerCategories: readonly string[];
}): string {
	const roleCounts = items.reduce<Record<string, number>>((counts, item) => {
		counts[item.role] = (counts[item.role] ?? 0) + 1;
		return counts;
	}, {});
	const roleRows = Object.entries(roleCounts)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([role, count]) => `| ${role} | ${count} |`)
		.join("\n");
	return `# QCut Text Asset CDN Release

This folder mirrors the CDN object keys for the text asset release. Upload every planned public asset under this folder to the configured bucket using the listed key paths, including \`text-assets/marketplace.json\`.

Do not upload these release handoff files as public CDN assets:

- \`${STAGE_MANIFEST_FILE}\`
- \`${STAGE_README_FILE}\`
- \`${STAGE_DESIGNER_GAP_CHECKLIST_FILE}\`
- \`${STAGE_DESIGNER_GAP_REPORT_FILE}\`

Before publishing, verify the folder and archive:

\`\`\`bash
bun run assets:text:verify-stage
bun run assets:text:verify-archive
\`\`\`

Before treating this as the screenshot-level production text library, verify the designer-ready gate. If it fails, generate the gap report, import the missing designer pack assets, and rebuild this release:

\`\`\`bash
bun run assets:text:proof-designer-ready-release
bun run assets:text:verify-designer-ready
bun run assets:text:designer-gap-report
bun run assets:text:import-designer-ready -- --pack-dir <designer-pack>
bun run assets:text:release-designer-ready-stage
\`\`\`

The staged folder includes \`${STAGE_DESIGNER_GAP_REPORT_FILE}\` for machine-readable coverage and \`${STAGE_DESIGNER_GAP_CHECKLIST_FILE}\` for the design handoff checklist. Together they list the exact designer asset slots needed to reach the screenshot-level library.

After publishing, verify the remote CDN. The first command checks reachability and sizes quickly; the second downloads each object and verifies SHA-256 checksums; the third verifies uploaded object identity metadata when your CDN exposes S3/R2 \`x-amz-meta-*\` headers:

\`\`\`bash
bun run assets:text:proof-remote-release
bun run assets:text:check-remote
bun run assets:text:check-remote-checksum
bun run assets:text:check-remote-metadata
\`\`\`

## Release Summary

| field | value |
| --- | --- |
| prefix | ${prefix || "(none)"} |
| files | ${items.length} |
| bytes | ${items.reduce((total, item) => total + item.size, 0)} |
| designerReady | ${releaseReadiness?.designerReady ? "yes" : "no"} |
| releaseStatus | ${releaseReadiness?.status ?? "(unknown)"} |
| designerImported | ${provenance?.designerImported ?? "(unknown)"} |
| generated | ${provenance?.generated ?? "(unknown)"} |
| designerReadyMissing | ${designerGapReport?.totalMissing ?? "(unknown)"} |
| requiredDesignerCategories | ${requiredDesignerCategories.length || "(not enforced in this release)"} |

## Files By Role

| role | files |
| --- | ---: |
${roleRows}
`;
}

export async function createTextAssetStageArchive({
	archivePath,
	runCommand = runArchiveCommand,
	stagedFileCount,
	stageDir,
}: {
	archivePath: string;
	runCommand?: ({
		args,
		command,
	}: {
		args: string[];
		command: string;
	}) => Promise<void>;
	stagedFileCount: number;
	stageDir: string;
}): Promise<TextAssetStageArchiveSummary> {
	const resolvedArchivePath = resolve(archivePath);
	const resolvedStageDir = resolve(stageDir);
	const archiveRelativeToStage = relative(
		resolvedStageDir,
		resolvedArchivePath
	);
	if (
		archiveRelativeToStage === "" ||
		(!archiveRelativeToStage.startsWith("..") &&
			!archiveRelativeToStage.startsWith("/"))
	) {
		throw new Error("--archive-path must be outside --stage-dir");
	}
	await mkdir(dirname(resolvedArchivePath), { recursive: true });
	await runCommand({
		args: ["-czf", resolvedArchivePath, "-C", resolvedStageDir, "."],
		command: "tar",
	});
	const archiveBytes = await readFile(resolvedArchivePath);
	return {
		archivePath: resolvedArchivePath,
		byteSize: archiveBytes.byteLength,
		fileCount: stagedFileCount + STAGE_RELEASE_METADATA_FILE_COUNT,
		format: "tar.gz",
		sha256: hashBytes({ bytes: archiveBytes }),
	};
}

function buildReleaseSummary({
	stageArchiveBytes,
	stageArchivePath,
	stageArchiveSha256,
	stageArchivedFiles,
	stageDesignerGapChecklistPath,
	stageDesignerGapReportPath,
	designerReadyMissing,
	localIssues,
	manifest,
	manifestPath,
	options,
	provenance,
	remoteIssues,
	stageManifestPath,
	stagedFiles,
	upload,
}: {
	designerReadyMissing: number;
	localIssues: readonly VerifyIssue[];
	manifest: { totalAssets: number; totalBytes: number; totalFiles: number };
	manifestPath: string;
	options: TextAssetReleaseOptions;
	provenance: TextAssetProvenanceSummary;
	remoteIssues: readonly VerifyIssue[];
	stageArchiveBytes?: number;
	stageArchivePath?: string;
	stageArchiveSha256?: string;
	stageArchivedFiles?: number;
	stageDesignerGapChecklistPath?: string;
	stageDesignerGapReportPath?: string;
	stageManifestPath?: string;
	stagedFiles?: number;
	upload: TextAssetUploadSummary;
}): TextAssetReleaseSummary {
	return {
		archiveBytes: stageArchiveBytes,
		archivePath: stageArchivePath,
		archiveSha256: stageArchiveSha256,
		archivedFiles: stageArchivedFiles ?? 0,
		baseUrl: options.baseUrl,
		designerGapChecklistPath: stageDesignerGapChecklistPath,
		designerGapReportPath: stageDesignerGapReportPath,
		designerReady: designerReadyMissing === 0,
		designerReadyMissing,
		dryRun: options.dryRun,
		localIssueSummary: summarizeVerifyIssues({ issues: localIssues })
			.issueSummary,
		localIssues,
		manifestPath,
		minDesignerAssets: options.minDesignerAssets,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		provenance,
		remoteIssueSummary: summarizeVerifyIssues({ issues: remoteIssues })
			.issueSummary,
		remoteIssues,
		requiredDesignerCategories: options.requiredDesignerCategories,
		stageDir: options.stageDir,
		stageManifestPath,
		stagedFiles: stagedFiles ?? 0,
		totalAssets: manifest.totalAssets,
		totalBytes: manifest.totalBytes,
		totalFiles: manifest.totalFiles,
		upload,
		uploadPlanPath: options.uploadPlanPath,
	};
}

function buildTextAssetReleaseReadiness({
	designerGapReport,
	provenance,
	requiredDesignerCategories,
}: {
	designerGapReport: TextAssetDesignerGapReport;
	provenance: TextAssetProvenanceSummary;
	requiredDesignerCategories: readonly string[];
}): TextAssetReleaseReadiness {
	const designerReady = designerGapReport.totalMissing === 0;
	return {
		designerImported: provenance.designerImported,
		designerReady,
		generated: provenance.generated,
		missingDesignerAssets: designerGapReport.totalMissing,
		requiredDesignerCategories,
		status: designerReady ? "designer-ready" : "generated-fallback",
		totalAssets: provenance.total,
	};
}

function hashBytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function runArchiveCommand({
	args,
	command,
}: {
	args: string[];
	command: string;
}): Promise<void> {
	await execFileAsync(command, args, { maxBuffer: 1024 * 1024 });
}

function emptyUploadSummary({
	bucket,
	dryRun,
}: {
	bucket: string;
	dryRun: boolean;
}): TextAssetUploadSummary {
	return {
		bucket,
		dryRun,
		totalBytes: 0,
		totalFiles: 0,
		uploadedFiles: 0,
	};
}

function parseNonNegativeInteger({
	name,
	value,
}: {
	name: string;
	value: string;
}): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} requires a non-negative integer`);
	}
	return parsed;
}

function parsePositiveInteger({
	name,
	value,
}: {
	name: string;
	value: string;
}): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		throw new Error(`${name} requires a positive integer`);
	}
	return parsed;
}

function requireValue({
	argv,
	index,
	name,
}: {
	argv: string[];
	index: number;
	name: string;
}): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`${name} requires a value`);
	return value;
}

async function main(): Promise<void> {
	const options = parseTextAssetReleaseArgs({ argv: process.argv.slice(2) });
	const client = new S3Client({
		endpoint: process.env.QCUT_TEXT_ASSET_S3_ENDPOINT,
		forcePathStyle: process.env.QCUT_TEXT_ASSET_S3_FORCE_PATH_STYLE === "true",
		region: process.env.AWS_REGION ?? "auto",
	});
	const summary = await releaseTextAssetsToCdn({
		options,
		uploadFile: createS3UploadFile({ client }),
	});
	const ok =
		summary.localIssues.length === 0 && summary.remoteIssues.length === 0;
	const localIssues = summarizeVerifyIssues({ issues: summary.localIssues });
	const remoteIssues = summarizeVerifyIssues({ issues: summary.remoteIssues });
	console.log(
		JSON.stringify(
			{
				ok,
				...summary,
				localIssueSummary: localIssues.issueSummary,
				localIssues: localIssues.issues,
				remoteIssueSummary: remoteIssues.issueSummary,
				remoteIssues: remoteIssues.issues,
			},
			null,
			"\t"
		)
	);
	if (!ok) process.exit(1);
}

if (import.meta.main) {
	await main();
}
