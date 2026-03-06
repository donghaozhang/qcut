import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { type NextRequest, NextResponse } from "next/server";
import { validateString } from "@/lib/validation";
import { getServices } from "@/lib/services";
import { findCLISession } from "@/lib/cli-sessions";
import {
	sendITerm2Text,
	sendTerminalAppText,
	sendCursorText,
	matchVSCodeTaskIndex,
} from "@/lib/terminal-utils";

/** POST /api/commands/prtaskit — Read prtaskit.md and send it to a session */
export async function POST(request: NextRequest) {
	const body = (await request.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;

	const sessionId = String(body?.sessionId ?? "");
	const idErr = validateString(sessionId, "sessionId", 256);
	if (idErr) {
		return NextResponse.json({ error: idErr }, { status: 400 });
	}

	try {
		const { config, sessionManager } = await getServices();

		const repoRoot = dirname(config.configPath);
		const filePath = join(repoRoot, ".claude", "commands", "prtaskit.md");
		const instruction = readFileSync(filePath, "utf-8").trim();

		if (!instruction) {
			return NextResponse.json(
				{ error: "prtaskit.md is empty" },
				{ status: 422 }
			);
		}

		const isCLISession = /^(claude-code|codex):\d+$/.test(sessionId);

		if (!isCLISession) {
			await sessionManager.send(sessionId, instruction);
			return NextResponse.json({ ok: true, sessionId, method: "managed" });
		}

		if (platform() !== "darwin") {
			return NextResponse.json(
				{ error: `Session ${sessionId} not found and terminal send is only supported on macOS` },
				{ status: 404 }
			);
		}

		const cliSession = await findCLISession(sessionId);
		if (!cliSession) {
			return NextResponse.json(
				{ error: `Session ${sessionId} not found` },
				{ status: 404 }
			);
		}

		const tty = cliSession.metadata.tty;
		const termApp = cliSession.metadata.terminalApp ?? null;

		if (!tty) {
			return NextResponse.json(
				{ error: `Session ${sessionId} has no TTY — cannot send` },
				{ status: 422 }
			);
		}

		let sent = false;
		if (termApp === "iTerm") {
			sent = await sendITerm2Text(tty, instruction);
		} else if (termApp === "Terminal") {
			sent = await sendTerminalAppText(tty, instruction);
		} else if (termApp === "Cursor" || termApp === "Code") {
			const pid = cliSession.metadata.pid ? parseInt(cliSession.metadata.pid, 10) : undefined;
			const cwd = cliSession.metadata.cwd ?? undefined;
			const terminalIndex = pid ? await matchVSCodeTaskIndex(pid, cwd) : null;
			sent = await sendCursorText(instruction, terminalIndex);
		}

		if (!sent) {
			return NextResponse.json(
				{ error: `Could not send to session ${sessionId} (terminal: ${termApp ?? "unknown"})` },
				{ status: 422 }
			);
		}

		return NextResponse.json({ ok: true, sessionId, method: termApp ?? "tty" });
	} catch (err) {
		const msg =
			err instanceof Error ? err.message : "Failed to send prtaskit instruction";
		const status =
			msg.includes("not found") || msg.includes("ENOENT") ? 404 : 500;
		return NextResponse.json({ error: msg }, { status });
	}
}
