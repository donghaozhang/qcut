import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	applyTextDesignerReadyPreset,
	mapWithConcurrency,
	parseCommaSeparatedList,
	verifyDesignerAssetCoverage,
	verifyDesignerCategoryCoverage,
	verifyLocalFiles,
	type TextAssetPublishFile,
	type TextAssetPublishManifest,
	type VerifyIssue,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetUploadOptions = {
	bucket: string;
	cacheControl: string;
	concurrency: number;
	dryRun: boolean;
	manifestPath: string;
	metadataCacheControl: string;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	prefix: string;
	requiredDesignerCategories: string[];
	writePlanPath?: string;
};

export type TextAssetUploadPlanItem = {
	bucket: string;
	cacheControl: string;
	contentType: string;
	key: string;
	localPath: string;
	role: TextAssetPublishFile["role"];
	sha256: string;
	size: number;
};

export type TextAssetUploadSummary = {
	bucket: string;
	dryRun: boolean;
	totalBytes: number;
	totalFiles: number;
	uploadedFiles: number;
};

export type TextAssetUploadPlanReport = {
	bucket: string;
	generatedAt: string;
	items: TextAssetUploadPlanItem[];
	prefix: string;
	schemaVersion: 1;
	totalBytes: number;
	totalFiles: number;
};

type UploadFile = (props: { item: TextAssetUploadPlanItem }) => Promise<void>;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../dist/text-assets-publish-manifest.json"
);
const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";
const DEFAULT_METADATA_CACHE_CONTROL =
	"public, max-age=300, stale-while-revalidate=86400";

export function parseTextAssetUploadArgs({
	argv,
	env = process.env,
}: {
	argv: string[];
	env?: NodeJS.ProcessEnv;
}): TextAssetUploadOptions {
	const options: TextAssetUploadOptions = {
		bucket: env.QCUT_TEXT_ASSET_BUCKET ?? "",
		cacheControl: env.QCUT_TEXT_ASSET_CACHE_CONTROL ?? DEFAULT_CACHE_CONTROL,
		concurrency: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_UPLOAD_CONCURRENCY",
			value: env.QCUT_TEXT_ASSET_UPLOAD_CONCURRENCY ?? "8",
		}),
		dryRun: false,
		manifestPath: env.QCUT_TEXT_ASSET_PUBLISH_MANIFEST ?? DEFAULT_MANIFEST_PATH,
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
		requiredDesignerCategories: parseCommaSeparatedList({
			value: env.QCUT_TEXT_ASSET_REQUIRED_DESIGNER_CATEGORIES,
		}),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
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
		if (arg === "--concurrency") {
			options.concurrency = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--designer-ready") {
			Object.assign(options, applyTextDesignerReadyPreset({ options }));
			continue;
		}
		if (arg === "--manifest") {
			options.manifestPath = requireValue({ argv, index, name: arg });
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
		if (arg === "--prefix") {
			options.prefix = requireValue({ argv, index, name: arg });
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
		if (arg === "--write-plan") {
			options.writePlanPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!options.bucket) {
		throw new Error("Missing bucket. Set QCUT_TEXT_ASSET_BUCKET or --bucket.");
	}
	return options;
}

export async function readPublishManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<TextAssetPublishManifest> {
	return JSON.parse(
		await readFile(manifestPath, "utf8")
	) as TextAssetPublishManifest;
}

export function verifyUploadDesignerAssetCoverage({
	manifest,
	minDesignerAssets,
}: {
	manifest: TextAssetPublishManifest;
	minDesignerAssets: number;
}): VerifyIssue[] {
	if (manifest.provenance) {
		return verifyDesignerAssetCoverage({
			minDesignerAssets,
			provenance: manifest.provenance,
		});
	}
	if (minDesignerAssets === 0) return [];
	return [
		{
			assetId: "text-designer-assets",
			code: "designer-import-threshold",
			detail:
				"Publish manifest is missing text asset provenance; regenerate it before enforcing designer asset coverage",
		},
	];
}

export function verifyUploadDesignerCategoryCoverage({
	manifest,
	minDesignerAssetsPerCategory,
	requiredDesignerCategories,
}: {
	manifest: TextAssetPublishManifest;
	minDesignerAssetsPerCategory: number;
	requiredDesignerCategories: readonly string[];
}): VerifyIssue[] {
	return verifyDesignerCategoryCoverage({
		generatedManifest: Object.fromEntries(
			manifest.assets.map((asset) => [asset.assetId, asset])
		),
		minDesignerAssetsPerCategory,
		requiredDesignerCategories,
	});
}

export function buildTextAssetUploadPlan({
	bucket,
	cacheControl,
	manifest,
	metadataCacheControl,
	prefix,
}: {
	bucket: string;
	cacheControl: string;
	manifest: TextAssetPublishManifest;
	metadataCacheControl: string;
	prefix: string;
}): TextAssetUploadPlanItem[] {
	return manifest.assets.flatMap((asset) =>
		asset.files.map((file) => ({
			bucket,
			cacheControl:
				file.role === "metadata" ? metadataCacheControl : cacheControl,
			contentType: file.mimeType,
			key: objectKeyForAssetFile({ file, prefix }),
			localPath: file.localPath,
			role: file.role,
			sha256: file.checksumSha256,
			size: file.byteSize,
		}))
	);
}

export function buildTextAssetUploadPlanReport({
	generatedAt,
	items,
	prefix,
}: {
	generatedAt: string;
	items: readonly TextAssetUploadPlanItem[];
	prefix: string;
}): TextAssetUploadPlanReport {
	return {
		bucket: items[0]?.bucket ?? "",
		generatedAt,
		items: [...items],
		prefix,
		schemaVersion: 1,
		totalBytes: items.reduce((total, item) => total + item.size, 0),
		totalFiles: items.length,
	};
}

export async function writeTextAssetUploadPlanReport({
	report,
	writePath,
}: {
	report: TextAssetUploadPlanReport;
	writePath: string;
}): Promise<void> {
	await mkdir(dirname(writePath), { recursive: true });
	await writeFile(writePath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
}

export async function uploadTextAssetPlan({
	concurrency,
	dryRun,
	items,
	uploadFile,
}: {
	concurrency: number;
	dryRun: boolean;
	items: readonly TextAssetUploadPlanItem[];
	uploadFile: UploadFile;
}): Promise<TextAssetUploadSummary> {
	if (!dryRun) {
		await mapWithConcurrency({
			concurrency,
			items,
			mapper: (item) => uploadFile({ item }),
		});
	}
	const totalBytes = items.reduce((total, item) => total + item.size, 0);
	return {
		bucket: items[0]?.bucket ?? "",
		dryRun,
		totalBytes,
		totalFiles: items.length,
		uploadedFiles: dryRun ? 0 : items.length,
	};
}

export function createS3UploadFile({
	client,
}: {
	client: S3Client;
}): UploadFile {
	return async ({ item }) => {
		await client.send(
			new PutObjectCommand({
				Body: await readFile(item.localPath),
				Bucket: item.bucket,
				CacheControl: item.cacheControl,
				ContentType: item.contentType,
				Key: item.key,
				Metadata: {
					"qcut-role": item.role,
					"sha256": item.sha256,
				},
			})
		);
	};
}

function objectKeyForAssetFile({
	file,
	prefix,
}: {
	file: TextAssetPublishFile;
	prefix: string;
}): string {
	const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
	const cleanUrl = file.url.replace(/^\/+/, "");
	return cleanPrefix ? `${cleanPrefix}/${cleanUrl}` : cleanUrl;
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
	const options = parseTextAssetUploadArgs({ argv: process.argv.slice(2) });
	const manifest = await readPublishManifest({
		manifestPath: options.manifestPath,
	});
	const issues = await verifyLocalFiles({ manifest });
	const designerCoverageIssues = verifyUploadDesignerAssetCoverage({
		manifest,
		minDesignerAssets: options.minDesignerAssets,
	});
	const designerCategoryIssues = verifyUploadDesignerCategoryCoverage({
		manifest,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const allIssues = [
		...designerCoverageIssues,
		...designerCategoryIssues,
		...issues,
	];
	if (allIssues.length > 0) {
		console.log(JSON.stringify({ issues: allIssues, ok: false }, null, "\t"));
		process.exit(1);
	}
	const items = buildTextAssetUploadPlan({
		bucket: options.bucket,
		cacheControl: options.cacheControl,
		manifest,
		metadataCacheControl: options.metadataCacheControl,
		prefix: options.prefix,
	});
	if (options.writePlanPath) {
		await writeTextAssetUploadPlanReport({
			report: buildTextAssetUploadPlanReport({
				generatedAt: new Date().toISOString(),
				items,
				prefix: options.prefix,
			}),
			writePath: options.writePlanPath,
		});
	}
	const client = new S3Client({
		endpoint: process.env.QCUT_TEXT_ASSET_S3_ENDPOINT,
		forcePathStyle: process.env.QCUT_TEXT_ASSET_S3_FORCE_PATH_STYLE === "true",
		region: process.env.AWS_REGION ?? "auto",
	});
	const summary = await uploadTextAssetPlan({
		concurrency: options.concurrency,
		dryRun: options.dryRun,
		items,
		uploadFile: createS3UploadFile({ client }),
	});
	console.log(
		JSON.stringify(
			{
				ok: true,
				minDesignerAssets: options.minDesignerAssets,
				minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
				provenance: manifest.provenance,
				requiredDesignerCategories: options.requiredDesignerCategories,
				writePlanPath: options.writePlanPath,
				...summary,
			},
			null,
			"\t"
		)
	);
}

if (import.meta.main) {
	await main();
}
