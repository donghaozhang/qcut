import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import {
	buildTextAssetUploadPlan,
	createS3UploadFile,
	uploadTextAssetPlan,
	type TextAssetUploadSummary,
} from "./upload-text-assets-cdn";
import {
	buildTextAssetPublishManifest,
	readGeneratedManifest,
	verifyLocalFiles,
	verifyRemoteFiles,
	writePublishManifest,
	type VerifyIssue,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetReleaseOptions = {
	baseUrl: string;
	bucket: string;
	cacheControl: string;
	dryRun: boolean;
	generatedManifestPath: string;
	prefix: string;
	publishManifestPath: string;
	publicDir: string;
	remoteConcurrency: number;
	skipRemoteCheck: boolean;
	uploadConcurrency: number;
};

export type TextAssetReleaseSummary = {
	baseUrl: string;
	dryRun: boolean;
	localIssues: readonly VerifyIssue[];
	manifestPath: string;
	remoteIssues: readonly VerifyIssue[];
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	upload: TextAssetUploadSummary;
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
		prefix: env.QCUT_TEXT_ASSET_CDN_PREFIX ?? "",
		publishManifestPath:
			env.QCUT_TEXT_ASSET_PUBLISH_MANIFEST ?? DEFAULT_PUBLISH_MANIFEST_PATH,
		publicDir: env.QCUT_TEXT_ASSET_PUBLIC_DIR ?? DEFAULT_PUBLIC_DIR,
		remoteConcurrency: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_REMOTE_CONCURRENCY",
			value: env.QCUT_TEXT_ASSET_REMOTE_CONCURRENCY ?? "16",
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
		if (arg === "--upload-concurrency") {
			options.uploadConcurrency = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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

export async function releaseTextAssetsToCdn({
	options,
	uploadFile,
}: {
	options: TextAssetReleaseOptions;
	uploadFile: Parameters<typeof uploadTextAssetPlan>[0]["uploadFile"];
}): Promise<TextAssetReleaseSummary> {
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.generatedManifestPath,
	});
	const { issues: manifestIssues, manifest } = buildTextAssetPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt: new Date().toISOString(),
		generatedManifest,
		publicDir: options.publicDir,
	});
	await writePublishManifest({
		manifest,
		writePath: options.publishManifestPath,
	});
	const localIssues = [
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
		});
	}
	const items = buildTextAssetUploadPlan({
		bucket: options.bucket,
		cacheControl: options.cacheControl,
		manifest,
		prefix: options.prefix,
	});
	const upload = await uploadTextAssetPlan({
		concurrency: options.uploadConcurrency,
		dryRun: options.dryRun,
		items,
		uploadFile,
	});
	const remoteIssues =
		options.dryRun || options.skipRemoteCheck
			? []
			: await verifyRemoteFiles({
					concurrency: options.remoteConcurrency,
					manifest,
				});
	return buildReleaseSummary({
		localIssues,
		manifest,
		manifestPath: options.publishManifestPath,
		options,
		remoteIssues,
		upload,
	});
}

function buildReleaseSummary({
	localIssues,
	manifest,
	manifestPath,
	options,
	remoteIssues,
	upload,
}: {
	localIssues: readonly VerifyIssue[];
	manifest: { totalAssets: number; totalBytes: number; totalFiles: number };
	manifestPath: string;
	options: TextAssetReleaseOptions;
	remoteIssues: readonly VerifyIssue[];
	upload: TextAssetUploadSummary;
}): TextAssetReleaseSummary {
	return {
		baseUrl: options.baseUrl,
		dryRun: options.dryRun,
		localIssues,
		manifestPath,
		remoteIssues,
		totalAssets: manifest.totalAssets,
		totalBytes: manifest.totalBytes,
		totalFiles: manifest.totalFiles,
		upload,
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
	console.log(JSON.stringify({ ok, ...summary }, null, "\t"));
	if (!ok) process.exit(1);
}

if (import.meta.main) {
	await main();
}
