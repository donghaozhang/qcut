/**
 * macOS terminal utilities for reading content from iTerm2 and Terminal.app.
 *
 * Shared by /api/sessions/[id]/open-terminal and /api/sessions/[id]/terminal-content.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
 * Read the tab/session name for a given TTY.
 *
 * - iTerm2/Terminal.app: AppleScript to read session/tab name
 * - Cursor/VS Code: match process against .vscode/tasks.json by pty-host sibling order
 */
export async function readTerminalTabName(
	tty: string,
	app: string | null,
	opts?: { pid?: number; processArgs?: string; cwd?: string },
): Promise<string | null> {
	if (!app) return null;

	// Cursor / VS Code: match against .vscode/tasks.json using pty-host ordering
	if (app === "Cursor" || app === "Code") {
		return matchVSCodeTaskLabel(opts?.pid, opts?.cwd);
	}

	if (app !== "iTerm" && app !== "Terminal") return null;
	const fullTTY = escapeAppleScript(normalizeTTY(tty));

	const script =
		app === "iTerm"
			? `
tell application "iTerm2"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			repeat with aSession in sessions of aTab
				try
					if tty of aSession ends with "${fullTTY}" then
						return name of aSession
					end if
				end try
			end repeat
		end repeat
	end repeat
	return "NOT_FOUND"
end tell`
			: `
tell application "Terminal"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			try
				if tty of aTab ends with "${fullTTY}" then
					return custom title of aTab
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
		const name = stdout.trim();
		return name && name !== "NOT_FOUND" ? name : null;
	} catch {
		return null;
	}
}

interface VSCodeTask {
	label?: string;
	command?: string;
	dependsOn?: string[];
}

/**
 * Find the Cursor/VS Code pty-host parent of a process and use sibling order
 * to map against .vscode/tasks.json task labels.
 *
 * Cursor's pty-host spawns one child process per terminal tab. The children
 * appear in PID order matching the task launch order from tasks.json.
 */
/**
 * Return the 0-based terminal tab index for a PID in a Cursor/VS Code pty-host.
 * Used to focus the exact terminal tab before sending text.
 */
export async function matchVSCodeTaskIndex(
	pid?: number,
	cwd?: string,
): Promise<number | null> {
	const result = await matchVSCodeTaskLabelAndIndex(pid, cwd);
	return result?.index ?? null;
}

async function matchVSCodeTaskLabel(
	pid?: number,
	cwd?: string,
): Promise<string | null> {
	const result = await matchVSCodeTaskLabelAndIndex(pid, cwd);
	return result?.label ?? null;
}

async function matchVSCodeTaskLabelAndIndex(
	pid?: number,
	cwd?: string,
): Promise<{ label: string; index: number } | null> {
	if (!pid || !cwd) return null;

	// 1. Walk up to find the pty-host parent
	let ptyHostPid: number | null = null;
	let current = pid;
	for (let depth = 0; depth < 10; depth++) {
		try {
			const { stdout } = await execFileAsync(
				"ps",
				["-o", "ppid=,comm=", "-p", String(current)],
				{ timeout: 3_000 },
			);
			const match = stdout.trim().match(/^\s*(\d+)\s+(.+)$/);
			if (!match) break;
			const ppid = parseInt(match[1]!, 10);
			const comm = match[2]!;
			if (/pty.host/i.test(comm)) {
				ptyHostPid = current;
				break;
			}
			if (ppid <= 1) break;
			current = ppid;
		} catch {
			break;
		}
	}
	if (!ptyHostPid) return null;

	// 2. List all children of pty-host, sorted by PID (spawn order)
	let siblings: { pid: number; args: string }[];
	try {
		const { stdout } = await execFileAsync(
			"ps",
			["-eo", "pid,ppid,args"],
			{ timeout: 5_000 },
		);
		siblings = [];
		for (const line of stdout.split("\n")) {
			const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
			if (!m) continue;
			if (parseInt(m[2]!, 10) === ptyHostPid) {
				siblings.push({ pid: parseInt(m[1]!, 10), args: m[3]! });
			}
		}
		siblings.sort((a, b) => a.pid - b.pid);
	} catch {
		return null;
	}

	// 3. Read tasks.json
	let dir = cwd;
	let tasksJson: string | null = null;
	for (let i = 0; i < 5; i++) {
		const candidate = join(dir, ".vscode", "tasks.json");
		try {
			tasksJson = await readFile(candidate, "utf-8");
			break;
		} catch {
			const parent = join(dir, "..");
			if (parent === dir) break;
			dir = parent;
		}
	}
	if (!tasksJson) return null;

	try {
		const config = JSON.parse(tasksJson) as { tasks?: VSCodeTask[] };
		if (!Array.isArray(config.tasks)) return null;

		// 4. Build ordered task list from dependsOn of the launcher task, or use task order
		const taskMap = new Map<string, VSCodeTask>();
		for (const t of config.tasks) {
			if (t.label) taskMap.set(t.label, t);
		}

		// Find the group task that has dependsOn (e.g. "Open All Agents")
		const launcher = config.tasks.find((t) => Array.isArray(t.dependsOn) && t.dependsOn.length > 0);
		const orderedLabels = launcher?.dependsOn ?? config.tasks.filter((t) => t.command).map((t) => t.label!);

		// 5. Build ordered commands list from tasks
		const orderedTasks: { label: string; bin: string; command: string }[] = [];
		for (const label of orderedLabels) {
			const task = taskMap.get(label);
			if (!task?.command) continue;
			const bin = task.command.trim().split(/\s+/)[0] ?? "";
			orderedTasks.push({ label, bin, command: task.command.trim() });
		}

		// 6. Match siblings to tasks by command, in order.
		// A sibling matches a task if:
		//   - The sibling's binary (basename) matches the task's binary AND
		//   - The sibling's args are a substring of the task command or vice versa
		// This prevents "/bin/zsh -il" (interactive shell) from matching a "zsh" task.
		let taskIdx = 0;
		for (const sibling of siblings) {
			if (taskIdx >= orderedTasks.length) break;
			const sibParts = sibling.args.trim().split(/\s+/);
			const sibBin = (sibParts[0] ?? "").split("/").pop() ?? "";
			const expected = orderedTasks[taskIdx]!;

			if (sibBin !== expected.bin) continue;

			// For single-word commands (e.g. "zsh"), require no extra flags in process args
			// to avoid matching interactive shells like "/bin/zsh -il"
			if (!expected.command.includes(" ") && sibParts.length > 1) continue;

			if (sibling.pid === pid) return { label: expected.label, index: taskIdx };
			taskIdx++;
		}
	} catch {
		// Malformed tasks.json
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
 * Send text to an iTerm2 session matching the given TTY.
 * Uses AppleScript `write text` which injects text as if typed and submits it.
 */
export async function sendITerm2Text(
	tty: string,
	text: string,
): Promise<boolean> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const escapedText = escapeAppleScript(text);
	const script = `
tell application "iTerm2"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			repeat with aSession in sessions of aTab
				try
					if tty of aSession ends with "${fullTTY}" then
						tell aSession
							write text "${escapedText}"
						end tell
						return "OK"
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
		return stdout.trim() === "OK";
	} catch {
		return false;
	}
}

/**
 * Send text to a Terminal.app tab matching the given TTY.
 */
export async function sendTerminalAppText(
	tty: string,
	text: string,
): Promise<boolean> {
	const fullTTY = escapeAppleScript(normalizeTTY(tty));
	const escapedText = escapeAppleScript(text);
	const script = `
tell application "Terminal"
	repeat with aWindow in windows
		repeat with aTab in tabs of aWindow
			try
				if tty of aTab ends with "${fullTTY}" then
					do script "${escapedText}" in aTab
					return "OK"
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
		return stdout.trim() === "OK";
	} catch {
		return false;
	}
}

/**
 * Send text to a Cursor/VS Code integrated terminal by pasting via clipboard.
 * Navigates to the terminal tab by index (Ctrl+PageUp to reset, then Ctrl+PageDown × N).
 * Saves and restores the previous clipboard content.
 */
export async function sendCursorText(
	text: string,
	terminalIndex: number | null,
): Promise<boolean> {
	const escapedText = escapeAppleScript(text);

	// Navigate to the right terminal tab:
	// 1. Press Ctrl+PageUp 20× to reset to tab 0
	// 2. Press Ctrl+PageDown N× to reach the target index
	const idx = terminalIndex ?? 0;
	const resetPresses = 20;
	const forwardPresses = idx;

	const navigateScript = `
	-- Focus the terminal panel
	keystroke "\`" using control down
	delay 0.15
	-- Reset to first terminal
	repeat ${resetPresses} times
		key code 116 using control down
		delay 0.04
	end repeat
	-- Navigate forward to target index
	repeat ${forwardPresses} times
		key code 121 using control down
		delay 0.04
	end repeat
	delay 0.1`;

	const script = `
-- Save existing clipboard
set prevClip to ""
try
	set prevClip to the clipboard
end try

set the clipboard to "${escapedText}"
delay 0.1

tell application "Cursor"
	activate
end tell
delay 0.3

tell application "System Events"
	tell process "Cursor"
		${navigateScript}
		-- Paste and submit
		keystroke "v" using command down
		delay 0.2
		key code 36
	end tell
end tell
delay 0.1

try
	set the clipboard to prevClip
end try
return "OK"`;

	try {
		const { stdout } = await execFileAsync("osascript", ["-e", script], {
			timeout: 10_000,
		});
		return stdout.trim() === "OK";
	} catch {
		return false;
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
