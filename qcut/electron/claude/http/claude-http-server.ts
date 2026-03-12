/**
 * Claude HTTP Server
 * Exposes QCut's Claude API over HTTP so Claude Code can control QCut externally.
 *
 * Architecture:
 *   Claude Code --> HTTP --> localhost:8765 --> extracted handler functions --> QCut
 *
 * Uses shared route definitions from claude-http-shared-routes.ts with direct
 * BrowserWindow access (main process).
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { app, BrowserWindow } from "electron";
import { createRouter, HttpError } from "../utils/http-router.js";
import { claudeLog } from "../utils/logger.js";
import { generateId } from "../utils/helpers.js";
import {
	requestTimelineFromRenderer,
	requestSplitFromRenderer,
	requestSelectionFromRenderer,
	batchAddElements,
	batchUpdateElements,
	batchDeleteElements,
	arrangeTimeline,
} from "../handlers/claude-timeline-handler.js";
import {
	beginTransaction,
	commitTransaction,
	rollbackTransaction,
	getTransactionStatus,
	undoTimeline,
	redoTimeline,
	getHistorySummary,
} from "../handlers/claude-transaction-handler.js";
import { getProjectStats } from "../handlers/claude-project-handler.js";
import { executeBatchCuts } from "../handlers/claude-cuts-handler.js";
import { executeDeleteRange } from "../handlers/claude-range-handler.js";
import {
	startAutoEditJob,
	getAutoEditJobStatus,
	listAutoEditJobs,
	cancelAutoEditJob,
} from "../handlers/claude-auto-edit-handler.js";
import {
	registerSharedRoutes,
	type WindowAccessor,
} from "./claude-http-shared-routes.js";
import {
	requestProjectsFromRenderer,
	requestNavigateToProject,
} from "../handlers/claude-navigator-handler.js";
import { registerStateRoutes } from "./claude-http-state-routes.js";
import { requestEditorStateSnapshotFromRenderer } from "../handlers/claude-state-handler.js";
import { registerSnapshotRoutes } from "./claude-http-snapshot-routes.js";
import {
	checkEditorSnapshotRef,
	clickEditorSnapshotRef,
	fillEditorSnapshotRef,
	requestEditorSnapshotFromRenderer,
	selectEditorSnapshotRef,
} from "../handlers/claude-snapshot-handler.js";
import {
	getClaudeEvents,
	subscribeClaudeEvents,
} from "../handlers/claude-events-handler.js";
import { notificationBridge } from "../notification-bridge.js";
import {
	handleClaudeEventsStreamRequest,
	registerClaudeEventsRoutes,
} from "./claude-http-events-routes.js";
import {
	clearConsoleEntries,
	getConsoleEntries,
	subscribeToConsoleEntries,
} from "../handlers/claude-console-handler.js";
import {
	handleClaudeConsoleStreamRequest,
	registerClaudeConsoleRoutes,
} from "./claude-http-console-routes.js";
import { runMainProcessDeepHealthChecks } from "../handlers/claude-health-handler.js";
import { getAuthToken, setAuthToken } from "../../license-handler.js";
import { authorizeClaudeHttpRequest } from "./claude-http-auth.js";

let server: Server | null = null;

/**
 * Get the first available BrowserWindow or throw 503
 */
function getWindow(): BrowserWindow {
	const win = BrowserWindow.getAllWindows()[0];
	if (!win) throw new HttpError(503, "No active QCut window");
	return win;
}

/** Set permissive CORS headers on the HTTP response. */
function setCorsHeaders(res: ServerResponse): void {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET, POST, PATCH, DELETE, OPTIONS"
	);
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

/** Start the local HTTP API server for Claude and MCP integrations. */
export function startClaudeHTTPServer(
	port = Number.parseInt(process.env.QCUT_API_PORT ?? "8765", 10)
): void {
	const resolvedPort = Number.isFinite(port) && port > 0 ? port : 8765;
	if (resolvedPort !== port) {
		claudeLog.warn("HTTP", "Invalid QCUT_API_PORT, falling back to 8765");
	}
	if (server) {
		claudeLog.warn("HTTP", "Server already running, skipping start");
		return;
	}

	const router = createRouter();

	// Create WindowAccessor for direct main-process BrowserWindow access
	const accessor: WindowAccessor = {
		/** Returns the main-process BrowserWindow for route handlers. */
		getWindow,
		/** Requests the current timeline from the renderer. */
		requestTimeline: () => requestTimelineFromRenderer(getWindow()),
		/** Requests the current renderer selection. */
		requestSelection: (correlationId) =>
			requestSelectionFromRenderer(getWindow(), correlationId),
		/** Sends a split request to the renderer timeline. */
		requestSplit: (elementId, splitTime, mode, correlationId) =>
			requestSplitFromRenderer(
				getWindow(),
				elementId,
				splitTime,
				mode,
				correlationId
			),
		/** Fetches project stats from the renderer. */
		getProjectStats: (projectId) => getProjectStats(getWindow(), projectId),
		/** Returns the current app version. */
		getAppVersion: () => app.getVersion(),
		/** Enables notification forwarding for a session. */
		enableNotifications: (sessionId) =>
			Promise.resolve(notificationBridge.enable({ sessionId })),
		/** Disables notification forwarding. */
		disableNotifications: () => Promise.resolve(notificationBridge.disable()),
		/** Returns the current notification bridge status. */
		getNotificationsStatus: () =>
			Promise.resolve(notificationBridge.getStatus()),
		/** Returns recent notification bridge history entries. */
		getNotificationsHistory: (limit) =>
			Promise.resolve(notificationBridge.getHistory({ limit })),
		/** Adds multiple elements in one renderer mutation. */
		batchAddElements: (projectId, elements, correlationId) =>
			batchAddElements(getWindow(), projectId, elements, correlationId),
		/** Applies a batch of element updates. */
		batchUpdateElements: (updates, correlationId) =>
			batchUpdateElements(getWindow(), updates, correlationId),
		/** Deletes multiple elements in one renderer mutation. */
		batchDeleteElements: (elements, ripple, correlationId) =>
			batchDeleteElements(getWindow(), elements, ripple, correlationId),
		/** Applies automatic arrangement to the timeline. */
		arrangeTimeline: (data, correlationId) =>
			arrangeTimeline(getWindow(), data, correlationId),
		/** Starts a transactional timeline mutation. */
		beginTransaction: (request) =>
			beginTransaction({ win: getWindow(), request }),
		/** Commits a pending timeline transaction. */
		commitTransaction: (transactionId) => commitTransaction({ transactionId }),
		/** Rolls back a pending timeline transaction. */
		rollbackTransaction: (transactionId, reason) =>
			rollbackTransaction({ transactionId, reason }),
		/** Returns the current state of a timeline transaction. */
		getTransactionStatus: (transactionId) =>
			Promise.resolve(getTransactionStatus({ transactionId })),
		/** Undoes the last timeline mutation. */
		undoTimeline: () => undoTimeline({ win: getWindow() }),
		/** Redoes the last undone timeline mutation. */
		redoTimeline: () => redoTimeline({ win: getWindow() }),
		/** Returns a summary of undo and redo history. */
		getHistorySummary: () => getHistorySummary({ win: getWindow() }),
		/** Requests an editor state snapshot from the renderer. */
		requestStateSnapshot: (request) =>
			requestEditorStateSnapshotFromRenderer(getWindow(), request),
		/** Starts an auto-edit job in the main process. */
		startAutoEditJob: async (projectId, request) =>
			startAutoEditJob(projectId, request, getWindow()),
		/** Returns the current status for an auto-edit job. */
		getAutoEditJobStatus: async (jobId) => getAutoEditJobStatus(jobId),
		/** Lists active and recent auto-edit jobs. */
		listAutoEditJobs: async () => listAutoEditJobs(),
		/** Cancels an auto-edit job. */
		cancelAutoEditJob: async (jobId) => cancelAutoEditJob(jobId),
		/** Executes batched cut operations. */
		executeBatchCuts: async (request) => executeBatchCuts(getWindow(), request),
		/** Executes a range deletion operation. */
		executeDeleteRange: async (request) =>
			executeDeleteRange(getWindow(), request),
	};

	// Register all shared routes
	registerSharedRoutes(router, accessor, {
		/** Runs deep health checks against the main process and renderer bridge. */
		runDeepHealthChecks: async () =>
			runMainProcessDeepHealthChecks({
				getWindow,
				/** Re-requests the timeline from the renderer during health probes. */
				requestTimeline: async ({ win }) =>
					await requestTimelineFromRenderer(win),
			}),
	});
	registerStateRoutes(router, {
		/** Returns the current editor snapshot for state routes. */
		requestSnapshot: (request) =>
			requestEditorStateSnapshotFromRenderer(getWindow(), request),
	});
	registerSnapshotRoutes(router, {
		requestSnapshot: (request) =>
			requestEditorSnapshotFromRenderer(getWindow(), request),
		clickSnapshotRef: (request) => clickEditorSnapshotRef(getWindow(), request),
		fillSnapshotRef: (request) => fillEditorSnapshotRef(getWindow(), request),
		selectSnapshotRef: (request) =>
			selectEditorSnapshotRef(getWindow(), request),
		checkSnapshotRef: (request) => checkEditorSnapshotRef(getWindow(), request),
	});
	registerClaudeEventsRoutes(router, {
		/** Lists recorded Claude/editor events. */
		listEvents: async (filter) => getClaudeEvents(filter),
	});
	registerClaudeConsoleRoutes(router, {
		listConsoleEntries: async (filter) => getConsoleEntries(filter),
		clearConsoleEntries: async () => clearConsoleEntries(),
	});

	// ==========================================================================
	// Navigator routes (project listing + editor navigation)
	// ==========================================================================
	router.get("/api/claude/navigator/projects", async () => {
		const win = getWindow();
		return await Promise.race([
			requestProjectsFromRenderer(win),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new HttpError(504, "Renderer timed out")), 5000)
			),
		]);
	});

	// Backward-compatible alias used by older CLI builds.
	router.get("/api/claude/projects", async () => {
		const win = getWindow();
		return await Promise.race([
			requestProjectsFromRenderer(win),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new HttpError(504, "Renderer timed out")), 5000)
			),
		]);
	});

	router.post("/api/claude/navigator/open", async (req) => {
		if (!req.body?.projectId || typeof req.body.projectId !== "string") {
			throw new HttpError(400, "Missing 'projectId' in request body");
		}
		const win = getWindow();
		return await Promise.race([
			requestNavigateToProject(win, req.body.projectId),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new HttpError(504, "Renderer timed out")), 5000)
			),
		]);
	});

	// ==========================================================================
	// Auth routes (token management)
	// ==========================================================================
	router.get("/api/claude/auth/token", async () => {
		const token = await getAuthToken();
		return {
			authenticated: token.length > 0,
		};
	});

	router.post("/api/claude/auth/token", async (req) => {
		if (!req.body?.token || typeof req.body.token !== "string") {
			throw new HttpError(400, "Missing 'token' in request body");
		}
		setAuthToken({ token: req.body.token });
		return { success: true };
	});

	router.delete("/api/claude/auth/token", async () => {
		setAuthToken({ token: "" });
		return { success: true };
	});

	router.post("/api/claude/auth/activate", async (req) => {
		if (!req.body?.token || typeof req.body.token !== "string") {
			throw new HttpError(400, "Missing 'token' in request body");
		}
		const token = req.body.token.trim();
		if (!token) {
			throw new HttpError(400, "Token cannot be empty");
		}
		const LICENSE_SERVER_URL =
			process.env.QCUT_LICENSE_SERVER_URL ||
			"https://qcut-license-server.zdhpeter.workers.dev";
		const hostname = require("node:os").hostname();
		const response = await fetch(`${LICENSE_SERVER_URL}/api/license/activate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({
				deviceFingerprint: `cli-${hostname}`,
				deviceName: hostname,
			}),
		});
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new HttpError(
				response.status,
				`Activation failed: ${text || response.statusText}`
			);
		}
		const data = (await response.json().catch(() => ({}))) as Record<
			string,
			unknown
		>;
		setAuthToken({ token });
		return { activated: true, ...data };
	});

	// ==========================================================================
	// Create and start the server
	// ==========================================================================
	server = createServer((req, res) => {
		setCorsHeaders(res);
		let requestCorrelationId = "";
		try {
			requestCorrelationId = generateId("corr");
		} catch {
			requestCorrelationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		}
		res.setHeader("X-Correlation-Id", requestCorrelationId);

		if (req.method === "OPTIONS") {
			res.writeHead(204, { "X-Correlation-Id": requestCorrelationId });
			res.end();
			return;
		}

		// 30s request timeout
		req.setTimeout(30_000, () => {
			res.writeHead(408, {
				"Content-Type": "application/json",
				"X-Correlation-Id": requestCorrelationId,
			});
			res.end(
				JSON.stringify({
					success: false,
					error: "Request timeout",
					timestamp: Date.now(),
					correlationId: requestCorrelationId,
				})
			);
		});

		const authResult = authorizeClaudeHttpRequest({ req });
		if (!authResult.ok) {
			res.writeHead(authResult.status ?? 401, {
				"Content-Type": "application/json",
				"X-Correlation-Id": requestCorrelationId,
			});
			res.end(
				JSON.stringify({
					success: false,
					error: authResult.error ?? "Unauthorized",
					timestamp: Date.now(),
					correlationId: requestCorrelationId,
				})
			);
			return;
		}

		if (
			handleClaudeEventsStreamRequest({
				req,
				res,
				listEvents: async (filter) => getClaudeEvents(filter),
				subscribeToEvents: ({ listener }) =>
					subscribeClaudeEvents({ listener }),
			})
		) {
			return;
		}
		if (
			handleClaudeConsoleStreamRequest({
				req,
				res,
				listConsoleEntries: async (filter) => getConsoleEntries(filter),
				clearConsoleEntries: async () => clearConsoleEntries(),
				subscribeToConsoleEntries: ({ listener }) =>
					subscribeToConsoleEntries({ listener }),
			})
		) {
			return;
		}

		router.handle(req, res);
	});

	server.listen(resolvedPort, "127.0.0.1", () => {
		claudeLog.info(
			"HTTP",
			`Server started on http://127.0.0.1:${resolvedPort}`
		);
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			claudeLog.warn(
				"HTTP",
				`Port ${resolvedPort} in use. Claude HTTP API disabled.`
			);
		} else {
			claudeLog.error("HTTP", `Server error: ${err.message}`);
		}
		server = null;
	});
}

/** Stop the running Claude HTTP server if active. */
export function stopClaudeHTTPServer(): void {
	if (server) {
		server.close();
		server = null;
		claudeLog.info("HTTP", "Server stopped");
	}
}

// CommonJS export for main.ts compatibility
module.exports = { startClaudeHTTPServer, stopClaudeHTTPServer };
