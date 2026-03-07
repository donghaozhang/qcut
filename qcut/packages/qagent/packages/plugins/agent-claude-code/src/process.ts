/**
 * Process detection for Claude Code sessions.
 *
 * Finds running `claude` processes by matching TTY (tmux) or PID (process runtime).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuntimeHandle } from "@composio/ao-core";

const execFileAsync = promisify(execFile);

/**
 * Short-lived cache for `ps -eo pid,tty,args` output.
 * Multiple concurrent `isProcessRunning` calls (one per tmux session during
 * lifecycle polling) share a single `ps` invocation instead of spawning N
 * processes in parallel.  TTL is 5 seconds — long enough to coalesce a
 * polling sweep, short enough to reflect reality.
 */
let psCache: { promise: Promise<string>; expiry: number } | null = null;

export function getCachedPsList(): Promise<string> {
	const now = Date.now();
	if (psCache && now < psCache.expiry) return psCache.promise;
	const promise = execFileAsync("ps", ["-eo", "pid,tty,args"], {
		timeout: 5_000,
	}).then((r) => r.stdout);
	psCache = { promise, expiry: now + 5_000 };
	return promise;
}

/** Invalidate the ps cache (useful for tests). */
export function clearPsCache(): void {
	psCache = null;
}

/**
 * Check if a process named "claude" is running in the given runtime handle's context.
 * Uses ps to find processes by TTY (for tmux) or by PID.
 */
export async function findClaudeProcess(
	handle: RuntimeHandle
): Promise<number | null> {
	try {
		// For tmux runtime, get the pane TTY and find claude on it
		if (handle.runtimeName === "tmux" && handle.id) {
			const { stdout: ttyOut } = await execFileAsync(
				"tmux",
				["list-panes", "-t", handle.id, "-F", "#{pane_tty}"],
				{ timeout: 30_000 }
			);
			// Iterate all pane TTYs (multi-pane sessions) — succeed on any match
			const ttys = ttyOut
				.trim()
				.split("\n")
				.map((t) => t.trim())
				.filter(Boolean);
			if (ttys.length === 0) return null;

			// Use `args` instead of `comm` so we can match the CLI name even when
			// the process runs via a wrapper (e.g. node, python).  `comm` would
			// report "node" instead of "claude" in those cases.
			const psOut = await getCachedPsList();
			const ttySet = new Set(ttys.map((t) => t.replace(/^\/dev\//, "")));
			// Match "claude" as a word boundary — prevents false positives on
			// names like "claude-code" or paths that merely contain the substring.
			const processRe = /(?:^|\/)claude(?:\s|$)/;
			for (const line of psOut.split("\n")) {
				const cols = line.trimStart().split(/\s+/);
				if (cols.length < 3 || !ttySet.has(cols[1] ?? "")) continue;
				const args = cols.slice(2).join(" ");
				if (processRe.test(args)) {
					return parseInt(cols[0] ?? "0", 10);
				}
			}
			return null;
		}

		// For process runtime, check if the PID stored in handle data is alive
		const rawPid = handle.data.pid;
		const pid = typeof rawPid === "number" ? rawPid : Number(rawPid);
		if (Number.isFinite(pid) && pid > 0) {
			try {
				process.kill(pid, 0); // Signal 0 = check existence
				return pid;
			} catch (err: unknown) {
				// EPERM means the process exists but we lack permission to signal it
				if (err instanceof Error && "code" in err && err.code === "EPERM") {
					return pid;
				}
				return null;
			}
		}

		// No reliable way to identify the correct process for this session
		return null;
	} catch {
		return null;
	}
}
