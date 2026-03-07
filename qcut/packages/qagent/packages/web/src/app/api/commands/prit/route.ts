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

/** POST /api/commands/prit — Read prit.md and send it to a session */
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

		// Resolve prit.md relative to the repo root (dirname of qagent.yaml)
		const repoRoot = dirname(config.configPath);
		const pritPath = join(repoRoot, ".claude", "commands", "prit.md");
		const instruction = readFileSync(pritPath, "utf-8").trim();

		if (!instruction) {
			return NextResponse.json(
				{ error: "prit.md is empty" },
				{ status: 422 }
			);
		}

		// CLI session IDs (e.g. "claude-code:48847") contain ":" which is rejected
		// by the core session manager's path validator — skip directly to terminal send.
		const isCLISession = /^(claude-code|codex):\d+$/.test(sessionId);

		if (!isCLISession) {
			// Managed session — send via session manager
			await sessionManager.send(sessionId, instruction);
			return NextResponse.json({ ok: true, sessionId, method: "managed" });
		}

		// Unmanaged CLI session — send via terminal app
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
			const terminalName = cliSession.metadata.terminalName ?? null;
			const terminalIndex = pid ? await matchVSCodeTaskIndex(pid, cwd) : null;
			sent = await sendCursorText(instruction, terminalIndex, termApp as "Cursor" | "Code", terminalName);
		}

		if (!sent) {
			return NextResponse.json(
				{ error: `Could not send to session ${sessionId} (terminal: ${termApp ?? "unknown"})` },
				{ status: 422 }
			);
		}

		return NextResponse.json({ ok: true, sessionId, method: termApp ?? "tty" });
	} catch (err) {
		const raw = err instanceof Error ? err.message : "";
		const status = raw.includes("not found") || raw.includes("ENOENT") ? 404 : 500;
		const msg = status === 404 ? "Resource not found" : "Failed to send prit instruction";
		console.error("[prit]", raw);
		return NextResponse.json({ error: msg }, { status });
	}
}
