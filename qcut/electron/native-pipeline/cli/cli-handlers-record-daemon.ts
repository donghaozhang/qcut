/**
 * CLI `record-daemon` handler — manages the headless recorder daemon.
 *
 * Three subcommands exposed via flags:
 *   --status   Show whether a daemon is running (pid, port).
 *   --stop     Send SIGTERM to the running daemon.
 *   --start    Spawn a new daemon in the background (no-op if one is running).
 *
 * Intended for troubleshooting — the normal flow in Phase 2 is that
 * `editor:screen-recording:*` auto-spawns the daemon as needed.
 *
 * @module electron/native-pipeline/cli/cli-handlers-record-daemon
 */

import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import {
	findExistingDaemon,
	launchHeadlessRecorder,
	type LaunchOptions,
} from "./headless-launcher.js";
import {
	clearStateFiles,
	isProcessAlive,
	readDaemonInfo,
} from "../../headless-recorder/lifecycle.js";

export interface HandleRecordDaemonDeps {
	launchImpl?: (opts: LaunchOptions) => Promise<{ port: number }>;
	findExistingImpl?: () => { pid: number; port: number } | null;
	isAliveImpl?: (pid: number) => boolean;
	killImpl?: (pid: number, signal: NodeJS.Signals) => void;
	clearStateFilesImpl?: () => void;
}

type Action = "status" | "stop" | "start";

function resolveAction(options: CLIRunOptions): Action {
	// Flags are booleans; whichever is true wins. `--status` is the default
	// so `qcut record-daemon` prints status without needing a flag.
	const rawFlags = options as unknown as Record<string, unknown>;
	if (rawFlags.stop === true) return "stop";
	if (rawFlags.start === true) return "start";
	return "status";
}

export async function handleRecordDaemon(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	deps: HandleRecordDaemonDeps = {}
): Promise<CLIResult> {
	const startTime = Date.now();
	const findExisting = deps.findExistingImpl ?? findExistingDaemon;
	const isAlive = deps.isAliveImpl ?? isProcessAlive;
	const launchFn: HandleRecordDaemonDeps["launchImpl"] =
		deps.launchImpl ??
		((opts) => launchHeadlessRecorder(opts).then((r) => ({ port: r.port })));
	const killFn: (pid: number, sig: NodeJS.Signals) => void =
		deps.killImpl ?? ((pid, sig) => process.kill(pid, sig));
	const clearFiles = deps.clearStateFilesImpl ?? clearStateFiles;

	const action = resolveAction(options);
	onProgress({
		stage: `daemon:${action}`,
		percent: 0,
		message: `record-daemon ${action}`,
	});

	switch (action) {
		case "status": {
			const info = readDaemonInfo();
			const running = info != null && isAlive(info.pid);
			return {
				success: true,
				duration: (Date.now() - startTime) / 1000,
				data: {
					running,
					pid: running ? info?.pid : null,
					port: running ? info?.port : null,
				},
			};
		}

		case "stop": {
			const existing = findExisting();
			if (!existing) {
				// Clean up stale files just in case and report no-op success.
				clearFiles();
				return {
					success: true,
					duration: (Date.now() - startTime) / 1000,
					data: { stopped: false, reason: "no daemon running" },
				};
			}
			try {
				killFn(existing.pid, "SIGTERM");
			} catch (err) {
				return {
					success: false,
					error: `Failed to signal daemon pid=${existing.pid}: ${
						err instanceof Error ? err.message : String(err)
					}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}
			// Best-effort: the daemon clears state files in its exit hook.
			return {
				success: true,
				duration: (Date.now() - startTime) / 1000,
				data: { stopped: true, pid: existing.pid, port: existing.port },
			};
		}

		case "start": {
			const existing = findExisting();
			if (existing) {
				return {
					success: true,
					duration: (Date.now() - startTime) / 1000,
					data: {
						started: false,
						reason: "already running",
						pid: existing.pid,
						port: existing.port,
					},
				};
			}
			try {
				const { port } = await launchFn({ daemon: true, timeoutMs: 15_000 });
				return {
					success: true,
					duration: (Date.now() - startTime) / 1000,
					data: { started: true, port },
				};
			} catch (err) {
				return {
					success: false,
					error: `Failed to start daemon: ${
						err instanceof Error ? err.message : String(err)
					}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}
		}
	}
}
