/**
 * Electron Utility Process Entry Point
 *
 * Runs Claude HTTP Server and PTY Session Manager outside the main process
 * to prevent UI freezes from I/O-heavy operations.
 *
 * Communication with main process is via parentPort (MessagePort).
 */

/// <reference types="node" />

import {
	startUtilityHttpServer,
	stopUtilityHttpServer,
} from "./utility-http-server.js";
import { UtilityPtyManager } from "./utility-pty-manager.js";
import type { MainToUtilityMessage } from "./utility-ipc-types.js";
import { setSessionTokenProvider } from "../native-pipeline/infra/proxy-client.js";
import { getKey } from "../native-pipeline/infra/key-manager.js";

// Use electron-log when available, fall back to console
let logger: {
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	logger = require("electron-log");
} catch {
	logger = console;
}

// Prevent EPIPE crashes — utility process stdout/stderr may be disconnected
import { installEpipeGuard } from "../safe-console.js";
installEpipeGuard();
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
	if (err.code === "EPIPE") return;
	logger.error("[UtilityProcess] Uncaught exception:", err.message, err.stack);
});
process.on("unhandledRejection", (reason) => {
	logger.error("[UtilityProcess] Unhandled rejection:", reason);
});

// Utility process has process.parentPort for communicating with main.
// We cast via `unknown` because Electron's utility process augments the
// global `process` with `parentPort`, but the base Node.js types don't
// include it.
const maybeParentPort = (
	process as unknown as {
		parentPort?: import("node:worker_threads").MessagePort;
	}
).parentPort;

if (!maybeParentPort) {
	logger.error(
		"[UtilityProcess] No parentPort available — must run as utilityProcess"
	);
	process.exit(1);
}

// After the guard above, parentPort is guaranteed to be defined
const parentPort: import("node:worker_threads").MessagePort = maybeParentPort;

// Wire the license-server session token provider for this utility process's
// proxy-client instance. The main process does the same in setupLicenseIPC,
// but that call only affects main's module copy — the utility process has
// its own module graph. Without this, api-caller.ts in the utility process
// sees `providerSet=false` and skips proxy, falling through to whatever local
// FAL/GMI key is set (often stale) and returning 401.
// Reading from ~/.qcut/.env matches what the CLI runner does; the main
// process also persists any token received via `license:set-auth-token` IPC
// to the same file, so this stays in sync across processes automatically.
setSessionTokenProvider(async () => {
	try {
		const token = getKey("QCUT_AUTH_TOKEN");
		return token?.trim() ?? "";
	} catch {
		return "";
	}
});

const ptyManager = new UtilityPtyManager(parentPort);

// Pending request callbacks for main process responses
const pendingRequests = new Map<
	string,
	{ resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

/**
 * Send a request to the main process and await response.
 * Used for operations that need BrowserWindow access.
 */
export function requestFromMain(
	channel: string,
	data: Record<string, unknown>,
	options: { timeoutMs?: number } = {}
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		// Screen-recording start AND stop are both slow paths:
		//  - start: in standalone/headless mode the renderer is still
		//    booting React + bridge listeners (can take 5-15s on a cold
		//    hidden window); the main-side handler itself waits up to 30s.
		//  - stop: MediaRecorder flush + chunk writes take up to 30s.
		// Any shorter timeout here truncates main's own wait and produces
		// a misleading "Main process request timed out" error while the
		// renderer is still coming up.
		const timeoutMs =
			options.timeoutMs ??
			(channel.startsWith("screen-recording:") ? 35_000 : 10_000);
		const timer = setTimeout(() => {
			pendingRequests.delete(id);
			reject(new Error(`Main process request timed out: ${channel}`));
		}, timeoutMs);

		pendingRequests.set(id, {
			resolve: (value: unknown) => {
				clearTimeout(timer);
				resolve(value);
			},
			reject: (err: Error) => {
				clearTimeout(timer);
				reject(err);
			},
		});

		parentPort.postMessage({ type: "main-request", id, channel, data });
	});
}

// Handle messages from main process
parentPort.on(
	"message",
	(e: { data?: MainToUtilityMessage } | MainToUtilityMessage) => {
		const msg: MainToUtilityMessage =
			(e as { data?: MainToUtilityMessage }).data ??
			(e as MainToUtilityMessage);

		switch (msg.type) {
			case "init": {
				// Initialize HTTP server and PTY manager
				const { httpPort, appVersion } = msg.config;
				startUtilityHttpServer({
					port: httpPort,
					appVersion,
					requestFromMain,
				});
				logger.info("[UtilityProcess] Initialized");
				parentPort.postMessage({ type: "ready" });
				break;
			}

			case "main-response": {
				// Response to a requestFromMain call
				const pending = pendingRequests.get(msg.id);
				if (pending) {
					pendingRequests.delete(msg.id);
					if (msg.error) {
						pending.reject(new Error(msg.error));
					} else {
						pending.resolve(msg.result);
					}
				}
				break;
			}

			// PTY operations forwarded from main process IPC handlers
			case "pty:spawn":
				ptyManager.spawn(msg);
				break;
			case "pty:write":
				ptyManager.write(msg.sessionId, msg.data);
				break;
			case "pty:output":
				ptyManager.output(msg.sessionId, msg.data);
				break;
			case "pty:resize":
				ptyManager.resize(msg.sessionId, msg.cols, msg.rows);
				break;
			case "pty:kill":
				ptyManager.kill(msg.sessionId);
				break;
			case "pty:kill-all":
				ptyManager.killAll();
				break;

			case "ping":
				// Health check heartbeat -- respond immediately
				parentPort.postMessage({ type: "pong" });
				break;

			case "shutdown":
				stopUtilityHttpServer();
				ptyManager.killAll();
				parentPort.postMessage({ type: "shutdown-complete" });
				break;
		}
	}
);

logger.info("[UtilityProcess] Started, waiting for init...");
