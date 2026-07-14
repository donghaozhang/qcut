import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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

export type TextAssetCategoryEntry = {
	cacheKey: string;
	packageId: string;
	provenance?: TextAssetProvenance;
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
	provenance?: TextAssetProvenance;
	version: number;
};

export type TextAssetPublishManifest = {
	baseUrl: string;
	generatedAt: string;
	schemaVersion: 1;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
	provenance?: TextAssetProvenanceSummary;
	assets: TextAssetPublishEntry[];
};

export type VerifyIssue = {
	assetId: string;
	code:
		| "missing-file"
		| "byte-size-mismatch"
		| "checksum-mismatch"
		| "invalid-file-payload"
		| "missing-package"
		| "designer-category-coverage"
		| "designer-import-threshold"
		| "virtual-resource-url"
		| "remote-unavailable"
		| "remote-checksum-mismatch"
		| "remote-size-mismatch";
	detail: string;
	url?: string;
};

export type VerifyIssueSummary = {
	byCode: Partial<Record<VerifyIssue["code"], number>>;
	count: number;
	truncated: number;
};

export type TextAssetProvenanceSummary = {
	designerImported: number;
	generated: number;
	missingProvenance: number;
	pipelines: Record<string, number>;
	total: number;
};

export type TextAssetDesignerCategoryCoverageItem = {
	category: string;
	current: number;
	missing: number;
	required: number;
};

export type TextAssetDesignerCategoryCoverageSummary = {
	categories: TextAssetDesignerCategoryCoverageItem[];
	ok: boolean;
	requiredCategories: number;
	totalMissing: number;
};

export type TextAssetDesignerImportSlot = {
	assetId: string;
	cacheKey: string;
	packageId: string;
	requiredFilePaths: readonly [
		`${string}/thumbnail.webp`,
		`${string}/template.json`,
		`${string}/template.qctext`,
	];
	requiredFiles: readonly [
		"thumbnail.webp",
		"template.json",
		"template.qctext",
	];
	targetDirectory: string;
	variantId: string;
};

export type TextAssetDesignerGapReportCategory =
	TextAssetDesignerCategoryCoverageItem & {
		suggestedImports: TextAssetDesignerImportSlot[];
	};

export type TextAssetDesignerGapReport = {
	categories: TextAssetDesignerGapReportCategory[];
	generatedAt: string;
	minDesignerAssetsPerCategory: number;
	requiredDesignerCategories: string[];
	schemaVersion: 1;
	totalMissing: number;
};

export type TextAssetCdnCliOptions = {
	allowDesignerGaps: boolean;
	baseUrl: string;
	checkRemote: boolean;
	checkRemoteChecksum: boolean;
	fullIssues: boolean;
	issueLimit: number;
	manifestPath: string;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	publicDir: string;
	remoteConcurrency: number;
	requiredDesignerCategories: string[];
	writeDesignerGapReportPath?: string;
	writePath?: string;
};

const DEFAULT_BASE_URL = "https://assets.qcut.app";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const EXPECTED_TEXT_THUMBNAIL_HEIGHT = 304;
const EXPECTED_TEXT_THUMBNAIL_WIDTH = 320;

export function parseTextAssetCdnArgs({
	argv,
}: {
	argv: string[];
}): TextAssetCdnCliOptions {
	const options: TextAssetCdnCliOptions = {
		allowDesignerGaps: false,
		baseUrl: process.env.QCUT_TEXT_ASSET_CDN_URL ?? DEFAULT_BASE_URL,
		checkRemote: false,
		checkRemoteChecksum: false,
		fullIssues: false,
		issueLimit: 25,
		manifestPath: DEFAULT_MANIFEST_PATH,
		minDesignerAssets: 0,
		minDesignerAssetsPerCategory: parsePositiveInteger({
			name: "QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS_PER_CATEGORY",
			value:
				process.env.QCUT_TEXT_ASSET_MIN_DESIGNER_ASSETS_PER_CATEGORY ?? "1",
		}),
		publicDir: DEFAULT_PUBLIC_DIR,
		remoteConcurrency: 16,
		requiredDesignerCategories: parseCommaSeparatedList({
			value: process.env.QCUT_TEXT_ASSET_REQUIRED_DESIGNER_CATEGORIES,
		}),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--allow-designer-gaps") {
			options.allowDesignerGaps = true;
			continue;
		}
		if (arg === "--check-remote") {
			options.checkRemote = true;
			continue;
		}
		if (arg === "--check-remote-checksum") {
			options.checkRemote = true;
			options.checkRemoteChecksum = true;
			continue;
		}
		if (arg === "--full-issues") {
			options.fullIssues = true;
			continue;
		}
		if (arg === "--base-url") {
			options.baseUrl = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--issue-limit") {
			options.issueLimit = parseNonNegativeInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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
		if (arg === "--write-designer-gap-report") {
			options.writeDesignerGapReportPath = requireValue({
				argv,
				index,
				name: arg,
			});
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

export function parseCommaSeparatedList({
	name = "comma-separated list",
	value,
}: {
	name?: string;
	value?: string;
}): string[] {
	if (!value) return [];
	const values = value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	if (values.length === 0 && value.trim()) {
		throw new Error(`${name} requires at least one value`);
	}
	return [...new Set(values)];
}

export function parseNonNegativeInteger({
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

export function parsePositiveInteger({
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

function isVirtualTextAssetUrl({ url }: { url: string }): boolean {
	return url.startsWith("qcut-text-asset://");
}

function verifyPublishFileUrl({
	assetId,
	role,
	url,
}: {
	assetId: string;
	role: PublishFileRole;
	url: string;
}): VerifyIssue | null {
	if (!isVirtualTextAssetUrl({ url })) return null;
	return {
		assetId,
		code: "virtual-resource-url",
		detail: `${role} file must reference a concrete CDN/cache path, received virtual text asset URL`,
		url,
	};
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

const TEXT_ASSET_PACKAGE_PREFIXES = [
	"text-smart-packaging-",
	"text-smart-text-",
	"text-new-text-",
	"text-templates-",
	"text-fancy-",
	"text-mine-",
] as const;

export function inferTextAssetCategory({
	entry,
}: {
	entry: TextAssetCategoryEntry;
}): string | undefined {
	const packageIdCategory = inferTextAssetCategoryFromPackageId({
		packageId: entry.packageId,
	});
	if (packageIdCategory) return packageIdCategory;
	const [cachePackageId] = entry.cacheKey
		.replace(/^\/+/, "")
		.split("/")
		.slice(1, 2);
	if (!cachePackageId) return undefined;
	return inferTextAssetCategoryFromPackageId({ packageId: cachePackageId });
}

function inferTextAssetCategoryFromPackageId({
	packageId,
}: {
	packageId: string;
}): string | undefined {
	for (const prefix of TEXT_ASSET_PACKAGE_PREFIXES) {
		if (!packageId.startsWith(prefix)) continue;
		const category = packageId.slice(prefix.length);
		return category || undefined;
	}
	return undefined;
}

export function verifyDesignerCategoryCoverage({
	generatedManifest,
	minDesignerAssetsPerCategory = 1,
	requiredDesignerCategories,
}: {
	generatedManifest: Record<string, TextAssetCategoryEntry>;
	minDesignerAssetsPerCategory?: number;
	requiredDesignerCategories: readonly string[];
}): VerifyIssue[] {
	if (requiredDesignerCategories.length === 0) return [];
	const coverage = summarizeDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory,
		requiredDesignerCategories,
	});
	const missingCategories = coverage.categories.filter(
		(category) => category.missing > 0
	);
	if (missingCategories.length === 0) return [];
	return [
		{
			assetId: "text-designer-assets",
			code: "designer-category-coverage",
			detail: `Expected at least ${minDesignerAssetsPerCategory} designer-imported text assets for each category, missing: ${missingCategories
				.map((category) => `${category.category} (${category.current})`)
				.join(", ")}`,
		},
	];
}

export function summarizeDesignerCategoryCoverage({
	generatedManifest,
	minDesignerAssetsPerCategory = 1,
	requiredDesignerCategories,
}: {
	generatedManifest: Record<string, TextAssetCategoryEntry>;
	minDesignerAssetsPerCategory?: number;
	requiredDesignerCategories: readonly string[];
}): TextAssetDesignerCategoryCoverageSummary {
	const designerCountsByCategory = new Map<string, number>();
	for (const entry of Object.values(generatedManifest)) {
		if (entry.provenance?.source !== "designer-imported") continue;
		const category = inferTextAssetCategory({ entry });
		if (!category) continue;
		designerCountsByCategory.set(
			category,
			(designerCountsByCategory.get(category) ?? 0) + 1
		);
	}
	const categories = requiredDesignerCategories.map((category) => {
		const current = designerCountsByCategory.get(category) ?? 0;
		return {
			category,
			current,
			missing: Math.max(0, minDesignerAssetsPerCategory - current),
			required: minDesignerAssetsPerCategory,
		};
	});
	const totalMissing = categories.reduce(
		(total, category) => total + category.missing,
		0
	);
	return {
		categories,
		ok: totalMissing === 0,
		requiredCategories: requiredDesignerCategories.length,
		totalMissing,
	};
}

export function buildDesignerAssetGapReport({
	coverage,
	generatedAt,
	minDesignerAssetsPerCategory,
	requiredDesignerCategories,
}: {
	coverage: TextAssetDesignerCategoryCoverageSummary;
	generatedAt: string;
	minDesignerAssetsPerCategory: number;
	requiredDesignerCategories: readonly string[];
}): TextAssetDesignerGapReport {
	return {
		categories: coverage.categories.map((category) => ({
			...category,
			suggestedImports: buildDesignerAssetImportSlots({ category }),
		})),
		generatedAt,
		minDesignerAssetsPerCategory,
		requiredDesignerCategories: [...requiredDesignerCategories],
		schemaVersion: 1,
		totalMissing: coverage.totalMissing,
	};
}

function buildDesignerAssetImportSlots({
	category,
}: {
	category: TextAssetDesignerCategoryCoverageItem;
}): TextAssetDesignerImportSlot[] {
	const packageId = packageIdForDesignerCategory({
		category: category.category,
	});
	return Array.from({ length: category.missing }, (_, index) => {
		const importNumber = category.current + index + 1;
		const variantId = `designer-${String(importNumber).padStart(2, "0")}`;
		const targetDirectory = `text-assets/${packageId}/${variantId}@1`;
		return {
			assetId: `${packageId}-${variantId}`,
			cacheKey: targetDirectory,
			packageId,
			requiredFilePaths: [
				`${targetDirectory}/thumbnail.webp`,
				`${targetDirectory}/template.json`,
				`${targetDirectory}/template.qctext`,
			],
			requiredFiles: ["thumbnail.webp", "template.json", "template.qctext"],
			targetDirectory,
			variantId,
		};
	});
}

function packageIdForDesignerCategory({
	category,
}: {
	category: string;
}): string {
	if (
		category === "headline-template" ||
		category === "quote-template" ||
		category === "list-template" ||
		category === "split-template" ||
		category === "timeline-template"
	) {
		return `text-templates-${category}`;
	}
	return `text-fancy-${category}`;
}

export function summarizeVerifyIssues({
	issues,
	limit = 25,
}: {
	issues: readonly VerifyIssue[];
	limit?: number;
}): {
	issueSummary: VerifyIssueSummary;
	issues: VerifyIssue[];
} {
	const byCode = issues.reduce<Partial<Record<VerifyIssue["code"], number>>>(
		(summary, issue) => {
			summary[issue.code] = (summary[issue.code] ?? 0) + 1;
			return summary;
		},
		{}
	);
	const sampleLimit = Math.max(0, Math.floor(limit));
	return {
		issueSummary: {
			byCode,
			count: issues.length,
			truncated: Math.max(0, issues.length - sampleLimit),
		},
		issues: issues.slice(0, sampleLimit),
	};
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
			const urlIssue = verifyPublishFileUrl({
				assetId: entry.assetId,
				role,
				url: file.url,
			});
			if (urlIssue) issues.push(urlIssue);
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
			provenance: entry.provenance,
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
			provenance: summarizeTextAssetProvenance({ generatedManifest }),
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
				const payloadIssue = verifyLocalFilePayload({
					asset,
					bytes,
					file,
				});
				if (payloadIssue) issues.push(payloadIssue);
				return issues;
			})
		)
	);
	return issueGroups.flat();
}

function verifyLocalFilePayload({
	asset,
	bytes,
	file,
}: {
	asset: TextAssetPublishEntry;
	bytes: Buffer;
	file: TextAssetPublishFile;
}): VerifyIssue | null {
	if (file.role === "thumbnail") {
		return verifyThumbnailPayload({ asset, bytes, file });
	}
	if (file.role === "metadata") {
		const parsed = parseJsonObjectPayload({
			assetId: asset.assetId,
			bytes,
			role: file.role,
			url: file.url,
		});
		return parsed.issue ?? null;
	}
	if (file.role === "source") {
		const parsed = parseJsonObjectPayload({
			assetId: asset.assetId,
			bytes,
			role: file.role,
			url: file.url,
		});
		if (parsed.issue) return parsed.issue;
		return (
			verifyTextAssetIdentity({
				asset,
				payload: parsed.payload,
				role: "source",
				url: file.url,
			}) ??
			verifyTextAssetTemplatePayload({
				asset,
				payload: parsed.payload,
				role: "source",
				url: file.url,
			})
		);
	}
	if (file.role === "package") {
		const parsed = parseJsonObjectPayload({
			assetId: asset.assetId,
			bytes,
			role: file.role,
			url: file.url,
		});
		if (parsed.issue) return parsed.issue;
		const payload = parsed.payload;
		if (payload.kind !== "qcut-text-template-package") {
			return {
				assetId: asset.assetId,
				code: "invalid-file-payload",
				detail: "QCut text package must use qcut-text-template-package",
				url: file.url,
			};
		}
		const identityIssue = verifyTextAssetIdentity({
			asset,
			payload,
			role: "package",
			url: file.url,
		});
		if (identityIssue) return identityIssue;
		const cacheKeyIssue = verifyTextAssetPackageCacheKey({
			asset,
			payload,
			url: file.url,
		});
		if (cacheKeyIssue) return cacheKeyIssue;
		const fileReferenceIssue = verifyTextAssetPackageFileReferences({
			asset,
			payload,
			url: file.url,
		});
		if (fileReferenceIssue) return fileReferenceIssue;
		const source = isRecord({ value: payload.source }) ? payload.source : null;
		if (!source) {
			return {
				assetId: asset.assetId,
				code: "invalid-file-payload",
				detail: "QCut text package source must be a JSON object",
				url: file.url,
			};
		}
		return (
			verifyTextAssetIdentity({
				asset,
				payload: source,
				role: "package source",
				url: file.url,
			}) ??
			verifyTextAssetTemplatePayload({
				asset,
				payload: source,
				role: "package source",
				url: file.url,
			})
		);
	}
	return null;
}

function verifyThumbnailPayload({
	asset,
	bytes,
	file,
}: {
	asset: TextAssetPublishEntry;
	bytes: Buffer;
	file: TextAssetPublishFile;
}): VerifyIssue | null {
	if (!isWebpBytes({ bytes })) {
		return {
			assetId: asset.assetId,
			code: "invalid-file-payload",
			detail: "Thumbnail file is not a valid WebP payload",
			url: file.url,
		};
	}
	const dimensions = getWebpDimensions({ bytes });
	if (!dimensions) {
		return {
			assetId: asset.assetId,
			code: "invalid-file-payload",
			detail: "Thumbnail WebP dimensions could not be read",
			url: file.url,
		};
	}
	if (
		dimensions.width === EXPECTED_TEXT_THUMBNAIL_WIDTH &&
		dimensions.height === EXPECTED_TEXT_THUMBNAIL_HEIGHT
	) {
		return null;
	}
	return {
		assetId: asset.assetId,
		code: "invalid-file-payload",
		detail: `Thumbnail dimensions expected ${EXPECTED_TEXT_THUMBNAIL_WIDTH}x${EXPECTED_TEXT_THUMBNAIL_HEIGHT}, received ${dimensions.width}x${dimensions.height}`,
		url: file.url,
	};
}

function parseJsonObjectPayload({
	assetId,
	bytes,
	role,
	url,
}: {
	assetId: string;
	bytes: Buffer;
	role: PublishFileRole;
	url: string;
}):
	| { issue: VerifyIssue; payload?: never }
	| { issue?: never; payload: Record<string, unknown> } {
	try {
		const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return { payload: parsed as Record<string, unknown> };
		}
		return {
			issue: {
				assetId,
				code: "invalid-file-payload",
				detail: `${role} file must be a JSON object`,
				url,
			},
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			issue: {
				assetId,
				code: "invalid-file-payload",
				detail: `Invalid ${role} JSON: ${detail}`,
				url,
			},
		};
	}
}

function verifyTextAssetIdentity({
	asset,
	payload,
	role,
	url,
}: {
	asset: TextAssetPublishEntry;
	payload: Record<string, unknown>;
	role: string;
	url: string;
}): VerifyIssue | null {
	const mismatches = [
		fieldMismatch({
			actual: payload.assetId,
			expected: asset.assetId,
			field: "assetId",
		}),
		fieldMismatch({
			actual: payload.packageId,
			expected: asset.packageId,
			field: "packageId",
		}),
		fieldMismatch({
			actual: payload.version,
			expected: asset.version,
			field: "version",
		}),
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length === 0) return null;
	return {
		assetId: asset.assetId,
		code: "invalid-file-payload",
		detail: `${role} identity mismatch: ${mismatches.join(", ")}`,
		url,
	};
}

function verifyTextAssetTemplatePayload({
	asset,
	payload,
	role,
	url,
}: {
	asset: TextAssetPublishEntry;
	payload: Record<string, unknown>;
	role: string;
	url: string;
}): VerifyIssue | null {
	const templateIssue = textTemplatePayloadIssue({
		label: `${role} template`,
		value: payload.template,
	});
	if (templateIssue) {
		return {
			assetId: asset.assetId,
			code: "invalid-file-payload",
			detail: templateIssue,
			url,
		};
	}
	const templatePackIssue = textTemplatePackPayloadIssue({
		label: `${role} templatePack`,
		value: payload.templatePack,
	});
	if (!templatePackIssue) return null;
	return {
		assetId: asset.assetId,
		code: "invalid-file-payload",
		detail: templatePackIssue,
		url,
	};
}

function textTemplatePayloadIssue({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string | null {
	const template = isRecord({ value }) ? value : null;
	if (!template || template.type !== "text") {
		return `${label} must be a text element`;
	}
	const missingFields = ["id", "name", "content"].filter((field) => {
		const fieldValue = template[field];
		return typeof fieldValue !== "string" || fieldValue.length === 0;
	});
	return missingFields.length === 0
		? null
		: `${label} missing text fields: ${missingFields.join(", ")}`;
}

function textTemplatePackPayloadIssue({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string | null {
	if (value === undefined) return null;
	const pack = isRecord({ value }) ? value : null;
	if (!pack) return `${label} must be a JSON object`;
	const missingFields = ["id", "name", "category"].filter((field) => {
		const fieldValue = pack[field];
		return typeof fieldValue !== "string" || fieldValue.length === 0;
	});
	if (missingFields.length > 0) {
		return `${label} missing fields: ${missingFields.join(", ")}`;
	}
	if (!Array.isArray(pack.elements)) {
		return `${label} elements must be an array`;
	}
	for (const [index, element] of pack.elements.entries()) {
		const elementIssue = textTemplatePayloadIssue({
			label: `${label} element ${index}`,
			value: element,
		});
		if (elementIssue) return elementIssue;
	}
	return textTemplatePackCopySlotsIssue({
		elementCount: pack.elements.length,
		label,
		value: pack.copySlots,
	});
}

function textTemplatePackCopySlotsIssue({
	elementCount,
	label,
	value,
}: {
	elementCount: number;
	label: string;
	value: unknown;
}): string | null {
	if (value === undefined) return null;
	if (!Array.isArray(value)) return `${label} copySlots must be an array`;
	for (const [index, slot] of value.entries()) {
		const record = isRecord({ value: slot }) ? slot : null;
		if (!record) return `${label} copy slot ${index} must be a JSON object`;
		const missingFields = ["id", "label", "defaultContent"].filter(
			(field) => typeof record[field] !== "string"
		);
		if (missingFields.length > 0) {
			return `${label} copy slot ${index} missing fields: ${missingFields.join(", ")}`;
		}
		const elementIndex = record.elementIndex;
		if (!Number.isInteger(elementIndex)) {
			return `${label} copy slot ${index} elementIndex must be an integer`;
		}
		if (elementIndex < 0 || elementIndex >= elementCount) {
			return `${label} copy slot ${index} elementIndex is out of range`;
		}
	}
	return null;
}

function verifyTextAssetPackageCacheKey({
	asset,
	payload,
	url,
}: {
	asset: TextAssetPublishEntry;
	payload: Record<string, unknown>;
	url: string;
}): VerifyIssue | null {
	if (payload.cacheKey === asset.cacheKey) return null;
	return {
		assetId: asset.assetId,
		code: "invalid-file-payload",
		detail: `package cacheKey expected ${asset.cacheKey}`,
		url,
	};
}

function verifyTextAssetPackageFileReferences({
	asset,
	payload,
	url,
}: {
	asset: TextAssetPublishEntry;
	payload: Record<string, unknown>;
	url: string;
}): VerifyIssue | null {
	const files = isRecord({ value: payload.files }) ? payload.files : null;
	if (!files) {
		return {
			assetId: asset.assetId,
			code: "invalid-file-payload",
			detail: "QCut text package files must be a JSON object",
			url,
		};
	}
	const sourceFile = asset.files.find((file) => file.role === "source");
	const thumbnailFile = asset.files.find((file) => file.role === "thumbnail");
	const mismatches = [
		fieldMismatch({
			actual: files.source,
			expected: sourceFile ? basename(sourceFile.url) : "template.json",
			field: "files.source",
		}),
		fieldMismatch({
			actual: files.thumbnail,
			expected: thumbnailFile ? basename(thumbnailFile.url) : "thumbnail.webp",
			field: "files.thumbnail",
		}),
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length === 0) return null;
	return {
		assetId: asset.assetId,
		code: "invalid-file-payload",
		detail: `package file reference mismatch: ${mismatches.join(", ")}`,
		url,
	};
}

function fieldMismatch({
	actual,
	expected,
	field,
}: {
	actual: unknown;
	expected: number | string;
	field: string;
}): string | null {
	return actual === expected ? null : `${field} expected ${expected}`;
}

function isRecord({
	value,
}: {
	value: unknown;
}): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebpBytes({ bytes }: { bytes: Buffer }): boolean {
	return (
		bytes.byteLength >= 12 &&
		bytes.toString("ascii", 0, 4) === "RIFF" &&
		bytes.toString("ascii", 8, 12) === "WEBP"
	);
}

function getWebpDimensions({
	bytes,
}: {
	bytes: Buffer;
}): { height: number; width: number } | null {
	if (!isWebpBytes({ bytes })) return null;
	let offset = 12;
	while (offset + 8 <= bytes.byteLength) {
		const chunkType = bytes.toString("ascii", offset, offset + 4);
		const chunkSize = bytes.readUInt32LE(offset + 4);
		const dataOffset = offset + 8;
		if (dataOffset + chunkSize > bytes.byteLength) return null;
		if (chunkType === "VP8X") {
			return getVp8xDimensions({ bytes, dataOffset, chunkSize });
		}
		if (chunkType === "VP8L") {
			return getVp8lDimensions({ bytes, dataOffset, chunkSize });
		}
		if (chunkType === "VP8 ") {
			return getVp8Dimensions({ bytes, dataOffset, chunkSize });
		}
		offset = dataOffset + chunkSize + (chunkSize % 2);
	}
	return null;
}

function getVp8xDimensions({
	bytes,
	chunkSize,
	dataOffset,
}: {
	bytes: Buffer;
	chunkSize: number;
	dataOffset: number;
}): { height: number; width: number } | null {
	if (chunkSize < 10) return null;
	return {
		height: readUInt24LE({ bytes, offset: dataOffset + 7 }) + 1,
		width: readUInt24LE({ bytes, offset: dataOffset + 4 }) + 1,
	};
}

function getVp8lDimensions({
	bytes,
	chunkSize,
	dataOffset,
}: {
	bytes: Buffer;
	chunkSize: number;
	dataOffset: number;
}): { height: number; width: number } | null {
	if (chunkSize < 5 || bytes[dataOffset] !== 0x2f) return null;
	const bits = bytes.readUInt32LE(dataOffset + 1);
	return {
		height: ((bits >> 14) & 0x3fff) + 1,
		width: (bits & 0x3fff) + 1,
	};
}

function getVp8Dimensions({
	bytes,
	chunkSize,
	dataOffset,
}: {
	bytes: Buffer;
	chunkSize: number;
	dataOffset: number;
}): { height: number; width: number } | null {
	if (chunkSize < 10) return null;
	const startCodeOffset = dataOffset + 3;
	if (
		bytes[startCodeOffset] !== 0x9d ||
		bytes[startCodeOffset + 1] !== 0x01 ||
		bytes[startCodeOffset + 2] !== 0x2a
	) {
		return null;
	}
	return {
		height: bytes.readUInt16LE(startCodeOffset + 5) & 0x3fff,
		width: bytes.readUInt16LE(startCodeOffset + 3) & 0x3fff,
	};
}

function readUInt24LE({
	bytes,
	offset,
}: {
	bytes: Buffer;
	offset: number;
}): number {
	return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export async function verifyRemoteFiles({
	checksum = false,
	concurrency = 16,
	fetchImpl = fetch,
	manifest,
}: {
	checksum?: boolean;
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
				response = await fetchImpl(file.cdnUrl, {
					method: checksum ? "GET" : "HEAD",
				});
			} catch (error) {
				return [
					{
						assetId: asset.assetId,
						code: "remote-unavailable",
						detail: `${checksum ? "GET" : "HEAD"} ${file.cdnUrl} failed: ${remoteFetchErrorDetail({ error })}`,
						url: file.url,
					},
				];
			}
			if (!response.ok) {
				return [
					{
						assetId: asset.assetId,
						code: "remote-unavailable",
						detail: `${checksum ? "GET" : "HEAD"} ${file.cdnUrl} returned ${response.status}`,
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
			if (checksum) {
				const bytes = Buffer.from(await response.arrayBuffer());
				if (!contentLength && bytes.byteLength !== file.byteSize) {
					issues.push({
						assetId: asset.assetId,
						code: "remote-size-mismatch",
						detail: `Expected ${file.byteSize}, received ${bytes.byteLength}`,
						url: file.url,
					});
				}
				const receivedChecksum = hashBytes({ bytes });
				if (receivedChecksum !== file.checksumSha256) {
					issues.push({
						assetId: asset.assetId,
						code: "remote-checksum-mismatch",
						detail: `Expected ${file.checksumSha256}, received ${receivedChecksum}`,
						url: file.url,
					});
				}
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

export async function writeDesignerAssetGapReport({
	report,
	writePath,
}: {
	report: TextAssetDesignerGapReport;
	writePath: string;
}): Promise<void> {
	await mkdir(dirname(writePath), { recursive: true });
	await writeFile(writePath, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
}

async function main(): Promise<void> {
	const options = parseTextAssetCdnArgs({ argv: process.argv.slice(2) });
	const generatedAt = new Date().toISOString();
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
	const designerCategoryIssues = verifyDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const designerCategoryCoverage = summarizeDesignerCategoryCoverage({
		generatedManifest,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const { issues: manifestIssues, manifest } = buildTextAssetPublishManifest({
		baseUrl: options.baseUrl,
		generatedAt,
		generatedManifest,
		publicDir: options.publicDir,
		supplementalAssets: marketplace.entry ? [marketplace.entry] : [],
	});
	const localIssues = await verifyLocalFiles({ manifest });
	const remoteIssues = options.checkRemote
		? await verifyRemoteFiles({
				checksum: options.checkRemoteChecksum,
				concurrency: options.remoteConcurrency,
				manifest,
			})
		: [];
	const issues = [
		...marketplace.issues,
		...(options.allowDesignerGaps ? [] : designerCoverageIssues),
		...(options.allowDesignerGaps ? [] : designerCategoryIssues),
		...manifestIssues,
		...localIssues,
		...remoteIssues,
	];
	if (options.writePath) {
		await writePublishManifest({ manifest, writePath: options.writePath });
	}
	if (options.writeDesignerGapReportPath) {
		await writeDesignerAssetGapReport({
			report: buildDesignerAssetGapReport({
				coverage: designerCategoryCoverage,
				generatedAt,
				minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
				requiredDesignerCategories: options.requiredDesignerCategories,
			}),
			writePath: options.writeDesignerGapReportPath,
		});
	}
	const issueOutput = options.fullIssues
		? {
				issueSummary: summarizeVerifyIssues({
					issues,
					limit: issues.length,
				}).issueSummary,
				issues,
			}
		: summarizeVerifyIssues({ issues, limit: options.issueLimit });
	console.log(
		JSON.stringify(
			{
				allowDesignerGaps: options.allowDesignerGaps,
				baseUrl: manifest.baseUrl,
				checkRemote: options.checkRemote,
				checkRemoteChecksum: options.checkRemoteChecksum,
				designerCategoryCoverage,
				...issueOutput,
				minDesignerAssets: options.minDesignerAssets,
				minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
				ok: issues.length === 0,
				provenance,
				requiredDesignerCategories: options.requiredDesignerCategories,
				totalAssets: manifest.totalAssets,
				totalBytes: manifest.totalBytes,
				totalFiles: manifest.totalFiles,
				writeDesignerGapReportPath: options.writeDesignerGapReportPath,
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
