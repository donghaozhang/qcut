/**
 * Utility Process Bridge
 *
 * Launches and manages the utility process from the main process.
 * Handles:
 * - Starting/stopping the utility process
 * - Proxying BrowserWindow operations from utility -> main
 * - Forwarding PTY IPC from renderer -> utility and back
 * - Crash recovery with session persistence
 * - Health check heartbeat system
 * - Message queue for offline utility process
 */

import {
	utilityProcess,
	BrowserWindow,
	ipcMain,
	app,
	webContents,
} from "electron";
import * as path from "node:path";
import {
	requestTimelineFromRenderer,
	requestSplitFromRenderer,
	requestSelectionFromRenderer,
	batchAddElements,
	batchUpdateElements,
	batchDeleteElements,
	arrangeTimeline,
} from "../claude/handlers/claude-timeline-handler.js";
import { executeBatchCuts } from "../claude/handlers/claude-cuts-handler.js";
import { executeDeleteRange } from "../claude/handlers/claude-range-handler.js";
import {
	startAutoEditJob,
	getAutoEditJobStatus,
	listAutoEditJobs,
	cancelAutoEditJob,
} from "../claude/handlers/claude-auto-edit-handler.js";
import { runMainProcessDeepHealthChecks } from "../claude/handlers/claude-health-handler.js";
import {
	beginTransaction,
	commitTransaction,
	rollbackTransaction,
	getTransactionStatus,
	undoTimeline,
	redoTimeline,
	getHistorySummary,
} from "../claude/handlers/claude-transaction-handler.js";
import { requestEditorStateSnapshotFromRenderer } from "../claude/handlers/claude-state-handler.js";
import type {
	EditorStateRequest,
	BatchCutRequest,
	ClaudeRangeDeleteRequest,
	AutoEditRequest,
} from "../types/claude-api.js";
import { getProjectStats } from "../claude/handlers/claude-project-handler.js";
import {
	requestProjectsFromRenderer,
	requestNavigateToProject,
} from "../claude/handlers/claude-navigator-handler.js";
import {
	requestStartRecordingFromRenderer,
	requestStopRecordingFromRenderer,
} from "../claude/handlers/claude-screen-recording-handler.js";
import {
	requestSwitchPanel,
	resolvePanelId,
	getAvailablePanels,
	resolveTabId,
	getAvailableTabs,
} from "../claude/handlers/claude-ui-handler.js";
import {
	requestSetScript,
	requestTriggerParse,
	requestGenerateScript,
	requestMoyinStatus,
} from "../claude/handlers/claude-moyin-handler.js";
import { captureScreenshot } from "../claude/handlers/claude-screenshot-handler.js";
import {
	requestCreateProject,
	requestDeleteProject,
	requestRenameProject,
	requestDuplicateProject,
} from "../claude/handlers/claude-project-crud-handler.js";
import { getClaudeEvents } from "../claude/handlers/claude-events-handler.js";
import { notificationBridge } from "../claude/notification-bridge.js";
import {
	listCaptureSources,
	buildStatus as buildScreenRecordingStatus,
	forceStopActiveScreenRecordingSession,
} from "../screen-recording-handler.js";
import * as fs from "node:fs";
import type {
	UtilityToMainMessage,
	WebContentsSendRequest,
	SplitElementRequest,
	BatchAddElementsRequest,
	BatchUpdateElementsRequest,
	BatchDeleteElementsRequest,
	GetProjectStatsRequest,
	TransactionBeginRequest,
	TransactionFinalizeRequest,
	TransactionStatusRequest,
	PtySpawnOptions,
	PtySpawnResult,
} from "./utility-ipc-types.js";

// Use electron-log when available, fall back to console
let logger: {
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	log: (...args: unknown[]) => void;
};
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	logger = require("electron-log");
} catch {
	logger = console;
}

let utilityChild: ReturnType<typeof utilityProcess.fork> | null = null;
let stoppingUtility = false;

// Track PTY session -> webContents mapping for forwarding data back
const sessionToWebContentsId = new Map<string, number>();
// Track pending PTY spawn requests
const pendingPtySpawns = new Map<
	string,
	{ resolve: (value: PtySpawnResult) => void; reject: (err: Error) => void }
>();

// ============================================================================
// Feature 1: Session persistence -- track PTY session metadata for re-spawn
// ============================================================================

/** Metadata needed to re-create a PTY session after utility process restart */
interface PtySessionMetadata {
	sessionId: string;
	webContentsId: number;
	cwd?: string;
	command?: string;
	env?: Record<string, string>;
	cols?: number;
	rows?: number;
	mcpServerPath?: string | null;
	projectId?: string;
	projectRoot?: string;
	apiBaseUrl?: string;
}

/** Registry of active PTY sessions for crash recovery */
const sessionRegistry = new Map<string, PtySessionMetadata>();

// ============================================================================
// Feature 2: Health check heartbeat system
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatPending = false;
let heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

/** Start periodic heartbeat pings to detect an unresponsive utility process. */
function startHeartbeat(): void {
	stopHeartbeat();
	heartbeatTimer = setInterval(() => {
		if (!utilityChild) return;
		if (heartbeatPending) {
			// Previous heartbeat was not answered -- utility is hung
			logger.error(
				"[UtilityBridge] Heartbeat timeout -- utility process unresponsive, restarting..."
			);
			heartbeatPending = false;
			forceRestartUtility();
			return;
		}
		heartbeatPending = true;
		utilityChild.postMessage({ type: "ping" });
		heartbeatTimeoutTimer = setTimeout(() => {
			if (heartbeatPending && utilityChild) {
				logger.error(
					"[UtilityBridge] Heartbeat timeout -- utility process unresponsive, restarting..."
				);
				heartbeatPending = false;
				forceRestartUtility();
			}
		}, HEARTBEAT_TIMEOUT_MS);
	}, HEARTBEAT_INTERVAL_MS);
}

/** Stop heartbeat. */
function stopHeartbeat(): void {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
	if (heartbeatTimeoutTimer) {
		clearTimeout(heartbeatTimeoutTimer);
		heartbeatTimeoutTimer = null;
	}
	heartbeatPending = false;
}

/** Handle force restart utility. */
function forceRestartUtility(): void {
	if (utilityChild) {
		try {
			utilityChild.kill();
		} catch {
			/* ignore */
		}
		// The exit handler will trigger restart and session recovery
	}
}

// ============================================================================
// Feature 4: Message queue for offline utility process
// ============================================================================

interface QueuedMessage {
	type: string;
	[key: string]: unknown;
}

const messageQueue: QueuedMessage[] = [];
let utilityReady = false;

/** Send a message to utility process, or queue it if utility is down */
function sendToUtility(msg: QueuedMessage): void {
	if (utilityChild && utilityReady) {
		utilityChild.postMessage(msg);
	} else {
		messageQueue.push(msg);
	}
}

/** Flush queued messages to the utility process once it is ready */
function flushMessageQueue(): void {
	if (!utilityChild) return;
	while (messageQueue.length > 0) {
		const msg = messageQueue.shift()!;
		utilityChild.postMessage(msg);
	}
}

/** Handle write to pty session output. */
export function writeToPtySessionOutput({
	sessionId,
	data,
}: {
	sessionId: string;
	data: string;
}): boolean {
	try {
		const trimmedSessionId = sessionId.trim();
		if (!trimmedSessionId) {
			return false;
		}

		if (
			!sessionRegistry.has(trimmedSessionId) &&
			!sessionToWebContentsId.has(trimmedSessionId)
		) {
			return false;
		}

		sendToUtility({
			type: "pty:output",
			sessionId: trimmedSessionId,
			data,
		});
		return true;
	} catch {
		return false;
	}
}

/** Handle configure notification bridge writer. */
function configureNotificationBridgeWriter(): void {
	try {
		notificationBridge.setWriter({
			writer: ({ sessionId, data }) =>
				writeToPtySessionOutput({
					sessionId,
					data,
				}),
		});
	} catch {
		// no-op
	}
}

/** Get the first active BrowserWindow */
function getWindow(): BrowserWindow | null {
	return BrowserWindow.getAllWindows()[0] ?? null;
}

/** Resolve QCut MCP server entry point (mirrors pty-handler logic). */
function resolveQcutMcpServerEntry(): string | null {
	const candidates = [
		path.resolve(__dirname, "mcp", "qcut-mcp-server.js"),
		path.resolve(
			app.getAppPath(),
			"dist",
			"electron",
			"mcp",
			"qcut-mcp-server.js"
		),
		path.resolve(app.getAppPath(), "electron", "mcp", "qcut-mcp-server.js"),
	];
	for (const c of candidates) {
		try {
			if (fs.existsSync(c)) return c;
		} catch {
			/* ignore */
		}
	}
	return null;
}

/**
 * Handle a request from the utility process that needs main-process APIs.
 */
async function handleMainRequest(
	channel: string,
	data: Record<string, unknown>
): Promise<unknown> {
	if (channel === "events:list") {
		const req = data as {
			limit?: number;
			category?: string;
			after?: string;
			source?: string;
		};
		return getClaudeEvents({
			limit: req.limit,
			category: req.category,
			after: req.after,
			source: req.source,
		});
	}
	if (channel === "notifications:enable") {
		const req = data as { sessionId?: string };
		const sessionId = typeof req.sessionId === "string" ? req.sessionId : "";
		return notificationBridge.enable({ sessionId });
	}
	if (channel === "notifications:disable") {
		return notificationBridge.disable();
	}
	if (channel === "notifications:status") {
		return notificationBridge.getStatus();
	}
	if (channel === "notifications:history") {
		const req = data as { limit?: number };
		return notificationBridge.getHistory({ limit: req.limit });
	}
	if (channel === "health:deep-checks") {
		return await runMainProcessDeepHealthChecks({
			getWindow: () => {
				const win = getWindow();
				if (!win) {
					throw new Error("No active window");
				}
				return win;
			},
			requestTimeline: async ({ win }) =>
				await requestTimelineFromRenderer(win),
		});
	}

	const win = getWindow();
	if (!win) throw new Error("No active window");

	switch (channel) {
		case "webcontents-send": {
			const req = data as unknown as WebContentsSendRequest;
			win.webContents.send(req.channel, ...req.args);
			return { sent: true };
		}

		case "get-timeline": {
			return requestTimelineFromRenderer(win);
		}

		case "get-selection": {
			return requestSelectionFromRenderer(win);
		}

		case "get-editor-state-snapshot": {
			const req = data as { request?: EditorStateRequest };
			return requestEditorStateSnapshotFromRenderer(win, req.request);
		}

		case "split-element": {
			const req = data as unknown as SplitElementRequest;
			return requestSplitFromRenderer(
				win,
				req.elementId,
				req.splitTime,
				req.mode
			);
		}

		case "get-project-stats": {
			const req = data as unknown as GetProjectStatsRequest;
			return getProjectStats(win, req.projectId);
		}

		case "timeline:batch-cuts": {
			const req = data as { request?: BatchCutRequest };
			if (!req.request) {
				throw new Error("Missing 'request' payload for timeline:batch-cuts");
			}
			return executeBatchCuts(win, req.request);
		}

		case "timeline:delete-range": {
			const req = data as { request?: ClaudeRangeDeleteRequest };
			if (!req.request) {
				throw new Error("Missing 'request' payload for timeline:delete-range");
			}
			return executeDeleteRange(win, req.request);
		}

		case "timeline:auto-edit:start": {
			const req = data as {
				projectId?: string;
				request?: AutoEditRequest;
			};
			if (typeof req.projectId !== "string" || !req.projectId.trim()) {
				throw new Error("Missing 'projectId' for timeline:auto-edit:start");
			}
			if (!req.request) {
				throw new Error(
					"Missing 'request' payload for timeline:auto-edit:start"
				);
			}
			return startAutoEditJob(req.projectId.trim(), req.request, win);
		}

		case "timeline:auto-edit:status": {
			const req = data as { jobId?: string };
			if (typeof req.jobId !== "string" || !req.jobId.trim()) {
				throw new Error("Missing 'jobId' for timeline:auto-edit:status");
			}
			return getAutoEditJobStatus(req.jobId.trim());
		}

		case "timeline:auto-edit:list": {
			return listAutoEditJobs();
		}

		case "timeline:auto-edit:cancel": {
			const req = data as { jobId?: string };
			if (typeof req.jobId !== "string" || !req.jobId.trim()) {
				throw new Error("Missing 'jobId' for timeline:auto-edit:cancel");
			}
			return cancelAutoEditJob(req.jobId.trim());
		}

		case "batch-add-elements": {
			const req = data as unknown as BatchAddElementsRequest;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- IPC boundary cast
			return batchAddElements(win, req.projectId, req.elements as any);
		}

		case "batch-update-elements": {
			const req = data as unknown as BatchUpdateElementsRequest;
			return batchUpdateElements(win, req.updates as any);
		}

		case "batch-delete-elements": {
			const req = data as unknown as BatchDeleteElementsRequest;
			return batchDeleteElements(win, req.elements as any, req.ripple);
		}

		case "arrange-timeline": {
			return arrangeTimeline(win, data as any);
		}

		case "transaction:begin": {
			const req = data as TransactionBeginRequest;
			return beginTransaction({ win, request: req.request });
		}

		case "transaction:commit": {
			const req = data as unknown as TransactionFinalizeRequest;
			return commitTransaction({ transactionId: req.transactionId });
		}

		case "transaction:rollback": {
			const req = data as unknown as TransactionFinalizeRequest;
			return rollbackTransaction({
				transactionId: req.transactionId,
				reason: req.reason,
			});
		}

		case "transaction:status": {
			const req = data as unknown as TransactionStatusRequest;
			return getTransactionStatus({ transactionId: req.transactionId });
		}

		case "timeline:undo": {
			return undoTimeline({ win });
		}

		case "timeline:redo": {
			return redoTimeline({ win });
		}

		case "timeline:history": {
			return getHistorySummary({ win });
		}

		case "get-projects": {
			return requestProjectsFromRenderer(win);
		}

		case "navigate-to-project": {
			const req = data as { projectId: string };
			return requestNavigateToProject(win, req.projectId);
		}

		case "screen-recording:sources": {
			return listCaptureSources({ currentWindowSourceId: null });
		}

		case "screen-recording:status": {
			return buildScreenRecordingStatus();
		}

		case "screen-recording:start": {
			const req = data as { sourceId?: string; fileName?: string };
			return requestStartRecordingFromRenderer(win, {
				sourceId: req.sourceId,
				fileName: req.fileName,
			});
		}

		case "screen-recording:stop": {
			const req = data as { discard?: boolean };
			return requestStopRecordingFromRenderer(win, {
				discard: req.discard,
			});
		}

		case "screen-recording:force-stop": {
			try {
				return await forceStopActiveScreenRecordingSession();
			} catch (error: unknown) {
				throw new Error(
					`Failed to force-stop screen recording session: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		case "screenshot:capture": {
			const req = data as { fileName?: string };
			return captureScreenshot(win, { fileName: req.fileName });
		}

		case "switch-panel": {
			const req = data as { panel: string; tab?: string };
			const panelId = resolvePanelId(req.panel);
			if (!panelId) {
				throw new Error(
					`Unknown panel: ${req.panel}. Available: ${getAvailablePanels().join(", ")}`
				);
			}
			// Resolve tab alias if provided
			let resolvedTab: string | undefined;
			if (req.tab) {
				resolvedTab = resolveTabId(panelId, req.tab) ?? undefined;
				if (!resolvedTab) {
					throw new Error(
						`Unknown tab: ${req.tab}. Available for ${panelId}: ${getAvailableTabs(panelId).join(", ")}`
					);
				}
			}
			return requestSwitchPanel(win, panelId, resolvedTab);
		}

		case "moyin:set-script": {
			const req = data as { text: string };
			requestSetScript(win, req.text);
			return { updated: true };
		}

		case "moyin:trigger-parse": {
			requestTriggerParse(win);
			return { triggered: true };
		}

		case "moyin:generate-script": {
			const req = data as {
				idea: string;
				genre?: string;
				targetDuration?: string;
			};
			requestGenerateScript(win, req.idea, {
				genre: req.genre,
				targetDuration: req.targetDuration,
			});
			return { triggered: true };
		}

		case "moyin:status": {
			return requestMoyinStatus(win);
		}

		case "project:create": {
			const req = data as { name: string };
			return requestCreateProject(win, req.name);
		}

		case "project:delete": {
			const req = data as { projectId: string };
			return requestDeleteProject(win, req.projectId);
		}

		case "project:rename": {
			const req = data as { projectId: string; name: string };
			return requestRenameProject(win, req.projectId, req.name);
		}

		case "project:duplicate": {
			const req = data as { projectId: string };
			return requestDuplicateProject(win, req.projectId);
		}

		default:
			throw new Error(`Unknown main-request channel: ${channel}`);
	}
}

/** Re-spawn PTY sessions from the session registry after crash recovery */
function respawnSessions(): void {
	if (sessionRegistry.size === 0) return;

	logger.info(
		`[UtilityBridge] Re-spawning ${sessionRegistry.size} PTY session(s) after crash recovery...`
	);

	for (const [sessionId, meta] of sessionRegistry) {
		// Verify the webContents is still alive
		try {
			const contents = webContents.fromId(meta.webContentsId);
			if (!contents || contents.isDestroyed()) {
				logger.warn(
					`[UtilityBridge] Skipping session ${sessionId} -- webContents destroyed`
				);
				sessionRegistry.delete(sessionId);
				sessionToWebContentsId.delete(sessionId);
				continue;
			}
		} catch {
			sessionRegistry.delete(sessionId);
			sessionToWebContentsId.delete(sessionId);
			continue;
		}

		// Re-register the session -> webContents mapping
		sessionToWebContentsId.set(sessionId, meta.webContentsId);

		const requestId = `respawn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

		// Set up a pending spawn handler
		pendingPtySpawns.set(requestId, {
			resolve: (value: PtySpawnResult) => {
				if (value.success) {
					logger.info(
						`[UtilityBridge] Re-spawned session ${sessionId} successfully`
					);
				} else {
					logger.warn(
						`[UtilityBridge] Failed to re-spawn session ${sessionId}: ${value.error}`
					);
					sessionRegistry.delete(sessionId);
					sessionToWebContentsId.delete(sessionId);
					// Notify renderer about the failed re-spawn
					try {
						const contents = webContents.fromId(meta.webContentsId);
						if (contents && !contents.isDestroyed()) {
							contents.send("pty:exit", {
								sessionId,
								exitCode: -1,
								signal: "RESPAWN_FAILED",
							});
						}
					} catch {
						/* ignore */
					}
				}
			},
			reject: () => {
				sessionRegistry.delete(sessionId);
				sessionToWebContentsId.delete(sessionId);
			},
		});

		sendToUtility({
			type: "pty:spawn",
			requestId,
			sessionId,
			command: meta.command,
			cols: meta.cols,
			rows: meta.rows,
			cwd: meta.cwd,
			env: meta.env,
			mcpServerPath: meta.mcpServerPath,
			projectId: meta.projectId,
			projectRoot: meta.projectRoot,
			apiBaseUrl: meta.apiBaseUrl,
		});
	}
}

/** Start the utility process */
export function startUtilityProcess(): void {
	if (utilityChild) {
		logger.warn("[UtilityBridge] Utility process already running");
		return;
	}
	configureNotificationBridgeWriter();

	stoppingUtility = false;
	utilityReady = false;

	const utilityPath = path.join(__dirname, "utility-process.js");
	logger.info(`[UtilityBridge] Forking utility process: ${utilityPath}`);

	const child = utilityProcess.fork(utilityPath);
	utilityChild = child;

	// Handle messages from utility process
	// Use local `child` ref so responses aren't misrouted if the global
	// `utilityChild` is reassigned during an async handler.
	child.on("message", async (msg: UtilityToMainMessage) => {
		switch (msg.type) {
			case "ready":
				logger.info("[UtilityBridge] Utility process ready");
				utilityReady = true;
				flushMessageQueue();
				startHeartbeat();
				// Re-spawn sessions if this is a restart after crash
				respawnSessions();
				break;

			case "pong":
				// Heartbeat response received
				heartbeatPending = false;
				if (heartbeatTimeoutTimer) {
					clearTimeout(heartbeatTimeoutTimer);
					heartbeatTimeoutTimer = null;
				}
				break;

			case "main-request": {
				// Utility process needs something from main
				try {
					const result = await handleMainRequest(msg.channel, msg.data);
					child.postMessage({
						type: "main-response",
						id: msg.id,
						result,
					});
				} catch (err: unknown) {
					const errMessage = err instanceof Error ? err.message : String(err);
					child.postMessage({
						type: "main-response",
						id: msg.id,
						error: errMessage,
					});
				}
				break;
			}

			// PTY data/exit forwarded to the correct renderer
			case "pty:data":
			case "pty:exit": {
				const webContentsId = sessionToWebContentsId.get(msg.sessionId);
				if (webContentsId != null) {
					try {
						const contents = webContents.fromId(webContentsId);
						if (contents && !contents.isDestroyed()) {
							contents.send(msg.type, msg);
						}
					} catch {
						/* renderer gone */
					}
				}
				if (msg.type === "pty:exit") {
					sessionToWebContentsId.delete(msg.sessionId);
					sessionRegistry.delete(msg.sessionId);
				}
				break;
			}

			case "pty:spawn-result": {
				const pending = pendingPtySpawns.get(msg.requestId);
				if (pending) {
					pendingPtySpawns.delete(msg.requestId);
					if (msg.success) {
						pending.resolve({ success: true, sessionId: msg.sessionId });
					} else {
						// Clean up session mapping on spawn failure
						if (msg.sessionId) {
							sessionToWebContentsId.delete(msg.sessionId);
							sessionRegistry.delete(msg.sessionId);
						}
						pending.resolve({ success: false, error: msg.error });
					}
				} else if (msg.success && msg.sessionId) {
					// Orphan: spawn succeeded after timeout — kill it
					logger.warn(
						`[UtilityBridge] Killing orphan PTY ${msg.sessionId} (spawn arrived after timeout)`
					);
					sendToUtility({ type: "pty:kill", sessionId: msg.sessionId });
				}
				break;
			}

			case "pty:kill-result":
			case "pty:kill-all-result":
				// Fire-and-forget acknowledgments
				break;

			default:
				break;
		}
	});

	// Crash recovery
	child.on("exit", (code) => {
		logger.error(`[UtilityBridge] Utility process exited with code ${code}`);
		utilityChild = null;
		utilityReady = false;
		stopHeartbeat();

		// Do not clear sessionRegistry -- we need it for re-spawning!
		// But do notify renderers that sessions are temporarily unavailable
		for (const [sessionId, webContentsId] of sessionToWebContentsId) {
			// Only notify if we are NOT going to try to re-spawn
			if (!sessionRegistry.has(sessionId)) {
				try {
					const contents = webContents.fromId(webContentsId);
					if (contents && !contents.isDestroyed()) {
						contents.send("pty:exit", {
							sessionId,
							exitCode: -1,
							signal: "CRASHED",
						});
					}
				} catch {
					/* ignore */
				}
			}
		}

		// Resolve any pending spawns with failure
		for (const [, pending] of pendingPtySpawns) {
			pending.resolve({ success: false, error: "Utility process crashed" });
		}
		pendingPtySpawns.clear();

		// Auto-restart after crash (not on intentional stop or clean exit)
		if (!stoppingUtility && code !== 0 && code !== null) {
			logger.info("[UtilityBridge] Restarting utility process in 1s...");
			setTimeout(() => startUtilityProcess(), 1000);
		} else {
			// Clean exit -- clear session registry too
			sessionRegistry.clear();
			sessionToWebContentsId.clear();
		}
	});

	// Send init config
	const httpPort = Number.parseInt(process.env.QCUT_API_PORT ?? "8765", 10);
	utilityChild.postMessage({
		type: "init",
		config: {
			httpPort: Number.isFinite(httpPort) && httpPort > 0 ? httpPort : 8765,
			appVersion: app.getVersion(),
		},
	});
}

/** Stop the utility process */
export function stopUtilityProcess(): void {
	if (utilityChild) {
		stoppingUtility = true;
		stopHeartbeat();
		utilityChild.postMessage({ type: "shutdown" });
		// Give it a moment to clean up, then kill if needed
		setTimeout(() => {
			if (utilityChild) {
				utilityChild.kill();
				utilityChild = null;
			}
		}, 2000);
	}
}

/** Setup PTY IPC handlers that proxy to utility process */
export function setupUtilityPtyIPC(): void {
	logger.info("[UtilityBridge] Setting up PTY IPC handlers (proxy mode)...");
	configureNotificationBridgeWriter();

	// Clean up PTY sessions when renderer is destroyed
	app.on("web-contents-created", (_, contents) => {
		contents.on("destroyed", () => {
			const contentsId = contents.id;
			const sessionsToKill: string[] = [];
			for (const [sessionId, wcId] of sessionToWebContentsId) {
				if (wcId === contentsId) sessionsToKill.push(sessionId);
			}
			for (const sessionId of sessionsToKill) {
				sessionToWebContentsId.delete(sessionId);
				sessionRegistry.delete(sessionId);
				sendToUtility({ type: "pty:kill", sessionId });
			}
		});
	});

	ipcMain.handle(
		"pty:spawn",
		async (event, options: PtySpawnOptions = {}): Promise<PtySpawnResult> => {
			if (!utilityChild && messageQueue.length === 0 && !utilityReady)
				return { success: false, error: "Utility process not running" };

			const sessionId = `pty-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
			const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

			sessionToWebContentsId.set(sessionId, event.sender.id);

			// Resolve MCP server path in main process (needs app.getAppPath())
			const mcpServerPath = resolveQcutMcpServerEntry();

			// Store session metadata for crash recovery
			const metadata: PtySessionMetadata = {
				sessionId,
				webContentsId: event.sender.id,
				cwd: options.cwd,
				command: options.command,
				env: options.env,
				cols: options.cols,
				rows: options.rows,
				mcpServerPath,
				projectId: options.env?.QCUT_PROJECT_ID,
				projectRoot: options.env?.QCUT_PROJECT_ROOT || options.cwd,
				apiBaseUrl: options.env?.QCUT_API_BASE_URL,
			};
			sessionRegistry.set(sessionId, metadata);

			return new Promise((resolve) => {
				const timer = setTimeout(() => {
					pendingPtySpawns.delete(requestId);
					sessionToWebContentsId.delete(sessionId);
					sessionRegistry.delete(sessionId);
					// Remove queued spawn message if it hasn't been flushed yet
					const queueIdx = messageQueue.findIndex(
						(m) => m.type === "pty:spawn" && m.requestId === requestId
					);
					if (queueIdx !== -1) messageQueue.splice(queueIdx, 1);
					// Best-effort kill in case it was already flushed and spawned
					sendToUtility({ type: "pty:kill", sessionId });
					resolve({ success: false, error: "PTY spawn timed out" });
				}, 10_000);

				pendingPtySpawns.set(requestId, {
					resolve: (value: PtySpawnResult) => {
						clearTimeout(timer);
						if (!value.success) {
							sessionRegistry.delete(sessionId);
						}
						resolve(value);
					},
					reject: () => {
						clearTimeout(timer);
						sessionRegistry.delete(sessionId);
						resolve({ success: false, error: "PTY spawn failed" });
					},
				});

				sendToUtility({
					type: "pty:spawn",
					requestId,
					sessionId,
					command: options.command,
					cols: options.cols,
					rows: options.rows,
					cwd: options.cwd,
					env: options.env,
					mcpServerPath,
					projectId: options.env?.QCUT_PROJECT_ID,
					projectRoot: options.env?.QCUT_PROJECT_ROOT || options.cwd,
					apiBaseUrl: options.env?.QCUT_API_BASE_URL,
				});
			});
		}
	);

	ipcMain.handle("pty:write", async (_, sessionId: string, data: string) => {
		if (!utilityChild && !utilityReady)
			return { success: false, error: "Utility process not running" };
		sendToUtility({ type: "pty:write", sessionId, data });
		return { success: true };
	});

	ipcMain.handle(
		"pty:resize",
		async (_, sessionId: string, cols: number, rows: number) => {
			if (!utilityChild && !utilityReady)
				return { success: false, error: "Utility process not running" };
			sendToUtility({ type: "pty:resize", sessionId, cols, rows });
			return { success: true };
		}
	);

	ipcMain.handle("pty:kill", async (_, sessionId: string) => {
		if (!utilityChild && !utilityReady)
			return { success: false, error: "Utility process not running" };
		sendToUtility({ type: "pty:kill", sessionId });
		sessionToWebContentsId.delete(sessionId);
		sessionRegistry.delete(sessionId);
		return { success: true };
	});

	ipcMain.handle("pty:kill-all", async () => {
		sendToUtility({ type: "pty:kill-all" });
		sessionToWebContentsId.clear();
		sessionRegistry.clear();
		return { success: true };
	});

	logger.info("[UtilityBridge] PTY IPC handlers registered (proxy mode)");
}

/** Clean up everything on app quit */
export function cleanupUtilityProcess(): void {
	stopHeartbeat();
	if (utilityChild) {
		utilityChild.postMessage({ type: "pty:kill-all" });
		utilityChild.kill();
		utilityChild = null;
	}
	sessionToWebContentsId.clear();
	sessionRegistry.clear();
	pendingPtySpawns.clear();
	messageQueue.length = 0;
}
