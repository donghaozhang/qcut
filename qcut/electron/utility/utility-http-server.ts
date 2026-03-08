/**
 * Claude HTTP Server for Utility Process
 *
 * This is the HTTP server that runs inside the utility process.
 * Instead of directly accessing BrowserWindow, it uses requestFromMain()
 * to proxy renderer-dependent operations through the main process.
 *
 * Uses shared route definitions from claude-http-shared-routes.ts with
 * a proxied WindowAccessor that forwards calls through the main process.
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createRouter, HttpError } from "../claude/utils/http-router.js";
import { claudeLog } from "../claude/utils/logger.js";
import {
	registerSharedRoutes,
	type WindowAccessor,
} from "../claude/http/claude-http-shared-routes.js";
import { registerStateRoutes } from "../claude/http/claude-http-state-routes.js";
import {
	handleClaudeEventsStreamRequest,
	registerClaudeEventsRoutes,
} from "../claude/http/claude-http-events-routes.js";
import type {
	EditorEvent,
	EditorStateSnapshot,
	Transaction,
	ClaudeTimeline,
	ClaudeSelectionItem,
	ClaudeSplitResponse,
	ProjectStats,
	ClaudeBatchAddResponse,
	ClaudeBatchUpdateResponse,
	ClaudeBatchDeleteResponse,
	ClaudeArrangeResponse,
	BatchCutResponse,
	ClaudeRangeDeleteResponse,
	AutoEditJob,
} from "../types/claude-api.js";
import {
	buildDeepHealthReport,
	buildUtilityMainBridgeCheck,
	DEEP_HEALTH_CHECK_STATUSES,
} from "../claude/handlers/claude-health-handler.js";
import type {
	DeepHealthCheckResult,
	DeepHealthChecks,
	DeepHealthReport,
} from "../claude/handlers/claude-health-handler.js";
import type {
	ClaudeHistorySummary,
	ClaudeUndoRedoResponse,
} from "../claude/handlers/claude-transaction-handler.js";

let server: Server | null = null;

// Type for the requestFromMain function passed in from the utility process entry
type RequestFromMainFn = (
	channel: string,
	data: Record<string, unknown>
) => Promise<unknown>;

/** Window proxy shape returned by createWindowProxy */
interface WindowProxy {
	webContents: {
		send(channel: string, ...args: unknown[]): void;
	};
}

/** Fake BrowserWindow-like object that proxies calls through main process */
function createWindowProxy(requestFromMain: RequestFromMainFn): WindowProxy {
	return {
		webContents: {
			/** Forwards renderer events through the main-process bridge. */
			send(channel: string, ...args: unknown[]) {
				// Fire-and-forget to main process
				requestFromMain("webcontents-send", { channel, args }).catch(
					(err: Error) => {
						claudeLog.warn(
							"HTTP",
							`Failed to send to renderer: ${err.message}`
						);
					}
				);
			},
		},
	};
}

/** Race a promise against a timeout, rejecting with HttpError 504 on expiry. */
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new HttpError(504, message)), ms)
		),
	]);
}

interface UtilityHttpConfig {
	port: number;
	appVersion: string;
	requestFromMain: RequestFromMainFn;
}

/** Build skipped deep health check. */
function buildSkippedDeepHealthCheck({
	message,
}: {
	message: string;
}): DeepHealthCheckResult {
	try {
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.SKIP,
			message,
			durationMs: 0,
		};
	} catch {
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.SKIP,
			message: "Skipped",
			durationMs: 0,
		};
	}
}

/** Handle is deep health report. */
function isDeepHealthReport(value: unknown): value is DeepHealthReport {
	try {
		if (typeof value !== "object" || value === null) {
			return false;
		}
		const candidate = value as { checks?: unknown; summary?: unknown };
		if (typeof candidate.checks !== "object" || candidate.checks === null) {
			return false;
		}
		if (typeof candidate.summary !== "object" || candidate.summary === null) {
			return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** Build unavailable main checks. */
function buildUnavailableMainChecks({
	message,
}: {
	message: string;
}): DeepHealthChecks {
	const skipped = buildSkippedDeepHealthCheck({
		message: `Unavailable via main process: ${message}`,
	});
	return {
		ipcMainReady: skipped,
		utilityMainBridge: skipped,
		rendererResponders: skipped,
		autoEditApplyCutsProbe: skipped,
	};
}

/** Start the HTTP server in the utility process that proxies Claude API routes. */
export function startUtilityHttpServer(config: UtilityHttpConfig): void {
	const { port, appVersion, requestFromMain } = config;

	if (server) {
		claudeLog.warn("HTTP", "Server already running in utility process");
		return;
	}

	const router = createRouter();

	// Create WindowAccessor that proxies through main process
	const accessor: WindowAccessor = {
		/** Creates a BrowserWindow-like proxy backed by main-process IPC. */
		getWindow: () => createWindowProxy(requestFromMain),
		/** Requests the current timeline through the main-process bridge. */
		requestTimeline: () =>
			requestFromMain("get-timeline", {}) as Promise<ClaudeTimeline>,
		/** Requests the current editor selection through the bridge. */
		requestSelection: () =>
			requestFromMain("get-selection", {}) as Promise<ClaudeSelectionItem[]>,
		/** Sends a split request through the bridge. */
		requestSplit: (elementId, splitTime, mode) =>
			requestFromMain("split-element", {
				elementId,
				splitTime,
				mode,
			}) as Promise<ClaudeSplitResponse>,
		/** Fetches project stats through the bridge. */
		getProjectStats: (projectId) =>
			requestFromMain("get-project-stats", {
				projectId,
			}) as Promise<ProjectStats>,
		/** Returns the app version reported by the utility process. */
		getAppVersion: () => appVersion,
		/** Enables notification forwarding for the given session. */
		enableNotifications: (sessionId) =>
			requestFromMain("notifications:enable", { sessionId }) as Promise<{
				enabled: boolean;
				sessionId: string | null;
			}>,
		/** Disables notification forwarding. */
		disableNotifications: () =>
			requestFromMain("notifications:disable", {}) as Promise<{
				enabled: boolean;
				sessionId: string | null;
			}>,
		/** Returns the current notification bridge status. */
		getNotificationsStatus: () =>
			requestFromMain("notifications:status", {}) as Promise<{
				enabled: boolean;
				sessionId: string | null;
			}>,
		/** Returns recent notification bridge history entries. */
		getNotificationsHistory: (limit) =>
			requestFromMain("notifications:history", { limit }) as Promise<string[]>,
		/** Adds multiple elements through the main-process bridge. */
		batchAddElements: (projectId, elements) =>
			requestFromMain("batch-add-elements", {
				projectId,
				elements,
			}) as Promise<ClaudeBatchAddResponse>,
		/** Applies a batch of element updates through the bridge. */
		batchUpdateElements: (updates) =>
			requestFromMain("batch-update-elements", {
				updates,
			}) as Promise<ClaudeBatchUpdateResponse>,
		/** Deletes multiple elements through the bridge. */
		batchDeleteElements: (elements, ripple) =>
			requestFromMain("batch-delete-elements", {
				elements,
				ripple,
			}) as Promise<ClaudeBatchDeleteResponse>,
		/** Applies automatic arrangement to the timeline. */
		arrangeTimeline: (data) =>
			requestFromMain("arrange-timeline", {
				trackId: data.trackId,
				mode: data.mode,
				gap: data.gap,
				order: data.order,
				startOffset: data.startOffset,
			}) as Promise<ClaudeArrangeResponse>,
		/** Starts a transactional timeline mutation. */
		beginTransaction: (request) =>
			requestFromMain("transaction:begin", { request }) as Promise<Transaction>,
		/** Commits a pending timeline transaction. */
		commitTransaction: (transactionId) =>
			requestFromMain("transaction:commit", {
				transactionId,
			}) as Promise<{ transaction: Transaction; historyEntryAdded: boolean }>,
		/** Rolls back a pending timeline transaction. */
		rollbackTransaction: (transactionId, reason) =>
			requestFromMain("transaction:rollback", {
				transactionId,
				reason,
			}) as Promise<{ transaction: Transaction }>,
		/** Returns the current state of a timeline transaction. */
		getTransactionStatus: (transactionId) =>
			requestFromMain("transaction:status", {
				transactionId,
			}) as Promise<Transaction | null>,
		/** Undoes the last timeline mutation. */
		undoTimeline: () =>
			requestFromMain("timeline:undo", {}) as Promise<ClaudeUndoRedoResponse>,
		/** Redoes the last undone timeline mutation. */
		redoTimeline: () =>
			requestFromMain("timeline:redo", {}) as Promise<ClaudeUndoRedoResponse>,
		/** Returns a summary of undo and redo history. */
		getHistorySummary: () =>
			requestFromMain("timeline:history", {}) as Promise<ClaudeHistorySummary>,
		/** Requests an editor state snapshot through the bridge. */
		requestStateSnapshot: (request) =>
			requestFromMain("get-editor-state-snapshot", {
				request,
			}) as Promise<EditorStateSnapshot>,
		/** Executes batched cut operations through the bridge. */
		executeBatchCuts: async (request) =>
			(await requestFromMain("timeline:batch-cuts", {
				request,
			})) as BatchCutResponse,
		/** Executes a range deletion operation through the bridge. */
		executeDeleteRange: async (request) =>
			(await requestFromMain("timeline:delete-range", {
				request,
			})) as ClaudeRangeDeleteResponse,
		/** Starts an auto-edit job through the bridge. */
		startAutoEditJob: async (projectId, request) =>
			(await requestFromMain("timeline:auto-edit:start", {
				projectId,
				request,
			})) as { jobId: string },
		/** Returns the current status for an auto-edit job. */
		getAutoEditJobStatus: async (jobId) =>
			(await requestFromMain("timeline:auto-edit:status", {
				jobId,
			})) as AutoEditJob | null,
		/** Lists active and recent auto-edit jobs. */
		listAutoEditJobs: async () =>
			(await requestFromMain("timeline:auto-edit:list", {})) as AutoEditJob[],
		/** Cancels an auto-edit job. */
		cancelAutoEditJob: async (jobId) =>
			(await requestFromMain("timeline:auto-edit:cancel", {
				jobId,
			})) as boolean,
	};

	// Register all shared routes
	registerSharedRoutes(router, accessor, {
		/** Runs deep health checks through the main-process bridge. */
		runDeepHealthChecks: async () => {
			const startedAt = Date.now();
			try {
				const mainReport = await requestFromMain("health:deep-checks", {});
				const bridgeCheck = buildUtilityMainBridgeCheck({
					failed: false,
					message: "Utility-to-main bridge roundtrip succeeded.",
					durationMs: Date.now() - startedAt,
				});
				if (!isDeepHealthReport(mainReport)) {
					return buildDeepHealthReport({
						checks: {
							...buildUnavailableMainChecks({
								message: "Invalid deep health payload from main process",
							}),
							utilityMainBridge: bridgeCheck,
						},
					});
				}
				return buildDeepHealthReport({
					checks: {
						...(mainReport.checks as DeepHealthChecks),
						utilityMainBridge: bridgeCheck,
					},
				});
			} catch (error) {
				const bridgeCheck = buildUtilityMainBridgeCheck({
					failed: true,
					message:
						error instanceof Error
							? `Utility-to-main bridge probe failed: ${error.message}`
							: "Utility-to-main bridge probe failed",
					durationMs: Date.now() - startedAt,
				});
				return buildDeepHealthReport({
					checks: {
						...buildUnavailableMainChecks({
							message:
								error instanceof Error
									? error.message
									: "Bridge request failed",
						}),
						utilityMainBridge: bridgeCheck,
					},
				});
			}
		},
	});
	registerStateRoutes(router, {
		/** Returns the current editor snapshot for state routes. */
		requestSnapshot: async (request) =>
			(await requestFromMain("get-editor-state-snapshot", {
				request,
			})) as EditorStateSnapshot,
		timeoutMs: 10_000,
	});
	registerClaudeEventsRoutes(router, {
		/** Lists recorded Claude/editor events through the bridge. */
		listEvents: async (filter) =>
			(await requestFromMain("events:list", {
				...(filter as unknown as Record<string, unknown>),
			})) as EditorEvent[],
	});

	// ==========================================================================
	// Navigator routes (project listing + editor navigation)
	// ==========================================================================
	router.get("/api/claude/navigator/projects", async () => {
		return await withTimeout(
			requestFromMain("get-projects", {}),
			10_000,
			"Renderer timed out"
		);
	});

	// Backward-compatible alias used by older CLI builds.
	router.get("/api/claude/projects", async () => {
		return await withTimeout(
			requestFromMain("get-projects", {}),
			10_000,
			"Renderer timed out"
		);
	});

	router.post("/api/claude/navigator/open", async (req) => {
		if (!req.body?.projectId || typeof req.body.projectId !== "string") {
			throw new HttpError(400, "Missing 'projectId' in request body");
		}
		return await withTimeout(
			requestFromMain("navigate-to-project", {
				projectId: req.body.projectId,
			}),
			10_000,
			"Renderer timed out"
		);
	});

	// ==========================================================================
	// Screenshot capture
	// ==========================================================================
	router.post("/api/claude/screenshot/capture", async (req) => {
		const fileName =
			typeof req.body?.fileName === "string" ? req.body.fileName : undefined;
		return await withTimeout(
			requestFromMain("screenshot:capture", { fileName }),
			10_000,
			"Screenshot capture timed out"
		);
	});

	// ==========================================================================
	// Screen Recording routes
	// ==========================================================================
	router.get("/api/claude/screen-recording/sources", async () => {
		return await withTimeout(
			requestFromMain("screen-recording:sources", {}),
			10_000,
			"Timed out listing sources"
		);
	});

	router.get("/api/claude/screen-recording/status", async () => {
		return await withTimeout(
			requestFromMain("screen-recording:status", {}),
			10_000,
			"Timed out getting status"
		);
	});

	router.post("/api/claude/screen-recording/start", async (req) => {
		const sourceId = req.body?.sourceId as string | undefined;
		const fileName = req.body?.fileName as string | undefined;
		return await withTimeout(
			requestFromMain("screen-recording:start", { sourceId, fileName }),
			30_000,
			"Recording start timed out"
		);
	});

	router.post("/api/claude/screen-recording/stop", async (req) => {
		const discard = req.body?.discard === true;
		return await withTimeout(
			requestFromMain("screen-recording:stop", { discard }),
			30_000,
			"Recording stop timed out"
		);
	});

	router.post("/api/claude/screen-recording/force-stop", async () => {
		return await withTimeout(
			requestFromMain("screen-recording:force-stop", {}),
			15_000,
			"Recording force-stop timed out"
		);
	});

	// ==========================================================================
	// Project CRUD routes
	// ==========================================================================
	router.post("/api/claude/project/create", async (req) => {
		const name = req.body?.name as string | undefined;
		return await withTimeout(
			requestFromMain("project:create", { name: name || "New Project" }),
			10_000,
			"Create project timed out"
		);
	});

	router.post("/api/claude/project/delete", async (req) => {
		if (!req.body?.projectId || typeof req.body.projectId !== "string") {
			throw new HttpError(400, "Missing 'projectId' in request body");
		}
		return await withTimeout(
			requestFromMain("project:delete", {
				projectId: req.body.projectId,
			}),
			10_000,
			"Delete project timed out"
		);
	});

	router.post("/api/claude/project/rename", async (req) => {
		if (!req.body?.projectId || typeof req.body.projectId !== "string") {
			throw new HttpError(400, "Missing 'projectId' in request body");
		}
		if (!req.body?.name || typeof req.body.name !== "string") {
			throw new HttpError(400, "Missing 'name' in request body");
		}
		return await withTimeout(
			requestFromMain("project:rename", {
				projectId: req.body.projectId,
				name: req.body.name,
			}),
			10_000,
			"Rename project timed out"
		);
	});

	router.post("/api/claude/project/duplicate", async (req) => {
		if (!req.body?.projectId || typeof req.body.projectId !== "string") {
			throw new HttpError(400, "Missing 'projectId' in request body");
		}
		return await withTimeout(
			requestFromMain("project:duplicate", {
				projectId: req.body.projectId,
			}),
			10_000,
			"Duplicate project timed out"
		);
	});

	// ==========================================================================
	// UI Panel Navigation routes
	// ==========================================================================
	router.post("/api/claude/ui/switch-panel", async (req) => {
		if (!req.body?.panel || typeof req.body.panel !== "string") {
			throw new HttpError(400, "Missing 'panel' in request body");
		}
		const payload: Record<string, string> = { panel: req.body.panel };
		if (req.body.tab && typeof req.body.tab === "string") {
			payload.tab = req.body.tab;
		}
		return await withTimeout(
			requestFromMain("switch-panel", payload),
			10_000,
			"Panel switch timed out"
		);
	});

	// ==========================================================================
	// Moyin (Director) CLI routes
	// ==========================================================================
	router.post("/api/claude/moyin/set-script", async (req) => {
		if (!req.body?.text || typeof req.body.text !== "string") {
			throw new HttpError(400, "Missing 'text' in request body");
		}
		return await withTimeout(
			requestFromMain("moyin:set-script", { text: req.body.text }),
			10_000,
			"Set script timed out"
		);
	});

	router.post("/api/claude/moyin/parse", async () => {
		return await withTimeout(
			requestFromMain("moyin:trigger-parse", {}),
			10_000,
			"Trigger parse timed out"
		);
	});

	router.post("/api/claude/moyin/generate", async (req) => {
		if (!req.body?.idea || typeof req.body.idea !== "string")
			throw new HttpError(400, "Missing 'idea' in request body");
		return await withTimeout(
			requestFromMain("moyin:generate-script", {
				idea: req.body.idea,
				genre: req.body.genre,
				targetDuration: req.body.targetDuration,
			}),
			10_000,
			"Generate script timed out"
		);
	});

	router.get("/api/claude/moyin/status", async () => {
		return await withTimeout(
			requestFromMain("moyin:status", {}),
			10_000,
			"Moyin status timed out"
		);
	});

	router.get("/api/claude/moyin/export", async () => {
		return await withTimeout(
			requestFromMain("moyin:export", {}),
			10_000,
			"Moyin export timed out"
		);
	});

	// ==========================================================================
	// Auth routes (token management)
	// ==========================================================================
	router.get("/api/claude/auth/token", async () => {
		return await withTimeout(
			requestFromMain("auth:get-token", {}),
			5_000,
			"Get auth token timed out"
		);
	});

	router.post("/api/claude/auth/token", async (req) => {
		if (!req.body?.token || typeof req.body.token !== "string") {
			throw new HttpError(400, "Missing 'token' in request body");
		}
		return await withTimeout(
			requestFromMain("auth:set-token", { token: req.body.token }),
			5_000,
			"Set auth token timed out"
		);
	});

	router.delete("/api/claude/auth/token", async () => {
		return await withTimeout(
			requestFromMain("auth:set-token", { token: "" }),
			5_000,
			"Clear auth token timed out"
		);
	});

	router.post("/api/claude/auth/activate", async (req) => {
		if (!req.body?.token || typeof req.body.token !== "string") {
			throw new HttpError(400, "Missing 'token' in request body");
		}
		return await withTimeout(
			requestFromMain("auth:activate", { token: req.body.token }),
			15_000,
			"License activation timed out"
		);
	});

	// Auth check
	/** Handle check auth. */
	function checkAuth(req: IncomingMessage): boolean {
		const token = process.env.QCUT_API_TOKEN;
		if (!token) return true;
		return req.headers.authorization === `Bearer ${token}`;
	}

	// CORS
	/** Set cors headers. */
	function setCorsHeaders(res: ServerResponse): void {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader(
			"Access-Control-Allow-Methods",
			"GET, POST, PATCH, DELETE, OPTIONS"
		);
		res.setHeader(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization"
		);
	}

	// ==========================================================================
	// Create and start server
	// ==========================================================================
	server = createServer((req, res) => {
		setCorsHeaders(res);
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		req.setTimeout(120_000, () => {
			res.writeHead(408, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					success: false,
					error: "Request timeout",
					timestamp: Date.now(),
				})
			);
		});
		if (!checkAuth(req)) {
			res.writeHead(401, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					success: false,
					error: "Unauthorized",
					timestamp: Date.now(),
				})
			);
			return;
		}
		if (
			handleClaudeEventsStreamRequest({
				req,
				res,
				listEvents: async (filter) =>
					(await requestFromMain("events:list", {
						...(filter as unknown as Record<string, unknown>),
					})) as EditorEvent[],
			})
		) {
			return;
		}
		router.handle(req, res);
	});

	server.listen(port, "127.0.0.1", () => {
		claudeLog.info(
			"HTTP",
			`Server started on http://127.0.0.1:${port} (utility process)`
		);
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			claudeLog.warn("HTTP", `Port ${port} in use. Claude HTTP API disabled.`);
		} else {
			claudeLog.error("HTTP", `Server error: ${err.message}`);
		}
		server = null;
	});
}

/** Stop utility http server. */
export function stopUtilityHttpServer(): void {
	if (server) {
		server.close();
		server = null;
		claudeLog.info("HTTP", "Server stopped (utility process)");
	}
}
