import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
	buildTextAssetPublishManifest,
	buildTextMarketplacePublishEntry,
	parseCommaSeparatedList,
	readGeneratedManifest,
	summarizeTextAssetProvenance,
	summarizeVerifyIssues,
	verifyDesignerCategoryCoverage,
	verifyDesignerAssetCoverage,
	verifyLocalFiles,
	verifyRemoteFiles,
	writePublishManifest,
	type TextAssetProvenanceSummary,
	type VerifyIssue,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetReleaseOptions = {
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
	baseUrl: string;
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
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	upload: TextAssetUploadSummary;
	uploadPlanPath?: string;
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
	return options;
}

export async function releaseTextAssetsToCdn({
	options,
	uploadFile,
	verifyRemote = verifyRemoteFiles,
}: {
	options: TextAssetReleaseOptions;
	uploadFile: Parameters<typeof uploadTextAssetPlan>[0]["uploadFile"];
	verifyRemote?: typeof verifyRemoteFiles;
}): Promise<TextAssetReleaseSummary> {
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const marketplace = await buildTextMarketplacePublishEntry({
		baseUrl: options.baseUrl,
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
	const { issues: manifestIssues, manifest } = buildTextAssetPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt: new Date().toISOString(),
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
	const stagedFiles = options.stageDir
		? await stageTextAssetUploadPlan({
				items,
				stageDir: options.stageDir,
			})
		: 0;
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
		localIssues,
		manifest,
		manifestPath: options.publishManifestPath,
		options,
		provenance,
		remoteIssues,
		stagedFiles,
		upload,
	});
}

export async function stageTextAssetUploadPlan({
	items,
	stageDir,
}: {
	items: readonly TextAssetUploadPlanItem[];
	stageDir: string;
}): Promise<number> {
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
	return items.length;
}

function buildReleaseSummary({
	localIssues,
	manifest,
	manifestPath,
	options,
	provenance,
	remoteIssues,
	stagedFiles,
	upload,
}: {
	localIssues: readonly VerifyIssue[];
	manifest: { totalAssets: number; totalBytes: number; totalFiles: number };
	manifestPath: string;
	options: TextAssetReleaseOptions;
	provenance: TextAssetProvenanceSummary;
	remoteIssues: readonly VerifyIssue[];
	stagedFiles?: number;
	upload: TextAssetUploadSummary;
}): TextAssetReleaseSummary {
	return {
		baseUrl: options.baseUrl,
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
		stagedFiles: stagedFiles ?? 0,
		totalAssets: manifest.totalAssets,
		totalBytes: manifest.totalBytes,
		totalFiles: manifest.totalFiles,
		upload,
		uploadPlanPath: options.uploadPlanPath,
	};
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
