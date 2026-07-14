import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type TextAssetGeneratedFile = {
	url: string;
	mimeType: string;
	byteSize: number;
	checksumSha256: string;
};

export type TextAssetGeneratedEntry = {
	assetId: string;
	packageId: string;
	version: number;
	cacheKey: string;
	provenance?: TextAssetProvenance;
	thumbnail: TextAssetGeneratedFile;
	source: TextAssetGeneratedFile;
	qcutPackage?: TextAssetGeneratedFile;
};

export type TextAssetProvenance = {
	source: "generated" | "designer-imported";
	pipeline: string;
};

export type PublishFileRole = "thumbnail" | "source" | "package" | "metadata";

export type TextAssetPublishFile = TextAssetGeneratedFile & {
	cdnUrl: string;
	localPath: string;
	role: PublishFileRole;
};

export type TextAssetPublishEntry = {
	assetId: string;
	cacheKey: string;
	files: TextAssetPublishFile[];
	packageId: string;
	version: number;
};

export type TextAssetPublishManifest = {
	baseUrl: string;
	generatedAt: string;
	schemaVersion: 1;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	assets: TextAssetPublishEntry[];
};

export type VerifyIssue = {
	assetId: string;
	code:
		| "missing-file"
		| "byte-size-mismatch"
		| "checksum-mismatch"
		| "missing-package"
		| "designer-import-threshold"
		| "remote-unavailable"
		| "remote-size-mismatch";
	detail: string;
	url?: string;
};

export type TextAssetProvenanceSummary = {
	designerImported: number;
	generated: number;
	missingProvenance: number;
	pipelines: Record<string, number>;
	total: number;
};

export type TextAssetCdnCliOptions = {
	baseUrl: string;
	checkRemote: boolean;
	manifestPath: string;
	minDesignerAssets: number;
	publicDir: string;
	remoteConcurrency: number;
	writePath?: string;
};

const DEFAULT_BASE_URL = "https://assets.qcut.app";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");

export function parseTextAssetCdnArgs({
	argv,
}: {
	argv: string[];
}): TextAssetCdnCliOptions {
	const options: TextAssetCdnCliOptions = {
		baseUrl: process.env.QCUT_TEXT_ASSET_CDN_URL ?? DEFAULT_BASE_URL,
		checkRemote: false,
		manifestPath: DEFAULT_MANIFEST_PATH,
		minDesignerAssets: 0,
		publicDir: DEFAULT_PUBLIC_DIR,
		remoteConcurrency: 16,
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
		if (arg === "--min-designer-assets") {
			options.minDesignerAssets = parseNonNegativeInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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
		if (arg === "--write") {
			options.writePath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
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

export async function readGeneratedManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<Record<string, TextAssetGeneratedEntry>> {
	return JSON.parse(await readFile(manifestPath, "utf8")) as Record<
		string,
		TextAssetGeneratedEntry
	>;
}

export function summarizeTextAssetProvenance({
	generatedManifest,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
}): TextAssetProvenanceSummary {
	const summary: TextAssetProvenanceSummary = {
		designerImported: 0,
		generated: 0,
		missingProvenance: 0,
		pipelines: {},
		total: 0,
	};
	for (const entry of Object.values(generatedManifest)) {
		summary.total += 1;
		const provenance = entry.provenance;
		if (!provenance) {
			summary.missingProvenance += 1;
			summary.pipelines.missing = (summary.pipelines.missing ?? 0) + 1;
			continue;
		}
		if (provenance.source === "designer-imported") {
			summary.designerImported += 1;
		}
		if (provenance.source === "generated") {
			summary.generated += 1;
		}
		const pipeline = provenance.pipeline || "unknown";
		summary.pipelines[pipeline] = (summary.pipelines[pipeline] ?? 0) + 1;
	}
	return summary;
}

export function verifyDesignerAssetCoverage({
	minDesignerAssets,
	provenance,
}: {
	minDesignerAssets: number;
	provenance: TextAssetProvenanceSummary;
}): VerifyIssue[] {
	if (provenance.designerImported >= minDesignerAssets) return [];
	return [
		{
			assetId: "text-designer-assets",
			code: "designer-import-threshold",
			detail: `Expected at least ${minDesignerAssets} designer-imported text assets, received ${provenance.designerImported}`,
		},
	];
}

export function filesForEntry({
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

export function buildTextAssetPublishManifest({
	baseUrl,
	generatedAt,
	generatedManifest,
	publicDir,
	supplementalAssets = [],
}: {
	baseUrl: string;
	generatedAt: string;
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	publicDir: string;
	supplementalAssets?: readonly TextAssetPublishEntry[];
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
	assets.push(...supplementalAssets);
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

export async function buildTextMarketplacePublishEntry({
	baseUrl,
	publicDir,
}: {
	baseUrl: string;
	publicDir: string;
}): Promise<{ entry?: TextAssetPublishEntry; issues: VerifyIssue[] }> {
	const url = "/text-assets/marketplace.json";
	const localMarketplacePath = localPath({ publicDir, url });
	if (!existsSync(localMarketplacePath)) {
		return {
			issues: [
				{
					assetId: "text-marketplace-config",
					code: "missing-file",
					detail: `Missing local file: ${localMarketplacePath}`,
					url,
				},
			],
		};
	}
	const bytes = await readFile(localMarketplacePath);
	return {
		entry: {
			assetId: "text-marketplace-config",
			cacheKey: "text-assets",
			files: [
				{
					byteSize: bytes.byteLength,
					cdnUrl: cdnUrl({ baseUrl, url }),
					checksumSha256: hashBytes({ bytes }),
					localPath: localMarketplacePath,
					mimeType: "application/json",
					role: "metadata",
					url,
				},
			],
			packageId: "text-marketplace-config",
			version: 1,
		},
		issues: [],
	};
}

export async function verifyLocalFiles({
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

export async function verifyRemoteFiles({
	concurrency = 16,
	fetchImpl = fetch,
	manifest,
}: {
	concurrency?: number;
	fetchImpl?: typeof fetch;
	manifest: TextAssetPublishManifest;
}): Promise<VerifyIssue[]> {
	const files = manifest.assets.flatMap((asset) =>
		asset.files.map((file) => ({ asset, file }))
	);
	const issueGroups = await mapWithConcurrency({
		concurrency,
		items: files,
		mapper: async ({ asset, file }): Promise<VerifyIssue[]> => {
			const issues: VerifyIssue[] = [];
			let response: Response;
			try {
				response = await fetchImpl(file.cdnUrl, { method: "HEAD" });
			} catch (error) {
				return [
					{
						assetId: asset.assetId,
						code: "remote-unavailable",
						detail: `HEAD ${file.cdnUrl} failed: ${remoteFetchErrorDetail({ error })}`,
						url: file.url,
					},
				];
			}
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
		},
	});
	return issueGroups.flat();
}

function remoteFetchErrorDetail({ error }: { error: unknown }): string {
	if (error instanceof Error && error.message) return error.message;
	return String(error);
}

export async function mapWithConcurrency<TItem, TResult>({
	concurrency,
	items,
	mapper,
}: {
	concurrency: number;
	items: readonly TItem[];
	mapper: (item: TItem) => Promise<TResult>;
}): Promise<TResult[]> {
	if (!Number.isFinite(concurrency) || concurrency < 1) {
		throw new Error("concurrency must be a positive integer");
	}
	if (items.length === 0) return [];
	const results: TResult[] = [];
	let nextIndex = 0;
	const workerCount = Math.min(concurrency, items.length);
	const runNext = (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const item = items[index];
		if (item === undefined) return Promise.resolve();
		return mapper(item).then((result) => {
			results[index] = result;
			return runNext();
		});
	};
	await Promise.all(Array.from({ length: workerCount }, runNext));
	return results;
}

export async function writePublishManifest({
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
	const options = parseTextAssetCdnArgs({ argv: process.argv.slice(2) });
	const generatedManifest = await readGeneratedManifest({
		manifestPath: options.manifestPath,
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
	const { issues: manifestIssues, manifest } = buildTextAssetPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt: new Date().toISOString(),
		generatedManifest,
		publicDir: options.publicDir,
		supplementalAssets: marketplace.entry ? [marketplace.entry] : [],
	});
	const localIssues = await verifyLocalFiles({ manifest });
	const remoteIssues = options.checkRemote
		? await verifyRemoteFiles({
				concurrency: options.remoteConcurrency,
				manifest,
			})
		: [];
	const issues = [
		...marketplace.issues,
		...designerCoverageIssues,
		...manifestIssues,
		...localIssues,
		...remoteIssues,
	];
	if (options.writePath) {
		await writePublishManifest({ manifest, writePath: options.writePath });
	}
	console.log(
		JSON.stringify(
			{
				baseUrl: manifest.baseUrl,
				checkRemote: options.checkRemote,
				issues,
				minDesignerAssets: options.minDesignerAssets,
				ok: issues.length === 0,
				provenance,
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

if (import.meta.main) {
	await main();
}
