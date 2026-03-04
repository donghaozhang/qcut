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
import {
	getClaudeEvents,
	subscribeClaudeEvents,
} from "../handlers/claude-events-handler.js";
import { notificationBridge } from "../notification-bridge.js";
import {
	handleClaudeEventsStreamRequest,
	registerClaudeEventsRoutes,
} from "./claude-http-events-routes.js";
import { runMainProcessDeepHealthChecks } from "../handlers/claude-health-handler.js";

let server: Server | null = null;

/**
 * Get the first available BrowserWindow or throw 503
 */
function getWindow(): BrowserWindow {
	const win = BrowserWindow.getAllWindows()[0];
	if (!win) throw new HttpError(503, "No active QCut window");
	return win;
}

/**
 * Check bearer token auth (only enforced when QCUT_API_TOKEN is set)
 */
function checkAuth(req: IncomingMessage): boolean {
	const token = process.env.QCUT_API_TOKEN;
	if (!token) return true;
	const authHeader = req.headers.authorization;
	return authHeader === `Bearer ${token}`;
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
		getWindow,
		requestTimeline: () => requestTimelineFromRenderer(getWindow()),
		requestSelection: (correlationId) =>
			requestSelectionFromRenderer(getWindow(), correlationId),
		requestSplit: (elementId, splitTime, mode, correlationId) =>
			requestSplitFromRenderer(
				getWindow(),
				elementId,
				splitTime,
				mode,
				correlationId
			),
		getProjectStats: (projectId) => getProjectStats(getWindow(), projectId),
		getAppVersion: () => app.getVersion(),
		enableNotifications: (sessionId) =>
			Promise.resolve(notificationBridge.enable({ sessionId })),
		disableNotifications: () => Promise.resolve(notificationBridge.disable()),
		getNotificationsStatus: () =>
			Promise.resolve(notificationBridge.getStatus()),
		getNotificationsHistory: (limit) =>
			Promise.resolve(notificationBridge.getHistory({ limit })),
		batchAddElements: (projectId, elements, correlationId) =>
			batchAddElements(getWindow(), projectId, elements, correlationId),
		batchUpdateElements: (updates, correlationId) =>
			batchUpdateElements(getWindow(), updates, correlationId),
		batchDeleteElements: (elements, ripple, correlationId) =>
			batchDeleteElements(getWindow(), elements, ripple, correlationId),
		arrangeTimeline: (data, correlationId) =>
			arrangeTimeline(getWindow(), data, correlationId),
		beginTransaction: (request) =>
			beginTransaction({ win: getWindow(), request }),
		commitTransaction: (transactionId) => commitTransaction({ transactionId }),
		rollbackTransaction: (transactionId, reason) =>
			rollbackTransaction({ transactionId, reason }),
		getTransactionStatus: (transactionId) =>
			Promise.resolve(getTransactionStatus({ transactionId })),
		undoTimeline: () => undoTimeline({ win: getWindow() }),
		redoTimeline: () => redoTimeline({ win: getWindow() }),
		getHistorySummary: () => getHistorySummary({ win: getWindow() }),
		requestStateSnapshot: (request) =>
			requestEditorStateSnapshotFromRenderer(getWindow(), request),
		startAutoEditJob: async (projectId, request) => {
			try {
				return startAutoEditJob(projectId, request, getWindow());
			} catch (error) {
				throw error;
			}
		},
		getAutoEditJobStatus: async (jobId) => {
			try {
				return getAutoEditJobStatus(jobId);
			} catch (error) {
				throw error;
			}
		},
		listAutoEditJobs: async () => {
			try {
				return listAutoEditJobs();
			} catch (error) {
				throw error;
			}
		},
		cancelAutoEditJob: async (jobId) => {
			try {
				return cancelAutoEditJob(jobId);
			} catch (error) {
				throw error;
			}
		},
		executeBatchCuts: async (request) => {
			try {
				return await executeBatchCuts(getWindow(), request);
			} catch (error) {
				throw error;
			}
		},
		executeDeleteRange: async (request) => {
			try {
				return await executeDeleteRange(getWindow(), request);
			} catch (error) {
				throw error;
			}
		},
	};

	// Register all shared routes
	registerSharedRoutes(router, accessor, {
		runDeepHealthChecks: async () => {
			try {
				return await runMainProcessDeepHealthChecks({
					getWindow,
					requestTimeline: async ({ win }) =>
						await requestTimelineFromRenderer(win),
				});
			} catch (error) {
				throw error;
			}
		},
	});
	registerStateRoutes(router, {
		requestSnapshot: (request) =>
			requestEditorStateSnapshotFromRenderer(getWindow(), request),
	});
	registerClaudeEventsRoutes(router, {
		listEvents: async (filter) => getClaudeEvents(filter),
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

		// Auth check
		if (!checkAuth(req)) {
			res.writeHead(401, {
				"Content-Type": "application/json",
				"X-Correlation-Id": requestCorrelationId,
			});
			res.end(
				JSON.stringify({
					success: false,
					error: "Unauthorized",
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
