import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	mapWithConcurrency,
	verifyLocalFiles,
	type TextAssetPublishFile,
	type TextAssetPublishManifest,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetUploadOptions = {
	bucket: string;
	cacheControl: string;
	concurrency: number;
	dryRun: boolean;
	manifestPath: string;
	prefix: string;
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

type UploadFile = (props: { item: TextAssetUploadPlanItem }) => Promise<void>;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../dist/text-assets-publish-manifest.json"
);
const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

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
		prefix: env.QCUT_TEXT_ASSET_CDN_PREFIX ?? "",
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
		if (arg === "--manifest") {
			options.manifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--prefix") {
			options.prefix = requireValue({ argv, index, name: arg });
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

export function buildTextAssetUploadPlan({
	bucket,
	cacheControl,
	manifest,
	prefix,
}: {
	bucket: string;
	cacheControl: string;
	manifest: TextAssetPublishManifest;
	prefix: string;
}): TextAssetUploadPlanItem[] {
	return manifest.assets.flatMap((asset) =>
		asset.files.map((file) => ({
			bucket,
			cacheControl,
			contentType: file.mimeType,
			key: objectKeyForAssetFile({ file, prefix }),
			localPath: file.localPath,
			role: file.role,
			sha256: file.checksumSha256,
			size: file.byteSize,
		}))
	);
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
	if (issues.length > 0) {
		console.log(JSON.stringify({ issues, ok: false }, null, "\t"));
		process.exit(1);
	}
	const items = buildTextAssetUploadPlan({
		bucket: options.bucket,
		cacheControl: options.cacheControl,
		manifest,
		prefix: options.prefix,
	});
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
	console.log(JSON.stringify({ ok: true, ...summary }, null, "\t"));
}

if (import.meta.main) {
	await main();
}
