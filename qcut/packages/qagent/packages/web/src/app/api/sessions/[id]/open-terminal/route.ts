import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { type NextRequest, NextResponse } from "next/server";
import { findCLISession } from "@/lib/cli-sessions";
import {
	escapeAppleScript,
	normalizeTTY,
	detectTerminalApp,
} from "@/lib/terminal-utils";

const execFileAsync = promisify(execFile);

/** Bring a macOS app to the foreground via AppleScript. */
async function activateApp(appName: string): Promise<boolean> {
	const safe = escapeAppleScript(appName);
	try {
		await execFileAsync(
			"osascript",
			["-e", `tell application "${safe}" to activate`],
			{ timeout: 5_000 },
		);
		return true;
	} catch {
		return false;
	}
}

/** Find and activate the iTerm2 tab matching the given TTY. */
async function activateITerm2Tab(tty: string): Promise<boolean> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const script = `
tell application "iTerm2"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			repeat with aSession in sessions of aTab
				try
					if tty of aSession ends with "${fullTTY}" then
						select aWindow
						select aTab
						activate
						return "FOUND"
					end if
				end try
			end repeat
		end repeat
	end repeat
	return "NOT_FOUND"
end tell`;
	try {
		const { stdout } = await execFileAsync("osascript", ["-e", script], {
			timeout: 5_000,
		});
		return stdout.trim() === "FOUND";
	} catch {
		return false;
	}
}

/** Find and activate the macOS Terminal.app tab matching the given TTY. */
async function activateTerminalTab(tty: string): Promise<boolean> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const script = `
tell application "Terminal"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			try
				if tty of aTab ends with "${fullTTY}" then
					set selected tab of aWindow to aTab
					set index of aWindow to 1
					activate
					return "FOUND"
				end if
			end try
		end repeat
	end repeat
	return "NOT_FOUND"
end tell`;
	try {
		const { stdout } = await execFileAsync("osascript", ["-e", script], {
			timeout: 5_000,
		});
		return stdout.trim() === "FOUND";
	} catch {
		return false;
	}
}

/** POST /api/sessions/:id/open-terminal — Activate the terminal for a CLI session */
export async function POST(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	if (platform() !== "darwin") {
		return NextResponse.json(
			{ error: "Open terminal is only supported on macOS" },
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
	const pid = session.metadata.pid;
	if (!tty) {
		return NextResponse.json(
			{ error: "No TTY associated with session" },
			{ status: 400 },
		);
	}

	// Detect which terminal app owns this process
	const app = pid ? await detectTerminalApp(parseInt(pid, 10)) : null;

	// For Cursor/VS Code: bring the app to front (can't select specific terminal tab via AppleScript)
	if (app === "Cursor" || app === "Code") {
		const appName = app === "Cursor" ? "Cursor" : "Visual Studio Code";
		const activated = await activateApp(appName);
		return NextResponse.json({
			ok: activated,
			tty,
			app,
			method: "activate-app",
		});
	}

	// For iTerm2: select the exact tab
	if (app === "iTerm") {
		const found = await activateITerm2Tab(tty);
		if (found) return NextResponse.json({ ok: true, tty, app, method: "tab" });
	}

	// For Terminal.app or unknown: try Terminal.app tab selection
	const found = await activateTerminalTab(tty);
	if (found) {
		return NextResponse.json({
			ok: true,
			tty,
			app: "Terminal",
			method: "tab",
		});
	}

	// Fallback: try iTerm2 then just activate whatever we found
	if (app !== "iTerm") {
		const iTermFound = await activateITerm2Tab(tty);
		if (iTermFound) {
			return NextResponse.json({
				ok: true,
				tty,
				app: "iTerm",
				method: "tab",
			});
		}
	}

	// Last resort: if we know the app, bring it to front
	if (app) {
		await activateApp(app);
		return NextResponse.json({ ok: true, tty, app, method: "activate-app" });
	}

	return NextResponse.json(
		{ error: `No terminal found for TTY ${tty}` },
		{ status: 404 },
	);
}
