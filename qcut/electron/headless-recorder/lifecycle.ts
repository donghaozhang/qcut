/**
 * Headless Recorder — lifecycle utilities.
 *
 * Tracks the running headless process via a PID file and port file under
 * ~/.qcut/ so a concurrent CLI invocation can discover and reuse an
 * existing daemon instead of spawning a second one.
 *
 * @module electron/headless-recorder/lifecycle
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PID_FILE = join(homedir(), ".qcut", ".headless-record.pid");
export const PORT_FILE = join(homedir(), ".qcut", ".headless-record.port");

/** Write the current process PID to the PID file, best-effort. */
export function writePidFile(pid: number = process.pid): void {
	try {
		mkdirSync(dirname(PID_FILE), { recursive: true });
		writeFileSync(PID_FILE, String(pid), { mode: 0o600 });
	} catch {
		/* non-fatal — we just lose PID-file advisory locking */
	}
}

/** Write the bound HTTP port to the port file. */
export function writePortFile(port: number): void {
	try {
		mkdirSync(dirname(PORT_FILE), { recursive: true });
		writeFileSync(PORT_FILE, String(port), { mode: 0o600 });
	} catch {
		/* non-fatal */
	}
}

/** Remove PID and port files if present. */
export function clearStateFiles(): void {
	for (const file of [PID_FILE, PORT_FILE]) {
		try {
			unlinkSync(file);
		} catch {
			/* file absent — ignore */
		}
	}
}

export interface DaemonInfo {
	pid: number;
	port: number;
}

/**
 * Read the existing daemon's PID and port from disk.
 * Returns null if either file is missing or malformed.
 */
export function readDaemonInfo(): DaemonInfo | null {
	try {
		const pid = Number.parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
		const port = Number.parseInt(readFileSync(PORT_FILE, "utf8").trim(), 10);
		if (!Number.isFinite(pid) || !Number.isFinite(port)) return null;
		return { pid, port };
	} catch {
		return null;
	}
}

/** Probe whether a process with the given PID is alive on this host. */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isFinite(pid) || pid <= 0) return false;
	try {
		// process.kill with signal 0 probes liveness without signalling.
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		// ESRCH = not running. EPERM = running but we can't signal it (still alive).
		const code = (err as NodeJS.ErrnoException).code;
		return code === "EPERM";
	}
}

export interface IdleTimerOptions {
	idleTimeoutMs: number;
	onIdle: () => void;
	isActive?: () => boolean;
	pollIntervalMs?: number;
}

/**
 * Install a simple idle timer: if `isActive()` stays false for
 * `idleTimeoutMs`, invokes `onIdle()` once. Returns a disposer that
 * stops the interval and a `bump()` function to reset the timer on
 * external activity (HTTP hits etc.).
 */
export function installIdleTimer(opts: IdleTimerOptions): {
	bump: () => void;
	dispose: () => void;
} {
	let lastActivity = Date.now();
	let fired = false;
	const pollMs = opts.pollIntervalMs ?? 5_000;

	const timer = setInterval(() => {
		if (fired) return;
		if (opts.isActive?.()) {
			lastActivity = Date.now();
			return;
		}
		if (Date.now() - lastActivity >= opts.idleTimeoutMs) {
			fired = true;
			opts.onIdle();
		}
	}, pollMs);

	if (typeof timer.unref === "function") timer.unref();

	return {
		bump: () => {
			lastActivity = Date.now();
		},
		dispose: () => clearInterval(timer),
	};
}
