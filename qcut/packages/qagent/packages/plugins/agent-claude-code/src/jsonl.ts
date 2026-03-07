/**
 * JSONL parsing utilities for Claude Code session files.
 *
 * Claude stores session data as JSONL files at ~/.claude/projects/{encoded-path}/.
 * This module handles path encoding, file discovery, and data extraction.
 */

import { readdir, readFile, stat, open } from "node:fs/promises";
import { basename, join } from "node:path";
import type { CostEstimate } from "@composio/ao-core";

// =============================================================================
// Path Encoding
// =============================================================================

/**
 * Convert a workspace path to Claude's project directory path.
 * Claude stores sessions at ~/.claude/projects/{encoded-path}/
 *
 * Verified against Claude Code's actual encoding (as of v1.x):
 * the path has its leading / stripped, then all / and . are replaced with -.
 * e.g. /Users/dev/.worktrees/ao → Users-dev--worktrees-ao
 *
 * If Claude Code changes its encoding scheme this will silently break
 * introspection. The path can be validated at runtime by checking whether
 * the resulting directory exists.
 */
export function toClaudeProjectPath(workspacePath: string): string {
	// Handle Windows drive letters (C:\Users\... → C-Users-...)
	const normalized = workspacePath.replace(/\\/g, "/");
	// Claude Code replaces / and . with - (keeping the leading slash as a leading -)
	return normalized.replace(/:/g, "").replace(/[/.]/g, "-");
}

// =============================================================================
// File Discovery
// =============================================================================

/** Find the most recently modified .jsonl session file in a directory */
export async function findLatestSessionFile(
	projectDir: string
): Promise<string | null> {
	let entries: string[];
	try {
		entries = await readdir(projectDir);
	} catch {
		return null;
	}

	const jsonlFiles = entries.filter(
		(f) => f.endsWith(".jsonl") && !f.startsWith("agent-")
	);
	if (jsonlFiles.length === 0) return null;

	// Sort by mtime descending
	const withStats = await Promise.all(
		jsonlFiles.map(async (f) => {
			const fullPath = join(projectDir, f);
			try {
				const s = await stat(fullPath);
				return { path: fullPath, mtime: s.mtimeMs };
			} catch {
				return { path: fullPath, mtime: 0 };
			}
		})
	);
	withStats.sort((a, b) => b.mtime - a.mtime);
	return withStats[0]?.path ?? null;
}

/** Extract session UUID from a JSONL filename (e.g. "abc123.jsonl" → "abc123") */
export function sessionIdFromFile(filePath: string): string {
	return basename(filePath, ".jsonl");
}

// =============================================================================
// JSONL Types
// =============================================================================

export interface JsonlLine {
	type?: string;
	summary?: string;
	message?: { content?: string; role?: string };
	// Cost/usage fields
	costUSD?: number;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
	inputTokens?: number;
	outputTokens?: number;
	estimatedCostUsd?: number;
}

// =============================================================================
// Tail Parsing
// =============================================================================

/**
 * Parse only the last `maxBytes` of a JSONL file.
 * Summaries and recent activity are always near the end, so reading the whole
 * file (which can be 100MB+) is wasteful. For files smaller than maxBytes,
 * readFile is used directly. For large files, only the tail is read via a
 * file handle to avoid loading the entire file into memory.
 */
export async function parseJsonlFileTail(
	filePath: string,
	maxBytes = 131_072
): Promise<JsonlLine[]> {
	let content: string;
	let offset: number;
	try {
		const { size = 0 } = await stat(filePath);
		offset = Math.max(0, size - maxBytes);
		if (offset === 0) {
			// Small file (or unknown size) — read it whole
			content = await readFile(filePath, "utf-8");
		} else {
			// Large file — read only the tail via a file handle
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
	// Skip potentially truncated first line only when we started mid-file.
	// If offset === 0 we read from the start so the first line is complete.
	const firstNewline = content.indexOf("\n");
	const safeContent =
		offset > 0 && firstNewline >= 0 ? content.slice(firstNewline + 1) : content;
	const lines: JsonlLine[] = [];
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
				lines.push(parsed as JsonlLine);
			}
		} catch {
			// Skip malformed lines
		}
	}
	return lines;
}

// =============================================================================
// Data Extraction
// =============================================================================

/** Extract auto-generated summary from JSONL (last "summary" type entry) */
export function extractSummary(
	lines: JsonlLine[]
): { summary: string; isFallback: boolean } | null {
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line?.type === "summary" && line.summary) {
			return { summary: line.summary, isFallback: false };
		}
	}
	// Fallback: first user message truncated to 120 chars
	for (const line of lines) {
		if (
			line?.type === "user" &&
			line.message?.content &&
			typeof line.message.content === "string"
		) {
			const msg = line.message.content.trim();
			if (msg.length > 0) {
				return {
					summary: msg.length > 120 ? msg.substring(0, 120) + "..." : msg,
					isFallback: true,
				};
			}
		}
	}
	return null;
}

/** Aggregate cost estimate from JSONL usage events */
export function extractCost(lines: JsonlLine[]): CostEstimate | undefined {
	let inputTokens = 0;
	let outputTokens = 0;
	let totalCost = 0;

	for (const line of lines) {
		// Handle direct cost fields — prefer costUSD; only use estimatedCostUsd
		// as fallback to avoid double-counting when both are present.
		if (typeof line.costUSD === "number") {
			totalCost += line.costUSD;
		} else if (typeof line.estimatedCostUsd === "number") {
			totalCost += line.estimatedCostUsd;
		}
		// Handle token counts — prefer the structured `usage` object when present;
		// only fall back to flat `inputTokens`/`outputTokens` fields to avoid
		// double-counting if a line contains both.
		if (line.usage) {
			inputTokens += line.usage.input_tokens ?? 0;
			inputTokens += line.usage.cache_read_input_tokens ?? 0;
			inputTokens += line.usage.cache_creation_input_tokens ?? 0;
			outputTokens += line.usage.output_tokens ?? 0;
		} else {
			if (typeof line.inputTokens === "number") {
				inputTokens += line.inputTokens;
			}
			if (typeof line.outputTokens === "number") {
				outputTokens += line.outputTokens;
			}
		}
	}

	if (inputTokens === 0 && outputTokens === 0 && totalCost === 0) {
		return undefined;
	}

	// Rough estimate when no direct cost data — uses Sonnet 4.5 pricing as a
	// baseline. Will be inaccurate for other models (Opus, Haiku) but provides
	// a useful order-of-magnitude signal.
	if (totalCost === 0 && (inputTokens > 0 || outputTokens > 0)) {
		totalCost =
			(inputTokens / 1_000_000) * 3.0 + (outputTokens / 1_000_000) * 15.0;
	}

	return { inputTokens, outputTokens, estimatedCostUsd: totalCost };
}
