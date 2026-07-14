import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextAssetUploadPlanItem,
	TextAssetUploadPlanReport,
} from "./upload-text-assets-cdn";
import {
	verifyTextMarketplaceMetadataCoverage,
	verifyTextMarketplaceSourceSync,
	type TextAssetGeneratedEntry,
	type TextAssetGeneratedFile,
	type TextAssetProvenance,
	type VerifyIssue,
} from "./verify-text-asset-cdn-manifest";

export type TextAssetStageVerifyOptions = {
	issueLimit: number;
	manifestPath?: string;
	stageDir: string;
};

export type TextAssetStageVerifyIssue = {
	code:
		| "missing-file"
		| "byte-size-mismatch"
		| "checksum-mismatch"
		| "invalid-stage-key"
		| "marketplace-source-mismatch";
	detail: string;
	key: string;
};

export type TextAssetStageVerifySummary = {
	issueSummary: {
		byCode: Partial<Record<TextAssetStageVerifyIssue["code"], number>>;
		count: number;
		truncated: number;
	};
	issues: TextAssetStageVerifyIssue[];
	ok: boolean;
	stageDir: string;
	totalBytes: number;
	totalFiles: number;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STAGE_DIR = join(SCRIPT_DIR, "../dist/text-assets-cdn-stage");
const STAGE_MANIFEST_FILE = "_qcut-text-assets-release.json";

export function parseTextAssetStageVerifyArgs({
	argv,
}: {
	argv: string[];
}): TextAssetStageVerifyOptions {
	const options: TextAssetStageVerifyOptions = {
		issueLimit: 25,
		stageDir: DEFAULT_STAGE_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--stage-dir") {
			options.stageDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--manifest") {
			options.manifestPath = requireValue({ argv, index, name: arg });
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
		throw new Error(`Unknown argument: ${arg}`);
	}
	return options;
}

export async function readTextAssetStageManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<TextAssetUploadPlanReport> {
	return JSON.parse(
		await readFile(manifestPath, "utf8")
	) as TextAssetUploadPlanReport;
}

export async function verifyTextAssetStage({
	manifest,
	stageDir,
}: {
	manifest: TextAssetUploadPlanReport;
	stageDir: string;
}): Promise<TextAssetStageVerifyIssue[]> {
	const resolvedStageDir = resolve(stageDir);
	const issueGroups = await Promise.all(
		manifest.items.map((item) =>
			verifyTextAssetStageItem({
				item,
				resolvedStageDir,
			})
		)
	);
	const marketplaceIssues = await verifyTextAssetStageMarketplace({
		manifest,
		resolvedStageDir,
	});
	return [...issueGroups.flat(), ...marketplaceIssues];
}

async function verifyTextAssetStageItem({
	item,
	resolvedStageDir,
}: {
	item: TextAssetUploadPlanItem;
	resolvedStageDir: string;
}): Promise<TextAssetStageVerifyIssue[]> {
	const targetPath = resolve(resolvedStageDir, item.key);
	const relativeTarget = relative(resolvedStageDir, targetPath);
	if (!isPathInsideStage({ relativeTarget })) {
		return [
			{
				code: "invalid-stage-key",
				detail: "Stage item key must resolve inside the stage directory",
				key: item.key,
			},
		];
	}
	let bytes: Buffer;
	try {
		bytes = await readFile(targetPath);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return [
			{
				code: "missing-file",
				detail: `Missing staged file: ${detail}`,
				key: item.key,
			},
		];
	}
	const issues: TextAssetStageVerifyIssue[] = [];
	if (bytes.byteLength !== item.size) {
		issues.push({
			code: "byte-size-mismatch",
			detail: `Expected ${item.size}, received ${bytes.byteLength}`,
			key: item.key,
		});
	}
	const checksum = hashBytes({ bytes });
	if (checksum !== item.sha256) {
		issues.push({
			code: "checksum-mismatch",
			detail: `Expected ${item.sha256}, received ${checksum}`,
			key: item.key,
		});
	}
	return issues;
}

async function verifyTextAssetStageMarketplace({
	manifest,
	resolvedStageDir,
}: {
	manifest: TextAssetUploadPlanReport;
	resolvedStageDir: string;
}): Promise<TextAssetStageVerifyIssue[]> {
	const marketplaceItem = manifest.items.find(isMarketplaceItem);
	if (!marketplaceItem) return [];
	const marketplacePath = resolve(resolvedStageDir, marketplaceItem.key);
	const relativeMarketplacePath = relative(resolvedStageDir, marketplacePath);
	if (!isPathInsideStage({ relativeTarget: relativeMarketplacePath }))
		return [];
	const marketplaceBytes = await readFile(marketplacePath).catch(() => null);
	if (!marketplaceBytes) return [];
	const generatedManifest = await buildTextAssetStageGeneratedManifest({
		manifest,
		resolvedStageDir,
	});
	if (Object.keys(generatedManifest).length === 0) return [];
	const url = stageUrlForItem({ item: marketplaceItem });
	const issues = [
		...verifyTextMarketplaceMetadataCoverage({
			bytes: marketplaceBytes,
			generatedManifest,
			url,
		}),
		...(await verifyTextMarketplaceSourceSync({
			bytes: marketplaceBytes,
			generatedManifest,
			publicDir: resolvedStageDir,
			url,
		})),
	];
	return issues.map((issue) =>
		stageMarketplaceIssue({ issue, key: marketplaceItem.key })
	);
}

async function buildTextAssetStageGeneratedManifest({
	manifest,
	resolvedStageDir,
}: {
	manifest: TextAssetUploadPlanReport;
	resolvedStageDir: string;
}): Promise<Record<string, TextAssetGeneratedEntry>> {
	const entries = await Promise.all(
		manifest.items.map((item) =>
			readTextAssetStageSourceEntry({
				item,
				prefix: manifest.prefix,
				resolvedStageDir,
			})
		)
	);
	return Object.fromEntries(
		entries
			.filter((entry): entry is TextAssetGeneratedEntry => Boolean(entry))
			.map((entry) => [entry.assetId, entry])
	);
}

async function readTextAssetStageSourceEntry({
	item,
	prefix,
	resolvedStageDir,
}: {
	item: TextAssetUploadPlanItem;
	prefix: string;
	resolvedStageDir: string;
}): Promise<TextAssetGeneratedEntry | null> {
	if (item.role !== "source") return null;
	const sourcePath = resolve(resolvedStageDir, item.key);
	const relativeSourcePath = relative(resolvedStageDir, sourcePath);
	if (!isPathInsideStage({ relativeTarget: relativeSourcePath })) return null;
	const bytes = await readFile(sourcePath).catch(() => null);
	if (!bytes) return null;
	const payload = parseJsonRecord({ bytes });
	const definition = recordField({ field: "definition", record: payload });
	const resource = recordField({ field: "resource", record: definition });
	const assetId =
		item.assetId ?? stringField({ field: "assetId", record: payload });
	if (!assetId) return null;
	const packageId =
		item.packageId ??
		stringField({ field: "packageId", record: payload }) ??
		assetId;
	const version =
		item.version ?? numberField({ field: "version", record: payload }) ?? 1;
	const source = stageGeneratedFileForItem({ item });
	return {
		assetId,
		cacheKey:
			item.cacheKey ??
			stringField({ field: "cacheKey", record: resource }) ??
			stageCacheKeyForSourceItem({ item, prefix }),
		packageId,
		provenance:
			item.provenance ??
			provenanceField({ field: "provenance", record: payload }),
		source,
		thumbnail: source,
		version,
	};
}

function isMarketplaceItem({ key, role }: TextAssetUploadPlanItem): boolean {
	return role === "metadata" && key.endsWith("text-assets/marketplace.json");
}

function stageMarketplaceIssue({
	issue,
	key,
}: {
	issue: VerifyIssue;
	key: string;
}): TextAssetStageVerifyIssue {
	return {
		code: "marketplace-source-mismatch",
		detail: `${issue.assetId}: ${issue.detail}`,
		key,
	};
}

function stageGeneratedFileForItem({
	item,
}: {
	item: TextAssetUploadPlanItem;
}): TextAssetGeneratedFile {
	return {
		byteSize: item.size,
		checksumSha256: item.sha256,
		mimeType: item.contentType,
		url: stageUrlForItem({ item }),
	};
}

function stageUrlForItem({ item }: { item: TextAssetUploadPlanItem }): string {
	return `/${item.key.replace(/^\/+/, "")}`;
}

function stageCacheKeyForSourceItem({
	item,
	prefix,
}: {
	item: TextAssetUploadPlanItem;
	prefix: string;
}): string {
	const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
	const key = item.key.replace(/^\/+/, "");
	const withoutPrefix =
		cleanPrefix && key.startsWith(`${cleanPrefix}/`)
			? key.slice(cleanPrefix.length + 1)
			: key;
	return dirname(withoutPrefix);
}

function parseJsonRecord({
	bytes,
}: {
	bytes: Buffer;
}): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

function recordField({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
	const value = record?.[field];
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function stringField({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): string | undefined {
	const value = record?.[field];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): number | undefined {
	const value = record?.[field];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function provenanceField({
	field,
	record,
}: {
	field: string;
	record?: Record<string, unknown>;
}): TextAssetProvenance | undefined {
	const value = recordField({ field, record });
	if (value?.source !== "generated" && value?.source !== "designer-imported") {
		return undefined;
	}
	if (typeof value.pipeline !== "string" || value.pipeline.length === 0) {
		return undefined;
	}
	return {
		pipeline: value.pipeline,
		source: value.source,
	};
}

function isPathInsideStage({
	relativeTarget,
}: {
	relativeTarget: string;
}): boolean {
	return (
		relativeTarget !== "" &&
		relativeTarget !== ".." &&
		!relativeTarget.startsWith(`..${sep}`) &&
		!isAbsolute(relativeTarget)
	);
}

export function summarizeTextAssetStageIssues({
	issues,
	limit = 25,
}: {
	issues: readonly TextAssetStageVerifyIssue[];
	limit?: number;
}): {
	issueSummary: TextAssetStageVerifySummary["issueSummary"];
	issues: TextAssetStageVerifyIssue[];
} {
	const byCode = issues.reduce<
		Partial<Record<TextAssetStageVerifyIssue["code"], number>>
	>((summary, issue) => {
		summary[issue.code] = (summary[issue.code] ?? 0) + 1;
		return summary;
	}, {});
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

function hashBytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
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

async function main(): Promise<void> {
	const options = parseTextAssetStageVerifyArgs({
		argv: process.argv.slice(2),
	});
	const manifestPath =
		options.manifestPath ?? join(options.stageDir, STAGE_MANIFEST_FILE);
	const manifest = await readTextAssetStageManifest({ manifestPath });
	const issues = await verifyTextAssetStage({
		manifest,
		stageDir: options.stageDir,
	});
	const issueOutput = summarizeTextAssetStageIssues({
		issues,
		limit: options.issueLimit,
	});
	const summary: TextAssetStageVerifySummary = {
		...issueOutput,
		ok: issues.length === 0,
		stageDir: options.stageDir,
		totalBytes: manifest.totalBytes,
		totalFiles: manifest.totalFiles,
	};
	console.log(JSON.stringify(summary, null, "\t"));
	if (!summary.ok) process.exit(1);
}

if (import.meta.main) {
	await main();
}
