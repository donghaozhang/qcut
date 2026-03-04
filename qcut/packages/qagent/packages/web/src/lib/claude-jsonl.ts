/**
 * JSONL session file utilities for Claude Code and Codex CLI.
 *
 * Claude Code stores at ~/.claude/projects/{encoded-cwd}/*.jsonl
 * Codex stores at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
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
	/** Short detail string for tool_use (file path, command, pattern, etc.) */
	toolDetail?: string;
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
	const sessionsDir = join(homedir(), ".codex", "sessions");
	try {
		// Walk year/month/day directories in reverse to find most recent
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
					const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
					if (jsonlFiles.length === 0) continue;
					// Find newest by mtime within the day
					const withStats = await Promise.all(
						jsonlFiles.map(async (f) => {
							const p = join(dayDir, f);
							try {
								const s = await stat(p);
								return { path: p, mtime: s.mtimeMs };
							} catch {
								return { path: p, mtime: 0 };
							}
						}),
					);
					withStats.sort((a, b) => b.mtime - a.mtime);
					return withStats[0]?.path ?? null;
				}
			}
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Normalize Codex JSONL entries to the same JsonlEntry format as Claude Code.
 * Maps codex types (response_item/message, event_msg/user_message, etc.)
 * to our unified format (user, assistant, tool_use, tool_result).
 */
export function normalizeCodexEntries(raw: JsonlEntry[]): JsonlEntry[] {
	const entries: JsonlEntry[] = [];
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
		} else if (topType === "response_item" && payloadType === "function_call") {
			const toolName = (payload.name as string) ?? "unknown";
			let toolDetail: string | undefined;
			try {
				const args = JSON.parse(
					(payload.arguments as string) ?? "{}",
				) as Record<string, unknown>;
				if (args.cmd) toolDetail = String(args.cmd);
				else if (args.file_path) toolDetail = String(args.file_path);
				else if (args.pattern) toolDetail = String(args.pattern);
			} catch {
				// malformed arguments
			}
			entries.push({
				type: "tool_use",
				toolName,
				toolDetail,
			});
		} else if (
			topType === "response_item" &&
			payloadType === "function_call_output"
		) {
			entries.push({ type: "tool_result" });
		}
	}
	return entries;
}
