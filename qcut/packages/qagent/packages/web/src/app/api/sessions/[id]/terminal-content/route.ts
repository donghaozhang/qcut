/**
 * GET /api/sessions/:id/terminal-content
 *
 * Read the visible terminal content for a CLI session via AppleScript.
 * macOS only — returns 400 on other platforms.
 */

import { platform } from "node:os";
import { NextResponse } from "next/server";
import { findCLISession } from "@/lib/cli-sessions";
import {
	detectTerminalApp,
	readITerm2Content,
	readTerminalAppContent,
} from "@/lib/terminal-utils";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	if (platform() !== "darwin") {
		return NextResponse.json(
			{ error: "Terminal content mirroring is only supported on macOS" },
			{ status: 400 },
		);
	}

	const { id } = await params;
	const session = await findCLISession(id);

	if (!session) {
		return NextResponse.json(
			{ error: "CLI session not found" },
			{ status: 404 },
		);
	}

	const tty = session.metadata.tty;
	if (!tty) {
		return NextResponse.json(
			{ error: "No TTY associated with session" },
			{ status: 400 },
		);
	}

	const pid = session.metadata.pid;
	const app = pid ? await detectTerminalApp(parseInt(pid, 10)) : null;

	// Try the detected app first, then fall back to the other
	let content: string | null = null;
	let resolvedApp = app;

	if (app === "iTerm") {
		content = await readITerm2Content(tty);
	} else if (app === "Terminal") {
		content = await readTerminalAppContent(tty);
	}

	// Fallback: try both if detected app didn't work or wasn't detected
	if (content === null && app !== "iTerm") {
		content = await readITerm2Content(tty);
		if (content !== null) resolvedApp = "iTerm";
	}
	if (content === null && app !== "Terminal") {
		content = await readTerminalAppContent(tty);
		if (content !== null) resolvedApp = "Terminal";
	}

	if (content === null) {
		return NextResponse.json(
			{ error: `Could not read terminal content for TTY ${tty}` },
			{ status: 404 },
		);
	}

	return NextResponse.json({
		content,
		tty,
		app: resolvedApp,
		timestamp: new Date().toISOString(),
	});
}
