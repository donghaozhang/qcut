/**
 * Auto-spawn helper for `editor:screen-recording:*` commands.
 *
 * Phase 2 of the dual-mode CLI recording plan — when the running QCut app
 * is not reachable, transparently launch a hidden headless recorder so the
 * CLI works without the user having to open the app first.
 *
 * Scoped intentionally: only `editor:screen-recording:*` auto-spawns.
 * Other `editor:*` commands need an actual loaded project and must keep
 * failing (with the existing error message) when QCut is closed.
 *
 * @module electron/native-pipeline/cli/auto-spawn-editor
 */

import type { ChildProcess } from "node:child_process";
import {
	findExistingDaemon,
	launchHeadlessRecorder,
	type LaunchOptions,
} from "./headless-launcher.js";

/** Only these commands attempt auto-spawn — everything else fails-fast. */
export function isAutoSpawnEligible(commandName: string): boolean {
	return commandName.startsWith("editor:screen-recording:");
}

export interface EnsureDaemonDeps {
	launchImpl?: (opts: LaunchOptions) => Promise<{
		child: ChildProcess;
		port: number;
	}>;
	findExistingImpl?: () => { pid: number; port: number } | null;
	/** Injected for tests — called once the daemon's HTTP port is known. */
	onDaemonReady?: (info: { port: number; reused: boolean }) => void;
}

export interface EnsureDaemonResult {
	/** Port the daemon is listening on (or was reused from a prior instance). */
	port: number;
	/** True if we re-used an already-running daemon, false if we spawned one. */
	reused: boolean;
}

/**
 * Ensure a headless recorder daemon is reachable. Prefers reusing an
 * existing one (discovered via the PID/port files) to avoid spawning
 * duplicates when multiple CLI invocations race.
 *
 * Never throws when a live daemon is found — the caller can assume the
 * returned port is ready to accept HTTP traffic.
 */
export async function ensureHeadlessDaemon(
	deps: EnsureDaemonDeps = {}
): Promise<EnsureDaemonResult> {
	const findExisting = deps.findExistingImpl ?? findExistingDaemon;
	const launch = deps.launchImpl ?? launchHeadlessRecorder;

	const existing = findExisting();
	if (existing) {
		deps.onDaemonReady?.({ port: existing.port, reused: true });
		return { port: existing.port, reused: true };
	}

	const { port } = await launch({
		daemon: true,
		timeoutMs: 15_000,
	});

	deps.onDaemonReady?.({ port, reused: false });
	return { port, reused: false };
}

/**
 * Lightweight "is QCut reachable on HTTP?" probe. Uses the health
 * endpoint — the one `/api/claude/health` route that exists in both the
 * normal app build and the headless recorder utility process.
 */
export async function isEditorReachable({
	port,
	fetchImpl,
	timeoutMs = 1_500,
}: {
	port: number;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}): Promise<boolean> {
	const fetchFn = fetchImpl ?? globalThis.fetch;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutMs);
	try {
		const res = await fetchFn(`http://127.0.0.1:${port}/api/claude/health`, {
			method: "GET",
			signal: ac.signal,
		});
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}
