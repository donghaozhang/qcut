/**
 * macOS terminal utilities for reading content from iTerm2 and Terminal.app.
 *
 * Shared by /api/sessions/[id]/open-terminal and /api/sessions/[id]/terminal-content.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Escape a string for safe embedding in AppleScript double-quoted strings. */
export function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Normalize a TTY identifier to its full /dev/ path. */
export function normalizeTTY(tty: string): string {
	if (tty.startsWith("/dev/")) return tty;
	return tty.startsWith("tty") ? `/dev/${tty}` : `/dev/tty${tty}`;
}

/**
 * Walk the process tree to find which app owns the TTY.
 * Returns the app name (e.g. "Cursor", "Code", "Terminal") or null.
 */
export async function detectTerminalApp(
	pid: number,
): Promise<string | null> {
	let current = pid;
	for (let depth = 0; depth < 10; depth++) {
		try {
			const { stdout } = await execFileAsync(
				"ps",
				["-o", "ppid=,comm=", "-p", String(current)],
				{ timeout: 3_000 },
			);
			const trimmed = stdout.trim();
			if (!trimmed) return null;
			const match = trimmed.match(/^\s*(\d+)\s+(.+)$/);
			if (!match) return null;
			const ppid = parseInt(match[1]!, 10);
			const comm = match[2]!;
			if (/Cursor/i.test(comm)) return "Cursor";
			if (/Code Helper|Visual Studio Code/i.test(comm)) return "Code";
			if (/Terminal$/i.test(comm)) return "Terminal";
			if (/iTerm/i.test(comm)) return "iTerm";
			if (ppid <= 1) return null;
			current = ppid;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Read the scrollback content of an iTerm2 session matching the given TTY.
 * Returns the text content or null if not found.
 */
export async function readITerm2Content(
	tty: string,
): Promise<string | null> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const script = `
tell application "iTerm2"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			repeat with aSession in sessions of aTab
				try
					if tty of aSession ends with "${fullTTY}" then
						return contents of aSession
					end if
				end try
			end repeat
		end repeat
	end repeat
	return "NOT_FOUND"
end tell`;
	try {
		const { stdout } = await execFileAsync("osascript", ["-e", script], {
			timeout: 8_000,
		});
		const content = stdout.trimEnd();
		return content === "NOT_FOUND" ? null : content;
	} catch {
		return null;
	}
}

/**
 * Read the scrollback content of a Terminal.app tab matching the given TTY.
 * Returns the text content or null if not found.
 */
export async function readTerminalAppContent(
	tty: string,
): Promise<string | null> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const script = `
tell application "Terminal"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			try
				if tty of aTab ends with "${fullTTY}" then
					return contents of aTab
				end if
			end try
		end repeat
	end repeat
	return "NOT_FOUND"
end tell`;
	try {
		const { stdout } = await execFileAsync("osascript", ["-e", script], {
			timeout: 8_000,
		});
		const content = stdout.trimEnd();
		return content === "NOT_FOUND" ? null : content;
	} catch {
		return null;
	}
}
