/**
 * CLI Headless Launcher
 *
 * Spawns the QCut binary with the `--headless-recorder` flag when the
 * running editor isn't available, and waits until its HTTP health endpoint
 * responds. Used by `qcut record` (one-shot) and, in Phase 2, by the
 * `editor:screen-recording:*` auto-spawn branch.
 *
 * @module electron/native-pipeline/cli/headless-launcher
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import {
	readDaemonInfo,
	isProcessAlive,
	PORT_FILE,
} from "../../headless-recorder/lifecycle.js";
import { readFileSync } from "node:fs";

export interface LaunchOptions {
	/** Max time to wait for HTTP health before giving up. Default 15s. */
	timeoutMs?: number;
	/** Called with every line of stdout/stderr from the child. */
	onOutput?: (line: string) => void;
	/** Run in daemon mode (stays alive after first recording finishes). */
	daemon?: boolean;
	/** Pre-computed binary path; overrides auto-resolution. */
	binaryPathOverride?: string;
	/** HTTP port to probe. Defaults to 8765, falling back to the port file. */
	probePort?: number;
	/**
	 * Inject a fetch implementation. Only used by tests; production code
	 * falls back to `globalThis.fetch`.
	 */
	fetchImpl?: typeof fetch;
	/** Inject a spawn implementation (tests). */
	spawnImpl?: typeof spawn;
}

export interface LaunchedRecorder {
	child: ChildProcess;
	port: number;
	binaryPath: string;
}

/**
 * Resolve the path to the QCut binary. Priority:
 * 1. `QCUT_BINARY_PATH` env var (test/override)
 * 2. Packaged app location per OS
 * 3. Common dev binaries
 * Throws if nothing is found so the caller can surface a useful error.
 */
export function resolveQcutBinaryPath(): string {
	if (process.env.QCUT_BINARY_PATH) {
		return process.env.QCUT_BINARY_PATH;
	}

	const candidates: string[] = [];

	if (platform() === "darwin") {
		candidates.push(
			"/Applications/QCut.app/Contents/MacOS/QCut",
			`${process.env.HOME ?? ""}/Applications/QCut.app/Contents/MacOS/QCut`
		);
	} else if (platform() === "win32") {
		candidates.push(
			"C:\\Program Files\\QCut\\QCut.exe",
			`${process.env.LOCALAPPDATA ?? ""}\\Programs\\QCut\\QCut.exe`
		);
	} else {
		candidates.push("/usr/bin/qcut", "/usr/local/bin/qcut", "/opt/qcut/qcut");
	}

	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}

	throw new Error(
		`QCut binary not found. Tried: ${candidates.filter(Boolean).join(", ")}. ` +
			"Install QCut or set QCUT_BINARY_PATH."
	);
}

/**
 * Poll an HTTP URL until it returns a 2xx status or the deadline passes.
 * Exposed for testing — the launcher's happy path uses it against the
 * utility HTTP server's health endpoint.
 */
export async function waitForHttpReady(opts: {
	url: string;
	timeoutMs: number;
	fetchImpl?: typeof fetch;
	pollIntervalMs?: number;
}): Promise<void> {
	const fetchFn = opts.fetchImpl ?? globalThis.fetch;
	const pollMs = opts.pollIntervalMs ?? 250;
	const deadline = Date.now() + opts.timeoutMs;

	let lastErr: unknown = null;
	while (Date.now() < deadline) {
		try {
			const res = await fetchFn(opts.url, { method: "GET" });
			if (res.ok) return;
			lastErr = new Error(`HTTP ${res.status}`);
		} catch (err) {
			lastErr = err;
		}
		await delay(pollMs);
	}
	throw new Error(
		`HTTP health probe timed out after ${opts.timeoutMs}ms: ${
			lastErr instanceof Error ? lastErr.message : String(lastErr)
		}`
	);
}

/** Read the HTTP port from the port file, falling back to the default. */
function resolveProbePort(override?: number): number {
	if (override && Number.isFinite(override)) return override;
	try {
		const raw = readFileSync(PORT_FILE, "utf8").trim();
		const parsed = Number.parseInt(raw, 10);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	} catch {
		/* ignore */
	}
	return 8765;
}

/**
 * Wait for the port file to appear on disk after spawning a daemon.
 * The daemon writes this file early in boot, before the HTTP server is
 * ready, so polling it lets us discover dynamic ports before probing
 * health. Returns the port, or null on timeout.
 */
async function waitForPortFile(timeoutMs: number): Promise<number | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const raw = readFileSync(PORT_FILE, "utf8").trim();
			const parsed = Number.parseInt(raw, 10);
			if (Number.isFinite(parsed) && parsed > 0) return parsed;
		} catch {
			/* not yet */
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return null;
}

/**
 * If an existing headless daemon is already running, return its info so
 * callers can reuse it rather than spawning a duplicate.
 */
export function findExistingDaemon(): { pid: number; port: number } | null {
	const info = readDaemonInfo();
	if (!info) return null;
	if (!isProcessAlive(info.pid)) return null;
	return info;
}

/**
 * Spawn a fresh headless recorder and wait until its HTTP server is
 * ready. Does not register PID files — the spawned child does that
 * itself via `headless-recorder/index.ts`.
 */
export async function launchHeadlessRecorder(
	opts: LaunchOptions = {}
): Promise<LaunchedRecorder> {
	const spawnFn = opts.spawnImpl ?? spawn;
	const binaryPath = opts.binaryPathOverride ?? resolveQcutBinaryPath();
	const args = ["--headless-recorder"];
	if (opts.daemon) args.push("--daemon");

	const child = spawnFn(binaryPath, args, {
		stdio: ["ignore", "pipe", "pipe"],
		detached: false,
	});

	if (opts.onOutput) {
		child.stdout?.on("data", (buf: Buffer) => {
			for (const line of buf.toString("utf8").split(/\r?\n/)) {
				if (line.length) opts.onOutput?.(line);
			}
		});
		child.stderr?.on("data", (buf: Buffer) => {
			for (const line of buf.toString("utf8").split(/\r?\n/)) {
				if (line.length) opts.onOutput?.(line);
			}
		});
	}

	const earlyExit = new Promise<never>((_, reject) => {
		child.once("exit", (code, signal) => {
			reject(
				new Error(
					`Headless recorder exited before ready (code=${code}, signal=${signal})`
				)
			);
		});
	});

	// Phase 2: the daemon may bind a dynamic port if 8765 is busy. Wait up
	// to 3s for the daemon to write its port file, then health-probe that
	// port. If the daemon never writes one (e.g. it crashed on boot) fall
	// through to the default and let the earlyExit handler surface the
	// real error.
	const timeoutMs = opts.timeoutMs ?? 15_000;
	let port = resolveProbePort(opts.probePort);
	if (opts.probePort === undefined) {
		const filePort = await Promise.race([
			waitForPortFile(Math.min(3_000, timeoutMs)),
			earlyExit.then(() => null as number | null),
		]);
		if (filePort) port = filePort;
	}
	const healthReady = waitForHttpReady({
		url: `http://127.0.0.1:${port}/api/claude/health`,
		timeoutMs,
		fetchImpl: opts.fetchImpl,
	});

	try {
		await Promise.race([healthReady, earlyExit]);
	} catch (err) {
		try {
			if (!child.killed) child.kill("SIGTERM");
		} catch {
			/* ignore */
		}
		throw err;
	}

	return { child, port, binaryPath };
}
