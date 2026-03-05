/**
 * Token usage extraction for unmanaged CLI sessions.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
	findLatestSessionFile,
	parseJsonlFileTail,
	parseTimestampMs,
	readJsonlFirstLine,
	resolveClaudeProjectDir,
	toRecord,
} from "./claude-jsonl-core";
import {
	findCodexSessionFileForContext,
	findLatestCodexSessionFile,
} from "./claude-jsonl-context";

const CLAUDE_SESSION_SCAN_LIMIT = 120;
const CLAUDE_SESSION_META_MAX_SCAN_BYTES = 262_144;
const JSONL_USAGE_CACHE_MAX_ENTRIES = 200;

const jsonlUsageCache = new Map<
	string,
	{
		mtimeMs: number;
		size: number;
		usage: CLISessionTokenUsage | null;
	}
>();

export interface CLISessionTokenUsage {
	inputTokens: number;
	outputTokens: number;
	estimatedCostUsd: number;
}

interface ClaudeSessionFile {
	path: string;
	mtimeMs: number;
	size: number;
	startTimestampMs: number | null;
}

interface RawCodexTokenUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
}

interface RawCodexTokenCountRecord {
	type?: string;
	payload?: {
		type?: string;
		info?: {
			total_token_usage?: RawCodexTokenUsage;
			last_token_usage?: RawCodexTokenUsage;
		};
	};
}

function toNonNegativeNumber({ value }: { value: unknown }): number {
	try {
		if (typeof value !== "number" || !Number.isFinite(value)) return 0;
		if (value < 0) return 0;
		return value;
	} catch {
		return 0;
	}
}

function estimateCostFromTokens({
	inputTokens,
	outputTokens,
	explicitCostUsd,
}: {
	inputTokens: number;
	outputTokens: number;
	explicitCostUsd: number;
}): number {
	try {
		if (explicitCostUsd > 0) return explicitCostUsd;
		if (inputTokens <= 0 && outputTokens <= 0) return 0;
		return (inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
	} catch {
		return 0;
	}
}

function getUsageFromCache({
	filePath,
	mtimeMs,
	size,
}: {
	filePath: string;
	mtimeMs: number;
	size: number;
}): CLISessionTokenUsage | null | undefined {
	try {
		const cached = jsonlUsageCache.get(filePath);
		if (!cached) return undefined;
		if (cached.mtimeMs !== mtimeMs || cached.size !== size) {
			jsonlUsageCache.delete(filePath);
			return undefined;
		}
		return cached.usage;
	} catch {
		return undefined;
	}
}

function setUsageCache({
	filePath,
	mtimeMs,
	size,
	usage,
}: {
	filePath: string;
	mtimeMs: number;
	size: number;
	usage: CLISessionTokenUsage | null;
}): void {
	try {
		if (jsonlUsageCache.size >= JSONL_USAGE_CACHE_MAX_ENTRIES) {
			const firstKey = jsonlUsageCache.keys().next().value;
			if (typeof firstKey === "string") {
				jsonlUsageCache.delete(firstKey);
			}
		}
		jsonlUsageCache.set(filePath, { mtimeMs, size, usage });
	} catch {
		// Best-effort cache
	}
}

function toClampedUsage({
	inputTokens,
	outputTokens,
	estimatedCostUsd,
}: {
	inputTokens: number;
	outputTokens: number;
	estimatedCostUsd: number;
}): CLISessionTokenUsage {
	return {
		inputTokens: Math.round(toNonNegativeNumber({ value: inputTokens })),
		outputTokens: Math.round(toNonNegativeNumber({ value: outputTokens })),
		estimatedCostUsd: toNonNegativeNumber({ value: estimatedCostUsd }),
	};
}

function parseClaudeUsageFromRecord({
	record,
}: {
	record: Record<string, unknown>;
}): { inputTokens: number; outputTokens: number; costUsd: number } | null {
	try {
		let inputTokens = 0;
		let outputTokens = 0;
		let costUsd = 0;

		const usage = toRecord({ value: (record as { usage?: unknown }).usage });
		const message = toRecord({ value: (record as { message?: unknown }).message });
		const messageUsage = message
			? toRecord({ value: (message as { usage?: unknown }).usage })
			: null;
		const usagePayload = usage ?? messageUsage;

		if (usagePayload) {
			inputTokens += toNonNegativeNumber({
				value: usagePayload.input_tokens,
			});
			inputTokens += toNonNegativeNumber({
				value: usagePayload.cache_read_input_tokens,
			});
			inputTokens += toNonNegativeNumber({
				value: usagePayload.cache_creation_input_tokens,
			});
			outputTokens += toNonNegativeNumber({
				value: usagePayload.output_tokens,
			});
		} else {
			inputTokens += toNonNegativeNumber({
				value: (record as { inputTokens?: unknown }).inputTokens,
			});
			outputTokens += toNonNegativeNumber({
				value: (record as { outputTokens?: unknown }).outputTokens,
			});
		}

		const costUsdDirect = toNonNegativeNumber({
			value: (record as { costUSD?: unknown }).costUSD,
		});
		const costUsdEstimated = toNonNegativeNumber({
			value: (record as { estimatedCostUsd?: unknown }).estimatedCostUsd,
		});
		costUsd += costUsdDirect > 0 ? costUsdDirect : costUsdEstimated;

		if (inputTokens <= 0 && outputTokens <= 0 && costUsd <= 0) return null;
		return { inputTokens, outputTokens, costUsd };
	} catch {
		return null;
	}
}

async function extractClaudeUsageFromFile({
	filePath,
}: {
	filePath: string;
}): Promise<CLISessionTokenUsage | null> {
	try {
		const content = await readFile(filePath, "utf-8");
		let inputTokens = 0;
		let outputTokens = 0;
		let explicitCostUsd = 0;

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				const parsed = JSON.parse(trimmed) as unknown;
				const record = toRecord({ value: parsed });
				if (!record) continue;
				const usage = parseClaudeUsageFromRecord({ record });
				if (!usage) continue;
				inputTokens += usage.inputTokens;
				outputTokens += usage.outputTokens;
				explicitCostUsd += usage.costUsd;
			} catch {
				continue;
			}
		}

		if (inputTokens <= 0 && outputTokens <= 0 && explicitCostUsd <= 0) {
			return null;
		}

		return toClampedUsage({
			inputTokens,
			outputTokens,
			estimatedCostUsd: estimateCostFromTokens({
				inputTokens,
				outputTokens,
				explicitCostUsd,
			}),
		});
	} catch {
		return null;
	}
}

function parseCodexTokenUsageFromRecord({
	record,
}: {
	record: Record<string, unknown>;
}): RawCodexTokenUsage | null {
	try {
		const tokenCountRecord = record as RawCodexTokenCountRecord;
		if (tokenCountRecord.type !== "event_msg") return null;
		if (tokenCountRecord.payload?.type !== "token_count") return null;
		return (
			tokenCountRecord.payload.info?.total_token_usage ??
			tokenCountRecord.payload.info?.last_token_usage ??
			null
		);
	} catch {
		return null;
	}
}

async function extractCodexUsageFromFile({
	filePath,
}: {
	filePath: string;
}): Promise<CLISessionTokenUsage | null> {
	try {
		const lines = await parseJsonlFileTail(filePath, 1_048_576);
		let latestUsage: RawCodexTokenUsage | null = null;

		for (const line of lines) {
			const record = toRecord({ value: line });
			if (!record) continue;
			const usage = parseCodexTokenUsageFromRecord({ record });
			if (!usage) continue;
			latestUsage = usage;
		}

		if (!latestUsage) return null;
		const inputTokens = Math.round(
			toNonNegativeNumber({ value: latestUsage.input_tokens }),
		);
		const outputFromUsage = Math.round(
			toNonNegativeNumber({ value: latestUsage.output_tokens }),
		);
		const totalFromUsage = Math.round(
			toNonNegativeNumber({ value: latestUsage.total_tokens }),
		);
		const outputTokens =
			totalFromUsage > 0
				? Math.max(0, totalFromUsage - inputTokens)
				: outputFromUsage;

		if (inputTokens <= 0 && outputTokens <= 0) return null;
		return toClampedUsage({
			inputTokens,
			outputTokens,
			estimatedCostUsd: 0,
		});
	} catch {
		return null;
	}
}

async function resolveUsageFromFile({
	filePath,
	extractor,
}: {
	filePath: string;
	extractor: (args: { filePath: string }) => Promise<CLISessionTokenUsage | null>;
}): Promise<CLISessionTokenUsage | null> {
	try {
		const fileStats = await stat(filePath);
		const cached = getUsageFromCache({
			filePath,
			mtimeMs: fileStats.mtimeMs,
			size: fileStats.size,
		});
		if (cached !== undefined) return cached;

		const usage = await extractor({ filePath });
		setUsageCache({
			filePath,
			mtimeMs: fileStats.mtimeMs,
			size: fileStats.size,
			usage,
		});
		return usage;
	} catch {
		return null;
	}
}

async function listClaudeSessionFiles({
	cwd,
}: {
	cwd: string;
}): Promise<ClaudeSessionFile[]> {
	try {
		const projectDir = resolveClaudeProjectDir(cwd);
		const entries = await readdir(projectDir);
		const jsonlFiles = entries.filter(
			(entry) => entry.endsWith(".jsonl") && !entry.startsWith("agent-"),
		);
		if (jsonlFiles.length === 0) return [];

		const stats = await Promise.all(
			jsonlFiles.map(async (fileName) => {
				const filePath = join(projectDir, fileName);
				try {
					const fileStats = await stat(filePath);
					return {
						path: filePath,
						mtimeMs: fileStats.mtimeMs,
						size: fileStats.size,
					};
				} catch {
					return null;
				}
			}),
		);
		const recent = stats
			.filter(
				(file): file is { path: string; mtimeMs: number; size: number } =>
					file !== null,
			)
			.sort((fileA, fileB) => fileB.mtimeMs - fileA.mtimeMs)
			.slice(0, CLAUDE_SESSION_SCAN_LIMIT);
		if (recent.length === 0) return [];

		const withMeta = await Promise.all(
			recent.map(async (file): Promise<ClaudeSessionFile> => {
				const firstLine = await readJsonlFirstLine({
					filePath: file.path,
					maxBytes: CLAUDE_SESSION_META_MAX_SCAN_BYTES,
				});
				let startTimestampMs: number | null = null;
				if (firstLine) {
					try {
						const parsed = JSON.parse(firstLine) as unknown;
						const record = toRecord({ value: parsed });
						if (record) {
							startTimestampMs = parseTimestampMs({
								value: (record as { timestamp?: unknown }).timestamp,
							});
						}
					} catch {
						startTimestampMs = null;
					}
				}
				return {
					path: file.path,
					mtimeMs: file.mtimeMs,
					size: file.size,
					startTimestampMs,
				};
			}),
		);
		return withMeta;
	} catch {
		return [];
	}
}

/** Find claude session file using cwd + process start time context. */
export async function findClaudeSessionFileForContext({
	cwd,
	processStartedAt,
}: {
	cwd?: string | null;
	processStartedAt?: string | null;
}): Promise<string | null> {
	try {
		if (!cwd) return null;
		const files = await listClaudeSessionFiles({ cwd });
		if (files.length === 0) return null;

		const processStartedAtMs = parseTimestampMs({
			value: processStartedAt ?? null,
		});
		if (processStartedAtMs === null) return files[0]?.path ?? null;

		const ranked = files
			.map((file) => {
				const startMs = file.startTimestampMs;
				const diffMs =
					startMs === null
						? Number.MAX_SAFE_INTEGER
						: Math.abs(startMs - processStartedAtMs);
				return { file, diffMs };
			})
			.sort((a, b) => {
				if (a.diffMs !== b.diffMs) return a.diffMs - b.diffMs;
				return b.file.mtimeMs - a.file.mtimeMs;
			});

		if (ranked[0] && ranked[0].diffMs < Number.MAX_SAFE_INTEGER) {
			return ranked[0].file.path;
		}
		return files[0]?.path ?? null;
	} catch {
		return null;
	}
}

async function resolveClaudeSessionTokenUsage({
	cwd,
	processStartedAt,
}: {
	cwd: string;
	processStartedAt?: string | null;
}): Promise<CLISessionTokenUsage | null> {
	try {
		let sessionFile = await findClaudeSessionFileForContext({
			cwd,
			processStartedAt,
		});
		if (!sessionFile) {
			const projectDir = resolveClaudeProjectDir(cwd);
			sessionFile = await findLatestSessionFile(projectDir);
		}
		if (!sessionFile) return null;
		return resolveUsageFromFile({
			filePath: sessionFile,
			extractor: extractClaudeUsageFromFile,
		});
	} catch {
		return null;
	}
}

async function resolveCodexSessionTokenUsage({
	cwd,
	processStartedAt,
}: {
	cwd?: string | null;
	processStartedAt?: string | null;
}): Promise<CLISessionTokenUsage | null> {
	try {
		let sessionFile = await findCodexSessionFileForContext({
			cwd,
			processStartedAt,
		});
		if (!sessionFile) {
			sessionFile = await findLatestCodexSessionFile();
		}
		if (!sessionFile) return null;
		return resolveUsageFromFile({
			filePath: sessionFile,
			extractor: extractCodexUsageFromFile,
		});
	} catch {
		return null;
	}
}

/** Resolve unmanaged CLI token usage for Claude Code or Codex. */
export async function resolveCLISessionTokenUsage({
	agent,
	cwd,
	processStartedAt,
}: {
	agent: "claude-code" | "codex";
	cwd?: string | null;
	processStartedAt?: string | null;
}): Promise<CLISessionTokenUsage | null> {
	try {
		if (agent === "claude-code") {
			if (!cwd) return null;
			return resolveClaudeSessionTokenUsage({
				cwd,
				processStartedAt,
			});
		}
		return resolveCodexSessionTokenUsage({
			cwd,
			processStartedAt,
		});
	} catch {
		return null;
	}
}
