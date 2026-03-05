/**
 * JSONL session file utilities for Claude Code and Codex CLI.
 *
 * Claude Code stores at ~/.claude/projects/{encoded-cwd}/*.jsonl
 * Codex stores at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */

import { readdir, readFile, stat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_SESSION_SCAN_LIMIT = 160;
const CODEX_SESSION_META_MAX_SCAN_BYTES = 1_048_576;
const CODEX_SESSION_LOOKUP_CACHE_TTL_MS = 15_000;
const CLAUDE_SESSION_SCAN_LIMIT = 120;
const CLAUDE_SESSION_META_MAX_SCAN_BYTES = 262_144;
const JSONL_USAGE_CACHE_MAX_ENTRIES = 200;

const codexSessionLookupCache = new Map<
	string,
	{ path: string; expiresAt: number }
>();
const jsonlUsageCache = new Map<
	string,
	{
		mtimeMs: number;
		size: number;
		usage: CLISessionTokenUsage | null;
	}
>();

/**
 * Encode a workspace path into Claude Code's project directory name.
 * Claude stores sessions at ~/.claude/projects/{encoded-path}/*.jsonl
 */
export function toClaudeProjectPath(workspacePath: string): string {
	const normalized = workspacePath.replace(/\\/g, "/");
	return normalized.replace(/:/g, "").replace(/[/.]/g, "-");
}

/** Find the most recently modified .jsonl session file in a directory. */
export async function findLatestSessionFile(
	projectDir: string,
): Promise<string | null> {
	let entries: string[];
	try {
		entries = await readdir(projectDir);
	} catch {
		return null;
	}

	const jsonlFiles = entries.filter(
		(f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
	);
	if (jsonlFiles.length === 0) return null;

	const withStats = await Promise.all(
		jsonlFiles.map(async (f) => {
			const fullPath = join(projectDir, f);
			try {
				const s = await stat(fullPath);
				return { path: fullPath, mtime: s.mtimeMs };
			} catch {
				return { path: fullPath, mtime: 0 };
			}
		}),
	);
	withStats.sort((a, b) => b.mtime - a.mtime);
	return withStats[0]?.path ?? null;
}

export interface JsonlEntry {
	type?: string;
	message?: { content?: string | unknown[]; role?: string };
	summary?: string;
	toolName?: string;
	tool_name?: string;
	/** Short detail string for tool_use (file path, command, pattern, etc.) */
	toolDetail?: string;
	/** Compact tool output/result summary (for tool_result rows). */
	toolResult?: string;
	/** Whether the tool result represents an error/failure. */
	toolResultError?: boolean;
	// tool_use content blocks
	content?: unknown[];
}

export interface CLISessionTokenUsage {
	inputTokens: number;
	outputTokens: number;
	estimatedCostUsd: number;
}

/**
 * Read the tail of a JSONL file (last maxBytes). For large files (100MB+),
 * only the tail is read to avoid loading the entire file into memory.
 */
export async function parseJsonlFileTail(
	filePath: string,
	maxBytes = 262_144,
): Promise<JsonlEntry[]> {
	let content: string;
	let offset: number;
	try {
		const { size = 0 } = await stat(filePath);
		offset = Math.max(0, size - maxBytes);
		if (offset === 0) {
			content = await readFile(filePath, "utf-8");
		} else {
			const handle = await open(filePath, "r");
			try {
				const length = size - offset;
				const buffer = Buffer.allocUnsafe(length);
				await handle.read(buffer, 0, length, offset);
				content = buffer.toString("utf-8");
			} finally {
				await handle.close();
			}
		}
	} catch {
		return [];
	}

	const firstNewline = content.indexOf("\n");
	const safeContent =
		offset > 0 && firstNewline >= 0 ? content.slice(firstNewline + 1) : content;
	const lines: JsonlEntry[] = [];
	for (const line of safeContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (
				typeof parsed === "object" &&
				parsed !== null &&
				!Array.isArray(parsed)
			) {
				lines.push(parsed as JsonlEntry);
			}
		} catch {
			// Skip malformed lines
		}
	}
	return lines;
}

/**
 * Resolve the JSONL session directory for a given workspace CWD.
 * Returns the full path to ~/.claude/projects/{encoded-cwd}/.
 */
export function resolveClaudeProjectDir(cwd: string): string {
	const encoded = toClaudeProjectPath(cwd);
	return join(homedir(), ".claude", "projects", encoded);
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
			.filter((file): file is { path: string; mtimeMs: number; size: number } => file !== null)
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

/**
 * Find the most recent Codex session file.
 * Codex stores at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 */
export async function findLatestCodexSessionFile(): Promise<string | null> {
	try {
		const files = await listRecentCodexSessionFiles({ maxFiles: 1 });
		return files[0]?.path ?? null;
	} catch {
		return null;
	}
}

/** Handle find codex session file for context. */
export async function findCodexSessionFileForContext({
	cwd,
	processStartedAt,
}: {
	cwd?: string | null;
	processStartedAt?: string | null;
}): Promise<string | null> {
	try {
		const cacheKey = buildCodexLookupCacheKey({
			cwd: cwd ?? null,
			processStartedAt: processStartedAt ?? null,
		});
		const now = Date.now();
		const cached = codexSessionLookupCache.get(cacheKey);
		if (cached && cached.expiresAt > now) {
			const exists = await pathExists({ path: cached.path });
			if (exists) return cached.path;
			codexSessionLookupCache.delete(cacheKey);
		}

		const files = await listRecentCodexSessionFiles({
			maxFiles: CODEX_SESSION_SCAN_LIMIT,
		});
		if (files.length === 0) return null;

		const candidates = await Promise.all(
			files.map(async (file) => {
				const meta = await readCodexSessionMeta({ filePath: file.path });
				return { ...file, meta };
			}),
		);

		const selected = selectBestCodexCandidate({
			candidates,
			cwd: cwd ?? null,
			processStartedAt: processStartedAt ?? null,
		});
		const selectedPath = selected?.path ?? files[0]?.path ?? null;
		if (!selectedPath) return null;

		codexSessionLookupCache.set(cacheKey, {
			path: selectedPath,
			expiresAt: now + CODEX_SESSION_LOOKUP_CACHE_TTL_MS,
		});
		return selectedPath;
	} catch {
		return null;
	}
}

interface CodexSessionFile {
	path: string;
	mtime: number;
}

interface CodexSessionMeta {
	id: string | null;
	cwd: string | null;
	timestampMs: number | null;
}

interface CodexSessionCandidate extends CodexSessionFile {
	meta: CodexSessionMeta | null;
}

/** Handle list recent codex session files. */
async function listRecentCodexSessionFiles({
	maxFiles,
}: {
	maxFiles: number;
}): Promise<CodexSessionFile[]> {
	const sessionsDir = join(homedir(), ".codex", "sessions");
	try {
		const collected: CodexSessionFile[] = [];
		const years = await readdir(sessionsDir);
		years.sort().reverse();

		for (const year of years) {
			const monthsDir = join(sessionsDir, year);
			let months: string[];
			try {
				months = await readdir(monthsDir);
			} catch {
				continue;
			}
			months.sort().reverse();

			for (const month of months) {
				const daysDir = join(sessionsDir, year, month);
				let days: string[];
				try {
					days = await readdir(daysDir);
				} catch {
					continue;
				}
				days.sort().reverse();

				for (const day of days) {
					const dayDir = join(sessionsDir, year, month, day);
					let files: string[];
					try {
						files = await readdir(dayDir);
					} catch {
						continue;
					}
					const jsonlFiles = files.filter((file) => file.endsWith(".jsonl"));
					if (jsonlFiles.length === 0) continue;

					const withStats = await Promise.all(
						jsonlFiles.map(async (file) => {
							const path = join(dayDir, file);
							try {
								const fileStats = await stat(path);
								return { path, mtime: fileStats.mtimeMs };
							} catch {
								return null;
							}
						}),
					);
					for (const file of withStats) {
						if (!file) continue;
						collected.push(file);
					}
					if (collected.length >= maxFiles * 2) {
						return collected
							.sort((fileA, fileB) => fileB.mtime - fileA.mtime)
							.slice(0, maxFiles);
					}
				}
			}
		}

		return collected
			.sort((fileA, fileB) => fileB.mtime - fileA.mtime)
			.slice(0, maxFiles);
	} catch {
		return [];
	}
}

/** Handle read codex session meta. */
async function readCodexSessionMeta({
	filePath,
}: {
	filePath: string;
}): Promise<CodexSessionMeta | null> {
	try {
		const firstLine = await readJsonlFirstLine({
			filePath,
			maxBytes: CODEX_SESSION_META_MAX_SCAN_BYTES,
		});
		if (!firstLine) return null;

		const parsed = JSON.parse(firstLine) as unknown;
		const record = toRecord({ value: parsed });
		if (!record) return null;
		if (record.type !== "session_meta") return null;

		const payload = toRecord({ value: record.payload });
		if (!payload) return null;
		return {
			id: typeof payload.id === "string" ? payload.id : null,
			cwd: typeof payload.cwd === "string" ? payload.cwd : null,
			timestampMs: parseTimestampMs({ value: payload.timestamp }),
		};
	} catch {
		return null;
	}
}

/** Handle read jsonl first line. */
async function readJsonlFirstLine({
	filePath,
	maxBytes,
}: {
	filePath: string;
	maxBytes: number;
}): Promise<string | null> {
	try {
		if (maxBytes <= 0) return null;
		const fileStats = await stat(filePath);
		const bytesToScan = Math.max(0, Math.min(maxBytes, fileStats.size));
		if (bytesToScan === 0) return null;
		const handle = await open(filePath, "r");
		try {
			const chunks: Buffer[] = [];
			const chunkSize = 16_384;
			let bytesReadTotal = 0;

			while (bytesReadTotal < bytesToScan) {
				const nextChunkSize = Math.min(chunkSize, bytesToScan - bytesReadTotal);
				const chunk = Buffer.allocUnsafe(nextChunkSize);
				const { bytesRead } = await handle.read(
					chunk,
					0,
					nextChunkSize,
					bytesReadTotal,
				);
				if (bytesRead <= 0) break;
				bytesReadTotal += bytesRead;

				const slice = chunk.subarray(0, bytesRead);
				const newlineIndex = slice.indexOf(10);
				if (newlineIndex >= 0) {
					chunks.push(slice.subarray(0, newlineIndex));
					const line = Buffer.concat(chunks).toString("utf-8").trim();
					return line || null;
				}
				chunks.push(slice);
			}

			if (chunks.length === 0) return null;
			const content = Buffer.concat(chunks).toString("utf-8").trim();
			return content || null;
		} finally {
			await handle.close();
		}
	} catch {
		return null;
	}
}

/** Handle select best codex candidate. */
function selectBestCodexCandidate({
	candidates,
	cwd,
	processStartedAt,
}: {
	candidates: CodexSessionCandidate[];
	cwd: string | null;
	processStartedAt: string | null;
}): CodexSessionCandidate | null {
	try {
		if (candidates.length === 0) return null;
		const processStartedAtMs = parseTimestampMs({ value: processStartedAt });
		let best: { score: number; candidate: CodexSessionCandidate } | null = null;
		for (const candidate of candidates) {
			const score = scoreCodexCandidate({
				candidate,
				cwd,
				processStartedAtMs,
			});
			if (!best || score > best.score) {
				best = { score, candidate };
			}
		}
		return best?.candidate ?? null;
	} catch {
		return null;
	}
}

/** Handle score codex candidate. */
function scoreCodexCandidate({
	candidate,
	cwd,
	processStartedAtMs,
}: {
	candidate: CodexSessionCandidate;
	cwd: string | null;
	processStartedAtMs: number | null;
}): number {
	try {
		let score = 0;
		const normalizedCwd = normalizePathForMatch({ path: cwd });
		const normalizedMetaCwd = normalizePathForMatch({
			path: candidate.meta?.cwd ?? null,
		});
		if (normalizedCwd && normalizedMetaCwd) {
			if (normalizedCwd === normalizedMetaCwd) score += 10_000;
			else if (
				normalizedMetaCwd.startsWith(normalizedCwd) ||
				normalizedCwd.startsWith(normalizedMetaCwd)
			) {
				score += 6_000;
			} else {
				score -= 2_000;
			}
		}

		const metaTimestampMs = candidate.meta?.timestampMs ?? null;
		if (processStartedAtMs !== null && metaTimestampMs !== null) {
			const diffMs = Math.abs(metaTimestampMs - processStartedAtMs);
			if (diffMs <= 60_000) score += 5_000;
			else if (diffMs <= 5 * 60_000) score += 3_500;
			else if (diffMs <= 30 * 60_000) score += 2_000;
			else if (diffMs <= 2 * 60 * 60_000) score += 1_000;
			else if (diffMs <= 24 * 60 * 60_000) score += 250;
			else score -= 500;
		}

		const ageMinutes = Math.max(0, Math.floor((Date.now() - candidate.mtime) / 60_000));
		score += Math.max(0, 500 - ageMinutes);
		if (candidate.meta?.id) score += 20;
		return score;
	} catch {
		return Number.NEGATIVE_INFINITY;
	}
}

/** Build codex lookup cache key. */
function buildCodexLookupCacheKey({
	cwd,
	processStartedAt,
}: {
	cwd: string | null;
	processStartedAt: string | null;
}): string {
	try {
		const normalizedCwd = normalizePathForMatch({ path: cwd }) ?? "";
		const startedAt = processStartedAt ?? "";
		return `${normalizedCwd}|${startedAt}`;
	} catch {
		return "";
	}
}

/** Normalize path for match. */
function normalizePathForMatch({ path }: { path: string | null }): string | null {
	try {
		if (!path) return null;
		return path.replace(/\\/g, "/").replace(/\/+$/g, "");
	} catch {
		return null;
	}
}

/** Handle parse timestamp ms. */
function parseTimestampMs({ value }: { value: unknown }): number | null {
	try {
		if (typeof value === "number" && Number.isFinite(value)) {
			// Accept both unix seconds and unix milliseconds.
			return value >= 1_000_000_000_000 ? value : value * 1000;
		}
		if (typeof value !== "string") return null;

		const direct = Date.parse(value);
		if (Number.isFinite(direct)) return direct;

		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return null;
		return numeric >= 1_000_000_000_000 ? numeric : numeric * 1000;
	} catch {
		return null;
	}
}

/** Handle path exists. */
async function pathExists({ path }: { path: string }): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Normalize Codex JSONL entries to the same JsonlEntry format as Claude Code.
 * Maps codex types (response_item/message, event_msg/user_message, etc.)
 * to our unified format (user, assistant, tool_use, tool_result).
 */
export function normalizeCodexEntries(raw: JsonlEntry[]): JsonlEntry[] {
	const entries: JsonlEntry[] = [];
	const toolNameByCallId = new Map<string, string>();
	for (const entry of raw) {
		const topType = (entry as Record<string, unknown>).type as string;
		const payload = (entry as Record<string, unknown>).payload as
			| Record<string, unknown>
			| undefined;
		if (!payload) continue;
		const payloadType = payload.type as string | undefined;

		if (topType === "event_msg" && payloadType === "user_message") {
			entries.push({
				type: "user",
				message: {
					role: "user",
					content: (payload.message as string) ?? "",
				},
			});
		} else if (topType === "response_item" && payloadType === "message") {
			const role = payload.role as string;
			if (role === "assistant") {
				const content = payload.content as unknown[];
				const text = content
					?.map((c) => {
						if (typeof c === "object" && c !== null && "text" in c) {
							return (c as { text: string }).text;
						}
						return "";
					})
					.filter(Boolean)
					.join("") ?? "";
				if (text) {
					entries.push({
						type: "assistant",
						message: { role: "assistant", content: text },
					});
				}
			} else if (role === "user") {
				const content = payload.content as unknown[];
				const text = content
					?.map((c) => {
						if (typeof c === "object" && c !== null && "text" in c) {
							return (c as { text: string }).text;
						}
						return "";
					})
					.filter(Boolean)
					.join("") ?? "";
				if (text && text.length < 2000) {
					entries.push({
						type: "user",
						message: { role: "user", content: text },
					});
				}
			}
		} else if (
			topType === "response_item" &&
			(payloadType === "function_call" || payloadType === "custom_tool_call")
		) {
			const toolName = (payload.name as string) ?? "unknown";
			const toolDetail =
				payloadType === "function_call"
					? extractFunctionCallToolDetail({ payload })
					: extractCustomToolCallDetail({ payload });
			const callId =
				typeof payload.call_id === "string" ? payload.call_id : null;
			if (callId) {
				toolNameByCallId.set(callId, toolName);
			}
			entries.push({
				type: "tool_use",
				toolName,
				toolDetail,
			});
		} else if (
			topType === "response_item" &&
			(payloadType === "function_call_output" ||
				payloadType === "custom_tool_call_output")
		) {
			const callId =
				typeof payload.call_id === "string" ? payload.call_id : null;
			const outputToolName = callId
				? toolNameByCallId.get(callId) ?? undefined
				: undefined;
			const { toolResult, toolResultError } = extractToolResultSummary({
				payload,
			});
			entries.push({
				type: "tool_result",
				toolName: outputToolName,
				toolResult,
				toolResultError,
			});
		}
	}
	return entries;
}

/** Handle extract function call tool detail. */
function extractFunctionCallToolDetail({
	payload,
}: {
	payload: Record<string, unknown>;
}): string | undefined {
	try {
		const args = JSON.parse(
			(payload.arguments as string) ?? "{}",
		) as Record<string, unknown>;
		if (args.cmd) return String(args.cmd);
		if (args.file_path) return String(args.file_path);
		if (args.pattern) return String(args.pattern);
		if (args.query) return String(args.query);
		return compactValue({ value: args });
	} catch {
		return undefined;
	}
}

/** Handle extract custom tool call detail. */
function extractCustomToolCallDetail({
	payload,
}: {
	payload: Record<string, unknown>;
}): string | undefined {
	try {
		const input = payload.input;
		return compactValue({ value: input });
	} catch {
		return undefined;
	}
}

/** Handle extract tool result summary. */
function extractToolResultSummary({
	payload,
}: {
	payload: Record<string, unknown>;
}): { toolResult?: string; toolResultError: boolean } {
	try {
		let toolResultError = false;
		const status = typeof payload.status === "string" ? payload.status : null;
		if (
			status === "failed" ||
			status === "errored" ||
			status === "error" ||
			status === "denied"
		) {
			toolResultError = true;
		}

		const outputValue = parseMaybeJson({ value: payload.output });
		const outputRecord = toRecord({ value: outputValue });

		let detail: string | undefined;
		if (outputRecord !== null) {
			const outputText = outputRecord["output"];
			const errorText = outputRecord["error"];
			if (typeof outputText === "string") {
				detail = outputText;
			} else if (typeof errorText === "string") {
				detail = errorText;
				toolResultError = true;
			} else {
				detail = compactValue({ value: outputRecord });
			}

			const metadata = toRecord({ value: outputRecord["metadata"] });
			const exitCodeValue = metadata?.["exit_code"];
			const exitCode =
				typeof exitCodeValue === "number" ? exitCodeValue : null;
			if (exitCode !== null) {
				if (exitCode !== 0) toolResultError = true;
				const exitPrefix = `[exit ${exitCode}]`;
				detail = detail ? `${exitPrefix} ${detail}` : exitPrefix;
			}
		} else if (typeof outputValue === "string") {
			detail = outputValue;
		} else {
			detail = compactValue({ value: outputValue });
		}

		return {
			toolResult: detail,
			toolResultError,
		};
	} catch {
		return { toolResultError: true };
	}
}

/** Handle parse maybe json. */
function parseMaybeJson({ value }: { value: unknown }): unknown {
	try {
		if (typeof value !== "string") return value;
		const trimmed = value.trim();
		if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
		return JSON.parse(trimmed) as unknown;
	} catch {
		return value;
	}
}

/** Handle to record. */
function toRecord({ value }: { value: unknown }): Record<string, unknown> | null {
	try {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Handle compact value. */
function compactValue({ value }: { value: unknown }): string | undefined {
	try {
		if (value === null || value === undefined) return undefined;
		if (typeof value === "string") return compactText({ text: value });
		return compactText({ text: JSON.stringify(value) });
	} catch {
		return undefined;
	}
}

/** Handle compact text. */
function compactText({ text }: { text: string }): string | undefined {
	try {
		const singleLine = text.replace(/\s+/g, " ").trim();
		if (!singleLine) return undefined;
		const maxLength = 220;
		if (singleLine.length <= maxLength) return singleLine;
		return `${singleLine.slice(0, maxLength - 1)}…`;
	} catch {
		return undefined;
	}
}
