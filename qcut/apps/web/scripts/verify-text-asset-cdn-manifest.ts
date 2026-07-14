import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type TextAssetGeneratedFile = {
	url: string;
	mimeType: string;
	byteSize: number;
	checksumSha256: string;
};

type TextAssetGeneratedEntry = {
	assetId: string;
	packageId: string;
	version: number;
	cacheKey: string;
	thumbnail: TextAssetGeneratedFile;
	source: TextAssetGeneratedFile;
	qcutPackage?: TextAssetGeneratedFile;
};

type PublishFileRole = "thumbnail" | "source" | "package";

type TextAssetPublishFile = TextAssetGeneratedFile & {
	cdnUrl: string;
	localPath: string;
	role: PublishFileRole;
};

type TextAssetPublishEntry = {
	assetId: string;
	cacheKey: string;
	files: TextAssetPublishFile[];
	packageId: string;
	version: number;
};

type TextAssetPublishManifest = {
	baseUrl: string;
	generatedAt: string;
	schemaVersion: 1;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	assets: TextAssetPublishEntry[];
};

type VerifyIssue = {
	assetId: string;
	code:
		| "missing-file"
		| "byte-size-mismatch"
		| "checksum-mismatch"
		| "missing-package"
		| "remote-unavailable"
		| "remote-size-mismatch";
	detail: string;
	url?: string;
};

type CliOptions = {
	baseUrl: string;
	checkRemote: boolean;
	manifestPath: string;
	publicDir: string;
	writePath?: string;
};

const DEFAULT_BASE_URL = "https://assets.qcut.app";
const DEFAULT_MANIFEST_PATH = join(
	import.meta.dir,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(import.meta.dir, "../public");

function parseArgs({ argv }: { argv: string[] }): CliOptions {
	const options: CliOptions = {
		baseUrl: process.env.QCUT_TEXT_ASSET_CDN_URL ?? DEFAULT_BASE_URL,
		checkRemote: false,
		manifestPath: DEFAULT_MANIFEST_PATH,
		publicDir: DEFAULT_PUBLIC_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--check-remote") {
			options.checkRemote = true;
			continue;
		}
		if (arg === "--base-url") {
			options.baseUrl = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--manifest") {
			options.manifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--public-dir") {
			options.publicDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--write") {
			options.writePath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
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

function cdnUrl({ baseUrl, url }: { baseUrl: string; url: string }): string {
	return `${baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

function localPath({
	publicDir,
	url,
}: {
	publicDir: string;
	url: string;
}): string {
	return join(publicDir, url.replace(/^\/+/, ""));
}

function hashBytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function readGeneratedManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<Record<string, TextAssetGeneratedEntry>> {
	return JSON.parse(await readFile(manifestPath, "utf8")) as Record<
		string,
		TextAssetGeneratedEntry
	>;
}

function filesForEntry({
	entry,
}: {
	entry: TextAssetGeneratedEntry;
}): Array<{ file?: TextAssetGeneratedFile; role: PublishFileRole }> {
	return [
		{ file: entry.thumbnail, role: "thumbnail" },
		{ file: entry.source, role: "source" },
		{ file: entry.qcutPackage, role: "package" },
	];
}

function buildPublishManifest({
	baseUrl,
	generatedAt,
	generatedManifest,
	publicDir,
}: {
	baseUrl: string;
	generatedAt: string;
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	publicDir: string;
}): { issues: VerifyIssue[]; manifest: TextAssetPublishManifest } {
	const issues: VerifyIssue[] = [];
	const assets: TextAssetPublishEntry[] = [];
	for (const entry of Object.values(generatedManifest).sort((left, right) =>
		left.assetId.localeCompare(right.assetId)
	)) {
		const files: TextAssetPublishFile[] = [];
		for (const { file, role } of filesForEntry({ entry })) {
			if (!file) {
				issues.push({
					assetId: entry.assetId,
					code: "missing-package",
					detail: `Missing ${role} file metadata`,
				});
				continue;
			}
			files.push({
				...file,
				cdnUrl: cdnUrl({ baseUrl, url: file.url }),
				localPath: localPath({ publicDir, url: file.url }),
				role,
			});
		}
		assets.push({
			assetId: entry.assetId,
			cacheKey: entry.cacheKey,
			files,
			packageId: entry.packageId,
			version: entry.version,
		});
	}
	const totalBytes = assets.reduce(
		(total, asset) =>
			total +
			asset.files.reduce((fileTotal, file) => fileTotal + file.byteSize, 0),
		0
	);
	const totalFiles = assets.reduce(
		(total, asset) => total + asset.files.length,
		0
	);
	return {
		issues,
		manifest: {
			assets,
			baseUrl,
			generatedAt,
			schemaVersion: 1,
			totalAssets: assets.length,
			totalBytes,
			totalFiles,
		},
	};
}

async function verifyLocalFiles({
	manifest,
}: {
	manifest: TextAssetPublishManifest;
}): Promise<VerifyIssue[]> {
	const issueGroups = await Promise.all(
		manifest.assets.flatMap((asset) =>
			asset.files.map(async (file): Promise<VerifyIssue[]> => {
				const issues: VerifyIssue[] = [];
				if (!existsSync(file.localPath)) {
					return [
						{
							assetId: asset.assetId,
							code: "missing-file",
							detail: `Missing local file: ${file.localPath}`,
							url: file.url,
						},
					];
				}
				const bytes = await readFile(file.localPath);
				if (bytes.byteLength !== file.byteSize) {
					issues.push({
						assetId: asset.assetId,
						code: "byte-size-mismatch",
						detail: `Expected ${file.byteSize}, received ${bytes.byteLength}`,
						url: file.url,
					});
				}
				const checksum = hashBytes({ bytes });
				if (checksum !== file.checksumSha256) {
					issues.push({
						assetId: asset.assetId,
						code: "checksum-mismatch",
						detail: `Expected ${file.checksumSha256}, received ${checksum}`,
						url: file.url,
					});
				}
				return issues;
			})
		)
	);
	return issueGroups.flat();
}

async function verifyRemoteFiles({
	fetchImpl = fetch,
	manifest,
}: {
	fetchImpl?: typeof fetch;
	manifest: TextAssetPublishManifest;
}): Promise<VerifyIssue[]> {
	const issueGroups = await Promise.all(
		manifest.assets.flatMap((asset) =>
			asset.files.map(async (file): Promise<VerifyIssue[]> => {
				const issues: VerifyIssue[] = [];
				const response = await fetchImpl(file.cdnUrl, { method: "HEAD" });
				if (!response.ok) {
					return [
						{
							assetId: asset.assetId,
							code: "remote-unavailable",
							detail: `HEAD ${file.cdnUrl} returned ${response.status}`,
							url: file.url,
						},
					];
				}
				const contentLength = response.headers.get("content-length");
				if (
					contentLength &&
					Number.parseInt(contentLength, 10) !== file.byteSize
				) {
					issues.push({
						assetId: asset.assetId,
						code: "remote-size-mismatch",
						detail: `Expected ${file.byteSize}, received ${contentLength}`,
						url: file.url,
					});
				}
				return issues;
			})
		)
	);
	return issueGroups.flat();
}

async function writePublishManifest({
	manifest,
	writePath,
}: {
	manifest: TextAssetPublishManifest;
	writePath: string;
}): Promise<void> {
	await mkdir(dirname(writePath), { recursive: true });
	await writeFile(
		writePath,
		`${JSON.stringify(manifest, null, "\t")}\n`,
		"utf8"
	);
}

async function main(): Promise<void> {
	const options = parseArgs({ argv: process.argv.slice(2) });
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.manifestPath,
	});
	const { issues: manifestIssues, manifest } = buildPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt: new Date().toISOString(),
		generatedManifest,
		publicDir: options.publicDir,
	});
	const localIssues = await verifyLocalFiles({ manifest });
	const remoteIssues = options.checkRemote
		? await verifyRemoteFiles({ manifest })
		: [];
	const issues = [...manifestIssues, ...localIssues, ...remoteIssues];
	if (options.writePath) {
		await writePublishManifest({ manifest, writePath: options.writePath });
	}
	console.log(
		JSON.stringify(
			{
				baseUrl: manifest.baseUrl,
				checkRemote: options.checkRemote,
				issues,
				ok: issues.length === 0,
				totalAssets: manifest.totalAssets,
				totalBytes: manifest.totalBytes,
				totalFiles: manifest.totalFiles,
				writePath: options.writePath,
			},
			null,
			"\t"
		)
	);
	if (issues.length > 0) process.exit(1);
}

await main();
