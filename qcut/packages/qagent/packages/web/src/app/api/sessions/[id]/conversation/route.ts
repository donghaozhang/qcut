/**
 * GET /api/sessions/:id/conversation
 *
 * Read the Claude Code JSONL session file for a CLI session and return
 * parsed conversation entries. Only works for claude-code agent sessions
 * that have a CWD (needed to resolve the JSONL path).
 */

import { type NextRequest, NextResponse } from "next/server";
import { findCLISession } from "@/lib/cli-sessions";
import {
	resolveClaudeProjectDir,
	findLatestSessionFile,
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

/** Slim down entries to only the fields the UI needs. */
function filterEntries(entries: JsonlEntry[], limit: number): JsonlEntry[] {
	const visible = entries.filter((e) => e.type && VISIBLE_TYPES.has(e.type));
	return visible.slice(-limit);
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const session = await findCLISession(id);

	if (!session) {
		return NextResponse.json(
			{ error: "CLI session not found" },
			{ status: 404 },
		);
	}

	if (session.metadata.agent !== "claude-code") {
		return NextResponse.json(
			{ error: "Conversation view is only available for Claude Code sessions" },
			{ status: 400 },
		);
	}

	const cwd = session.metadata.cwd;
	if (!cwd) {
		return NextResponse.json(
			{ error: "No working directory available for this session" },
			{ status: 400 },
		);
	}

	const projectDir = resolveClaudeProjectDir(cwd);
	const sessionFile = await findLatestSessionFile(projectDir);

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
	const entries = filterEntries(allEntries, limit);

	return NextResponse.json({
		sessionId: id,
		cwd,
		entries,
		total: allEntries.length,
		updatedAt: new Date().toISOString(),
	});
}
