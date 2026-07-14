import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextAssetUploadPlanItem,
	TextAssetUploadPlanReport,
} from "./upload-text-assets-cdn";

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
		| "invalid-stage-key";
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
	return issueGroups.flat();
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
