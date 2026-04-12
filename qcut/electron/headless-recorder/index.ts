/**
 * Headless Recorder — entry point.
 *
 * Invoked from `electron/main.ts` when the `--headless-recorder` CLI flag
 * is present. Boots just enough of the app to service screen-recording
 * HTTP requests: the utility-process HTTP server (so port 8765 responds)
 * and a hidden BrowserWindow (so the MediaRecorder pipeline runs).
 *
 * Deliberately skips the normal app chrome: no tray, no dock icon, no
 * auto-updater, no deep-link handling, no license activation flow.
 *
 * @module electron/headless-recorder/index
 */

import { app, BrowserWindow } from "electron";
import { startUtilityProcess } from "../utility/utility-bridge.js";
import {
	clearStateFiles,
	installIdleTimer,
	writePidFile,
	writePortFile,
} from "./lifecycle.js";
import { createHiddenCaptureWindow } from "./hidden-window.js";
import { findFreePort } from "./find-port.js";

export interface RunHeadlessRecorderOptions {
	/** Exit after this many ms of inactivity when no recording is active. */
	idleTimeoutMs?: number;
	/** HTTP port the utility process bound to (for the port file). Defaults to 8765. */
	httpPort?: number;
	/** Flip to true to keep running until an external kill — used by daemon mode. */
	daemon?: boolean;
}

let activeWindow: BrowserWindow | null = null;

/**
 * Boot the headless recorder. Returns once the hidden window is loaded
 * and HTTP is ready to accept requests. Does not resolve the app lifecycle
 * — the caller relies on Electron's own `app.quit()` driven by the idle
 * timer or external signal.
 */
export async function runHeadlessRecorder(
	options: RunHeadlessRecorderOptions = {}
): Promise<void> {
	// Env var wins if set — used by the E2E idle-exit test to shorten the
	// timer. Falls back to caller option, then the default 30s.
	const envIdleMs = Number.parseInt(
		process.env.QCUT_HEADLESS_IDLE_TIMEOUT_MS ?? "",
		10
	);
	const idleTimeoutMs =
		Number.isFinite(envIdleMs) && envIdleMs > 0
			? envIdleMs
			: (options.idleTimeoutMs ?? 30_000);

	// Resolve the HTTP port: prefer the caller-supplied port, then probe
	// 8765, then fall back to a random free port in 12000-13000. Bake the
	// final port into QCUT_API_PORT so the utility-process picks it up via
	// its existing env-var path (utility-bridge.ts reads QCUT_API_PORT at
	// startUtilityHttpServer init).
	let httpPort: number;
	if (options.httpPort && Number.isFinite(options.httpPort)) {
		httpPort = options.httpPort;
	} else {
		httpPort = await findFreePort({ preferredPort: 8765 });
	}
	process.env.QCUT_API_PORT = String(httpPort);

	// Write PID + port files so a concurrent CLI invocation can reuse us.
	writePidFile(process.pid);
	writePortFile(httpPort);

	// Ensure the state files are cleared on any graceful exit path.
	const cleanup = () => {
		clearStateFiles();
	};
	app.on("before-quit", cleanup);
	process.on("exit", cleanup);

	// Start the utility process (HTTP server + routing to main).
	try {
		startUtilityProcess();
	} catch (err) {
		// If the utility fails to start we can't do anything useful — bail
		// loudly so the launcher reports the error instead of hanging.
		throw new Error(
			`Failed to start utility process: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	// Create hidden BrowserWindow that loads the web app. The app's
	// existing bridge will respond to `claude:screen-recording:*` IPC.
	const { window, readyPromise } = createHiddenCaptureWindow();
	activeWindow = window;
	window.on("closed", () => {
		activeWindow = null;
	});
	await readyPromise;

	if (options.daemon) {
		// Daemon mode: self-exit after idle timeout with no active recording.
		installIdleTimer({
			idleTimeoutMs,
			onIdle: () => {
				if (hasActiveRecording()) return;
				app.quit();
			},
			isActive: hasActiveRecording,
		});
	}
}

/**
 * Cheap proxy for "is the renderer currently recording?" — reads the
 * session state the main process already tracks. We import lazily so
 * test mocks don't have to fake the full screen-recording module.
 */
export function hasActiveRecording(): boolean {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { buildStatus } = require("../screen-recording-handler/session.js");
		const status = buildStatus();
		return Boolean(status?.recording);
	} catch {
		return false;
	}
}

/** Test-only: retrieve the active hidden BrowserWindow. */
export function getActiveHiddenWindow(): BrowserWindow | null {
	return activeWindow;
}

/** Test-only: reset module state between tests. */
export function __resetForTests(): void {
	activeWindow = null;
}
