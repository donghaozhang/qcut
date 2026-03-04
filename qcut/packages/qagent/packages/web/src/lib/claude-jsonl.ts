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

const codexSessionLookupCache = new Map<
	string,
	{ path: string; expiresAt: number }
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

function normalizePathForMatch({ path }: { path: string | null }): string | null {
	try {
		if (!path) return null;
		return path.replace(/\\/g, "/").replace(/\/+$/g, "");
	} catch {
		return null;
	}
}

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

function compactValue({ value }: { value: unknown }): string | undefined {
	try {
		if (value === null || value === undefined) return undefined;
		if (typeof value === "string") return compactText({ text: value });
		return compactText({ text: JSON.stringify(value) });
	} catch {
		return undefined;
	}
}

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
