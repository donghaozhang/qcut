/**
 * GET /api/sessions/:id/conversation
 *
 * Read the JSONL session file for a CLI session (Claude Code or Codex)
 * and return parsed conversation entries.
 */

import { type NextRequest, NextResponse } from "next/server";
import { findCLISession } from "@/lib/cli-sessions";
import {
	resolveClaudeProjectDir,
	findLatestSessionFile,
	findLatestCodexSessionFile,
	findCodexSessionFileForContext,
	normalizeCodexEntries,
	parseJsonlFileTail,
	type JsonlEntry,
} from "@/lib/claude-jsonl";

/** Entry types worth showing in the conversation viewer. */
const VISIBLE_TYPES = new Set([
	"user",
	"assistant",
	"tool_use",
	"tool_result",
	"summary",
	"permission_request",
	"error",
]);

/** Extract tool detail from a Claude Code tool_use content block input. */
function extractToolDetail(input: Record<string, unknown>): string | undefined {
	if (input.command) return String(input.command);
	if (input.file_path) return String(input.file_path);
	if (input.pattern) return String(input.pattern);
	if (input.query) return String(input.query);
	return undefined;
}

/**
 * Expand Claude Code assistant entries that contain tool_use content blocks
 * into separate tool_use entries with detail, then filter to visible types.
 */
function filterEntries(entries: JsonlEntry[], limit: number): JsonlEntry[] {
	const expanded: JsonlEntry[] = [];
	for (const entry of entries) {
		if (!entry.type || !VISIBLE_TYPES.has(entry.type)) continue;

		if (entry.type === "assistant") {
			const content = entry.message?.content;
			if (Array.isArray(content)) {
				// Split: text blocks → assistant entry, tool_use blocks → tool_use entries
				const textParts: string[] = [];
				const toolBlocks: JsonlEntry[] = [];
				for (const block of content) {
					if (typeof block === "string") {
						textParts.push(block);
					} else if (typeof block === "object" && block !== null) {
						const b = block as Record<string, unknown>;
						if (b.type === "tool_use") {
							const input = (b.input ?? {}) as Record<string, unknown>;
							toolBlocks.push({
								type: "tool_use",
								toolName: (b.name as string) ?? "unknown",
								toolDetail: extractToolDetail(input),
							});
						} else if (b.type === "text" && b.text) {
							textParts.push(String(b.text));
						}
					}
				}
				const text = textParts.join("").trim();
				if (text) {
					expanded.push({
						type: "assistant",
						message: { role: "assistant", content: text },
					});
				}
				expanded.push(...toolBlocks);
			} else {
				expanded.push(entry);
			}
		} else {
			expanded.push(entry);
		}
	}
	return expanded.slice(-limit);
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id } = await params;
		const session = await findCLISession(id);

		if (!session) {
			return NextResponse.json(
				{ error: "CLI session not found" },
				{ status: 404 },
			);
		}

		const agent = session.metadata.agent;
		if (agent !== "claude-code" && agent !== "codex") {
			return NextResponse.json(
				{
					error:
						"Conversation view is only available for Claude Code and Codex sessions",
				},
				{ status: 400 },
			);
		}

		const cwd = session.metadata.cwd;

		// Resolve session file based on agent type
		let sessionFile: string | null = null;
		if (agent === "claude-code") {
			if (!cwd) {
				return NextResponse.json(
					{ error: "No working directory available for this session" },
					{ status: 400 },
				);
			}
			const projectDir = resolveClaudeProjectDir(cwd);
			sessionFile = await findLatestSessionFile(projectDir);
		} else {
			const processStartedAt = session.metadata.processStartedAt ?? null;
			sessionFile = await findCodexSessionFileForContext({
				cwd,
				processStartedAt,
			});
			if (!sessionFile) {
				sessionFile = await findLatestCodexSessionFile();
			}
		}

		if (!sessionFile) {
			return NextResponse.json(
				{ error: "No JSONL session file found" },
				{ status: 404 },
			);
		}

		const limitParam = request.nextUrl.searchParams.get("limit");
		const limit = Math.min(
			Math.max(parseInt(limitParam ?? "100", 10) || 100, 1),
			500,
		);

		const allEntries = await parseJsonlFileTail(sessionFile, 262_144);
		const normalized =
			agent === "codex" ? normalizeCodexEntries(allEntries) : allEntries;
		const entries = filterEntries(normalized, limit);

		return NextResponse.json({
			sessionId: id,
			cwd: cwd ?? null,
			entries,
			total: normalized.length,
			updatedAt: new Date().toISOString(),
		});
	} catch {
		return NextResponse.json(
			{ error: "Failed to load session conversation" },
			{ status: 500 },
		);
	}
}
