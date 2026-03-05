/**
 * Core JSONL utilities shared by Claude Code and Codex session readers.
 */

import { readdir, readFile, stat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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
		(fileName) => fileName.endsWith(".jsonl") && !fileName.startsWith("agent-"),
	);
	if (jsonlFiles.length === 0) return null;

	const withStats = await Promise.all(
		jsonlFiles.map(async (fileName) => {
			const fullPath = join(projectDir, fileName);
			try {
				const fileStats = await stat(fullPath);
				return { path: fullPath, mtimeMs: fileStats.mtimeMs };
			} catch {
				return { path: fullPath, mtimeMs: 0 };
			}
		}),
	);
	withStats.sort((fileA, fileB) => fileB.mtimeMs - fileA.mtimeMs);
	return withStats[0]?.path ?? null;
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

/** Read first line of a JSONL file up to maxBytes. */
export async function readJsonlFirstLine({
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

/** Parse unknown value into a plain object record. */
export function toRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	try {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Parse timestamp-like values to milliseconds since epoch. */
export function parseTimestampMs({
	value,
}: {
	value: unknown;
}): number | null {
	try {
		if (typeof value === "number" && Number.isFinite(value)) {
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
