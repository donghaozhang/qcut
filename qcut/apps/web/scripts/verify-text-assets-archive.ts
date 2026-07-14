import { execFile } from "node:child_process";
import { dirname, isAbsolute, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TextAssetUploadPlanReport } from "./upload-text-assets-cdn";

export type TextAssetArchiveVerifyOptions = {
	archivePath: string;
	issueLimit: number;
};

export type TextAssetArchiveVerifyIssue = {
	code:
		| "missing-archive-entry"
		| "unexpected-archive-entry"
		| "duplicate-archive-entry"
		| "invalid-archive-entry";
	detail: string;
	key: string;
};

export type TextAssetArchiveVerifySummary = {
	archiveFiles: number;
	archivePath: string;
	issueSummary: {
		byCode: Partial<Record<TextAssetArchiveVerifyIssue["code"], number>>;
		count: number;
		truncated: number;
	};
	issues: TextAssetArchiveVerifyIssue[];
	ok: boolean;
	totalBytes: number;
	totalFiles: number;
};

type TarCommand = ({ args }: { args: string[] }) => Promise<string>;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARCHIVE_PATH = join(
	SCRIPT_DIR,
	"../dist/text-assets-cdn-stage.tar.gz"
);
const STAGE_MANIFEST_FILE = "_qcut-text-assets-release.json";
const execFileAsync = promisify(execFile);

export function parseTextAssetArchiveVerifyArgs({
	argv,
}: {
	argv: string[];
}): TextAssetArchiveVerifyOptions {
	const options: TextAssetArchiveVerifyOptions = {
		archivePath: DEFAULT_ARCHIVE_PATH,
		issueLimit: 25,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--archive") {
			options.archivePath = requireValue({ argv, index, name: arg });
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

export async function readTextAssetArchiveManifest({
	archivePath,
	runTar = runTarCommand,
}: {
	archivePath: string;
	runTar?: TarCommand;
}): Promise<TextAssetUploadPlanReport> {
	const text = await readArchiveTextEntry({
		archivePath,
		entry: STAGE_MANIFEST_FILE,
		runTar,
	});
	return JSON.parse(text) as TextAssetUploadPlanReport;
}

export async function listTextAssetArchiveEntries({
	archivePath,
	runTar = runTarCommand,
}: {
	archivePath: string;
	runTar?: TarCommand;
}): Promise<string[]> {
	const output = await runTar({
		args: ["-tzf", archivePath],
	});
	return output.split(/\r?\n/).filter(Boolean);
}

export function verifyTextAssetArchive({
	entries,
	manifest,
}: {
	entries: readonly string[];
	manifest: TextAssetUploadPlanReport;
}): TextAssetArchiveVerifyIssue[] {
	const expectedEntries = new Set([
		STAGE_MANIFEST_FILE,
		...manifest.items.map((item) => item.key),
	]);
	const entryCounts = new Map<string, number>();
	const issues: TextAssetArchiveVerifyIssue[] = [];

	for (const rawEntry of entries) {
		const normalized = normalizeArchiveEntry({ entry: rawEntry });
		if (normalized.type === "directory") continue;
		if (normalized.type === "invalid") {
			issues.push({
				code: "invalid-archive-entry",
				detail: "Archive entry must resolve inside the release root",
				key: rawEntry,
			});
			continue;
		}
		entryCounts.set(normalized.key, (entryCounts.get(normalized.key) ?? 0) + 1);
		if (!expectedEntries.has(normalized.key)) {
			issues.push({
				code: "unexpected-archive-entry",
				detail:
					"Archive contains a file that is not listed in the release manifest",
				key: normalized.key,
			});
		}
	}

	for (const [key, count] of entryCounts) {
		if (count <= 1) continue;
		issues.push({
			code: "duplicate-archive-entry",
			detail: `Archive contains ${count} copies of this file`,
			key,
		});
	}

	for (const expectedEntry of expectedEntries) {
		if (entryCounts.has(expectedEntry)) continue;
		issues.push({
			code: "missing-archive-entry",
			detail: "Archive is missing a release manifest entry",
			key: expectedEntry,
		});
	}

	return issues;
}

export function summarizeTextAssetArchiveIssues({
	issues,
	limit = 25,
}: {
	issues: readonly TextAssetArchiveVerifyIssue[];
	limit?: number;
}): {
	issueSummary: TextAssetArchiveVerifySummary["issueSummary"];
	issues: TextAssetArchiveVerifyIssue[];
} {
	const byCode = issues.reduce<
		Partial<Record<TextAssetArchiveVerifyIssue["code"], number>>
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

function countTextAssetArchiveFiles({
	entries,
}: {
	entries: readonly string[];
}): number {
	let count = 0;
	for (const entry of entries) {
		const normalized = normalizeArchiveEntry({ entry });
		if (normalized.type !== "directory") count += 1;
	}
	return count;
}

function normalizeArchiveEntry({
	entry,
}: {
	entry: string;
}):
	| { type: "directory" }
	| { key: string; type: "file" }
	| { type: "invalid" } {
	const trimmed = entry.trim();
	if (!trimmed || trimmed === "." || trimmed === "./") {
		return { type: "directory" };
	}
	if (trimmed.endsWith("/")) return { type: "directory" };
	const key = trimmed.replace(/^(\.\/)+/, "");
	if (
		!key ||
		key === "." ||
		key.includes(`..${sep}`) ||
		key.startsWith("../")
	) {
		return { type: "invalid" };
	}
	if (isAbsolute(key)) return { type: "invalid" };
	return { key, type: "file" };
}

async function readArchiveTextEntry({
	archivePath,
	entry,
	runTar,
}: {
	archivePath: string;
	entry: string;
	runTar: TarCommand;
}): Promise<string> {
	const candidates = [`./${entry}`, entry];
	let lastError: unknown;
	for (const candidate of candidates) {
		try {
			return await runTar({
				args: ["-xOf", archivePath, candidate],
			});
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runTarCommand({ args }: { args: string[] }): Promise<string> {
	const { stdout } = await execFileAsync("tar", args, {
		maxBuffer: 64 * 1024 * 1024,
	});
	return stdout;
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
	const options = parseTextAssetArchiveVerifyArgs({
		argv: process.argv.slice(2),
	});
	const manifest = await readTextAssetArchiveManifest({
		archivePath: options.archivePath,
	});
	const entries = await listTextAssetArchiveEntries({
		archivePath: options.archivePath,
	});
	const issues = verifyTextAssetArchive({ entries, manifest });
	const issueOutput = summarizeTextAssetArchiveIssues({
		issues,
		limit: options.issueLimit,
	});
	const summary: TextAssetArchiveVerifySummary = {
		...issueOutput,
		archiveFiles: countTextAssetArchiveFiles({ entries }),
		archivePath: options.archivePath,
		ok: issues.length === 0,
		totalBytes: manifest.totalBytes,
		totalFiles: manifest.totalFiles,
	};
	console.log(JSON.stringify(summary, null, "\t"));
	if (!summary.ok) process.exit(1);
}

if (import.meta.main) {
	await main();
}
