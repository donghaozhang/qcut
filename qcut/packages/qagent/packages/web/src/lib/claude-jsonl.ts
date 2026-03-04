/**
 * Claude Code JSONL session file utilities.
 *
 * Ported from packages/plugins/agent-claude-code/src/index.ts for use by
 * the web dashboard without pulling in the full agent plugin.
 */

import { readdir, readFile, stat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

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
 * Returns the full path to ~/.claude/projects/{encoded-cwd}/ or null.
 */
export function resolveClaudeProjectDir(cwd: string): string {
	const encoded = toClaudeProjectPath(cwd);
	return join(homedir(), ".claude", "projects", encoded);
}
