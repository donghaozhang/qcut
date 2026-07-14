import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextDesignerAssetPackEntry,
	TextDesignerAssetPackManifest,
} from "./import-text-designer-assets";
import type {
	TextDesignerPackTemplateAssetContract,
	TextDesignerPackTemplateSummary,
} from "./create-text-designer-pack-template";

export type TextDesignerPackTemplateVerifyOptions = {
	expectedAssets?: number;
	issueLimit: number;
	packDir: string;
};

export type TextDesignerPackTemplateVerifyIssue = {
	code:
		| "asset-count-mismatch"
		| "checklist-mismatch"
		| "contract-mismatch"
		| "invalid-json"
		| "missing-file"
		| "summary-mismatch";
	detail: string;
	key: string;
};

export type TextDesignerPackTemplateVerifySummary = {
	assetCount: number;
	issueSummary: {
		byCode: Partial<
			Record<TextDesignerPackTemplateVerifyIssue["code"], number>
		>;
		count: number;
		truncated: number;
	};
	issues: TextDesignerPackTemplateVerifyIssue[];
	ok: boolean;
	packDir: string;
	requiredReplacementFiles: number;
};

type ReplacementChecklistRow = {
	assetId: string;
	cacheKey: string;
	category: string;
	packageId: string;
	qcutPackagePath: string;
	requiredFiles: string;
	sourcePath: string;
	targetDirectory: string;
	thumbnailPath: string;
	version: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACK_DIR = join(
	SCRIPT_DIR,
	"../dist/text-designer-pack-template"
);
const CHECKLIST_FILE = "replacement-checklist.csv";
const MANIFEST_FILE = "manifest.json";
const SUMMARY_FILE = "pack-summary.json";
const REQUIRED_REPLACEMENT_FILES = [
	"thumbnail.webp",
	"template.json",
	"template.qctext",
] as const;

export function parseTextDesignerPackTemplateVerifyArgs({
	argv,
}: {
	argv: string[];
}): TextDesignerPackTemplateVerifyOptions {
	const options: TextDesignerPackTemplateVerifyOptions = {
		issueLimit: 25,
		packDir: DEFAULT_PACK_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--pack-dir") {
			options.packDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--expected-assets") {
			options.expectedAssets = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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

export async function verifyTextDesignerPackTemplate({
	expectedAssets,
	packDir,
}: {
	expectedAssets?: number;
	packDir: string;
}): Promise<TextDesignerPackTemplateVerifyIssue[]> {
	const manifest = await readJsonFile<TextDesignerAssetPackManifest>({
		path: join(packDir, MANIFEST_FILE),
	});
	const summary = await readJsonFile<TextDesignerPackTemplateSummary>({
		path: join(packDir, SUMMARY_FILE),
	});
	const checklist = await readReplacementChecklist({
		path: join(packDir, CHECKLIST_FILE),
	});
	const issues: TextDesignerPackTemplateVerifyIssue[] = [];

	if ("issue" in manifest) issues.push(manifest.issue);
	if ("issue" in summary) issues.push(summary.issue);
	if ("issue" in checklist) issues.push(checklist.issue);
	if (issues.length > 0) return issues;

	const manifestAssets = manifest.value.assets;
	const expectedAssetCount = expectedAssets ?? manifestAssets.length;
	if (manifestAssets.length !== expectedAssetCount) {
		issues.push({
			code: "asset-count-mismatch",
			detail: `Expected ${expectedAssetCount} assets, received ${manifestAssets.length}`,
			key: MANIFEST_FILE,
		});
	}
	issues.push(
		...verifySummary({
			assetCount: manifestAssets.length,
			summary: summary.value,
		})
	);
	issues.push(
		...verifyChecklist({
			checklistRows: checklist.value,
			manifestAssets,
		})
	);

	const assetIssues = await Promise.all(
		manifestAssets.map((asset) => verifyManifestAsset({ asset, packDir }))
	);
	return [...issues, ...assetIssues.flat()];
}

function verifySummary({
	assetCount,
	summary,
}: {
	assetCount: number;
	summary: TextDesignerPackTemplateSummary;
}): TextDesignerPackTemplateVerifyIssue[] {
	const issues: TextDesignerPackTemplateVerifyIssue[] = [];
	if (summary.assets !== assetCount) {
		issues.push({
			code: "summary-mismatch",
			detail: `summary.assets expected ${assetCount}, received ${summary.assets}`,
			key: SUMMARY_FILE,
		});
	}
	if (summary.expectedDesignerImportedAssets !== assetCount) {
		issues.push({
			code: "summary-mismatch",
			detail: `expectedDesignerImportedAssets expected ${assetCount}, received ${summary.expectedDesignerImportedAssets}`,
			key: SUMMARY_FILE,
		});
	}
	const requiredReplacementFiles =
		assetCount * REQUIRED_REPLACEMENT_FILES.length;
	if (summary.requiredReplacementFiles !== requiredReplacementFiles) {
		issues.push({
			code: "summary-mismatch",
			detail: `requiredReplacementFiles expected ${requiredReplacementFiles}, received ${summary.requiredReplacementFiles}`,
			key: SUMMARY_FILE,
		});
	}
	return issues;
}

function verifyChecklist({
	checklistRows,
	manifestAssets,
}: {
	checklistRows: readonly ReplacementChecklistRow[];
	manifestAssets: readonly TextDesignerAssetPackEntry[];
}): TextDesignerPackTemplateVerifyIssue[] {
	const issues: TextDesignerPackTemplateVerifyIssue[] = [];
	if (checklistRows.length !== manifestAssets.length) {
		issues.push({
			code: "checklist-mismatch",
			detail: `Expected ${manifestAssets.length} checklist rows, received ${checklistRows.length}`,
			key: CHECKLIST_FILE,
		});
	}
	const rowByAssetId = new Map(checklistRows.map((row) => [row.assetId, row]));
	for (const asset of manifestAssets) {
		const row = rowByAssetId.get(asset.assetId);
		if (!row) {
			issues.push({
				code: "checklist-mismatch",
				detail: "Missing checklist row for manifest asset",
				key: asset.assetId,
			});
			continue;
		}
		const targetDirectory = dirname(asset.thumbnail);
		const mismatches = [
			...compareField({
				actual: row.targetDirectory,
				expected: targetDirectory,
				field: "targetDirectory",
			}),
			...compareField({
				actual: row.thumbnailPath,
				expected: asset.thumbnail,
				field: "thumbnailPath",
			}),
			...compareField({
				actual: row.sourcePath,
				expected: asset.source,
				field: "sourcePath",
			}),
			...compareField({
				actual: row.qcutPackagePath,
				expected: asset.qcutPackage,
				field: "qcutPackagePath",
			}),
			...compareField({
				actual: row.requiredFiles,
				expected: REQUIRED_REPLACEMENT_FILES.join(";"),
				field: "requiredFiles",
			}),
		];
		if (mismatches.length === 0) continue;
		issues.push({
			code: "checklist-mismatch",
			detail: mismatches.join("; "),
			key: asset.assetId,
		});
	}
	return issues;
}

async function verifyManifestAsset({
	asset,
	packDir,
}: {
	asset: TextDesignerAssetPackEntry;
	packDir: string;
}): Promise<TextDesignerPackTemplateVerifyIssue[]> {
	const issues: TextDesignerPackTemplateVerifyIssue[] = [];
	for (const filePath of [asset.thumbnail, asset.source, asset.qcutPackage]) {
		if (await fileExists({ path: join(packDir, filePath) })) continue;
		issues.push({
			code: "missing-file",
			detail: "Missing replacement file referenced by manifest",
			key: filePath,
		});
	}
	const contractPath = join(
		packDir,
		"assets",
		asset.assetId,
		"asset-contract.json"
	);
	const contract = await readJsonFile<TextDesignerPackTemplateAssetContract>({
		path: contractPath,
	});
	if ("issue" in contract) {
		issues.push(contract.issue);
		return issues;
	}
	const mismatches = [
		...compareField({
			actual: contract.value.assetId,
			expected: asset.assetId,
			field: "assetId",
		}),
		...compareField({
			actual: contract.value.files.thumbnail.designerPath,
			expected: asset.thumbnail,
			field: "files.thumbnail.designerPath",
		}),
		...compareField({
			actual: contract.value.files.source.designerPath,
			expected: asset.source,
			field: "files.source.designerPath",
		}),
		...compareField({
			actual: contract.value.files.qcutPackage.designerPath,
			expected: asset.qcutPackage,
			field: "files.qcutPackage.designerPath",
		}),
	];
	if (mismatches.length > 0) {
		issues.push({
			code: "contract-mismatch",
			detail: mismatches.join("; "),
			key: `assets/${asset.assetId}/asset-contract.json`,
		});
	}
	return issues;
}

function compareField({
	actual,
	expected,
	field,
}: {
	actual: string;
	expected: string;
	field: string;
}): string[] {
	return actual === expected
		? []
		: [`${field} expected ${expected}, received ${actual}`];
}

async function readJsonFile<TValue>({
	path,
}: {
	path: string;
}): Promise<
	{ value: TValue } | { issue: TextDesignerPackTemplateVerifyIssue }
> {
	try {
		return {
			value: JSON.parse(await readFile(path, "utf8")) as TValue,
		};
	} catch (error) {
		return {
			issue: {
				code: "invalid-json",
				detail: error instanceof Error ? error.message : String(error),
				key: path,
			},
		};
	}
}

async function readReplacementChecklist({
	path,
}: {
	path: string;
}): Promise<
	| { value: ReplacementChecklistRow[] }
	| { issue: TextDesignerPackTemplateVerifyIssue }
> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		return {
			issue: {
				code: "missing-file",
				detail: error instanceof Error ? error.message : String(error),
				key: path,
			},
		};
	}
	const rows = parseCsv({ content });
	const [header, ...dataRows] = rows;
	const expectedHeader = [
		"assetId",
		"category",
		"packageId",
		"version",
		"cacheKey",
		"targetDirectory",
		"thumbnailPath",
		"sourcePath",
		"qcutPackagePath",
		"requiredFiles",
	];
	if (
		!header ||
		header.length !== expectedHeader.length ||
		header.some((value, index) => value !== expectedHeader[index])
	) {
		return {
			issue: {
				code: "checklist-mismatch",
				detail: "Unexpected replacement checklist header",
				key: path,
			},
		};
	}
	return {
		value: dataRows
			.filter((row) => row.some((value) => value.length > 0))
			.map((row) => ({
				assetId: row[0] ?? "",
				category: row[1] ?? "",
				packageId: row[2] ?? "",
				version: row[3] ?? "",
				cacheKey: row[4] ?? "",
				targetDirectory: row[5] ?? "",
				thumbnailPath: row[6] ?? "",
				sourcePath: row[7] ?? "",
				qcutPackagePath: row[8] ?? "",
				requiredFiles: row[9] ?? "",
			})),
	};
}

function parseCsv({ content }: { content: string }): string[][] {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentValue = "";
	let quoted = false;
	for (let index = 0; index < content.length; index += 1) {
		const character = content[index];
		if (quoted) {
			if (character === '"' && content[index + 1] === '"') {
				currentValue += '"';
				index += 1;
				continue;
			}
			if (character === '"') {
				quoted = false;
				continue;
			}
			currentValue += character;
			continue;
		}
		if (character === '"') {
			quoted = true;
			continue;
		}
		if (character === ",") {
			currentRow.push(currentValue);
			currentValue = "";
			continue;
		}
		if (character === "\n") {
			currentRow.push(currentValue);
			rows.push(currentRow);
			currentRow = [];
			currentValue = "";
			continue;
		}
		if (character !== "\r") currentValue += character;
	}
	if (currentValue || currentRow.length > 0) {
		currentRow.push(currentValue);
		rows.push(currentRow);
	}
	return rows;
}

async function fileExists({ path }: { path: string }): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function summarizeIssues({
	issues,
	issueLimit,
}: {
	issues: readonly TextDesignerPackTemplateVerifyIssue[];
	issueLimit: number;
}): TextDesignerPackTemplateVerifySummary["issueSummary"] {
	const byCode: Partial<
		Record<TextDesignerPackTemplateVerifyIssue["code"], number>
	> = {};
	for (const issue of issues) {
		byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
	}
	return {
		byCode,
		count: issues.length,
		truncated: Math.max(0, issues.length - issueLimit),
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
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${name} must be a positive integer.`);
	}
	return parsed;
}

function parseNonNegativeInteger({
	name,
	value,
}: {
	name: string;
	value: string;
}): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative integer.`);
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
	if (!value) throw new Error(`Missing value for ${name}.`);
	return value;
}

async function main() {
	const options = parseTextDesignerPackTemplateVerifyArgs({
		argv: process.argv.slice(2),
	});
	const issues = await verifyTextDesignerPackTemplate({
		expectedAssets: options.expectedAssets,
		packDir: options.packDir,
	});
	const manifestAssetCount =
		(await readManifestAssetCount({ packDir: options.packDir })) ??
		options.expectedAssets ??
		0;
	const issueSummary = summarizeIssues({
		issueLimit: options.issueLimit,
		issues,
	});
	const summary: TextDesignerPackTemplateVerifySummary = {
		assetCount: manifestAssetCount,
		issueSummary,
		issues: issues.slice(0, options.issueLimit),
		ok: issues.length === 0,
		packDir: options.packDir,
		requiredReplacementFiles:
			manifestAssetCount * REQUIRED_REPLACEMENT_FILES.length,
	};
	console.log(JSON.stringify(summary, null, "\t"));
	if (!summary.ok) process.exitCode = 1;
}

async function readManifestAssetCount({
	packDir,
}: {
	packDir: string;
}): Promise<number | undefined> {
	const manifest = await readJsonFile<TextDesignerAssetPackManifest>({
		path: join(packDir, MANIFEST_FILE),
	});
	if ("issue" in manifest) return undefined;
	return manifest.value.assets.length;
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
