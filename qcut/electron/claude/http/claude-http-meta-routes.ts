import type { ParsedRequest, Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";
import {
	claudeCorrelationTracker,
	toCommandLifecycle,
} from "../handlers/claude-correlation.js";
import {
	getApiVersion,
	getApiVersionInfo,
	getCapabilities,
	getCapabilityManifest,
	getCapabilitySupport,
} from "../handlers/claude-capability-handler.js";
import { getClaudeCommandRegistry } from "../handlers/claude-command-registry.js";
import type { CommandRecord, CorrelationId } from "../../types/claude-api.js";
import type { DeepHealthReport } from "../handlers/claude-health-handler.js";

const COMMAND_WAIT_TIMEOUT_MS = 29_000;

/** Handle should run deep health. */
function shouldRunDeepHealth({
	value,
}: {
	value: string | undefined;
}): boolean {
	try {
		if (!value) {
			return false;
		}
		const normalized = value.trim().toLowerCase();
		return (
			normalized === "1" ||
			normalized === "true" ||
			normalized === "yes" ||
			normalized === "on"
		);
	} catch {
		return false;
	}
}

/** Handle derive deep health status. */
function deriveDeepHealthStatus({
	report,
}: {
	report: DeepHealthReport;
}): "ok" | "degraded" {
	try {
		return report.summary.failed > 0 ? "degraded" : "ok";
	} catch {
		return "degraded";
	}
}

/** Handle should skip correlation tracking. */
function shouldSkipCorrelationTracking({
	pathname,
}: {
	pathname: string;
}): boolean {
	try {
		if (pathname.startsWith("/api/claude/commands")) {
			return true;
		}
		return pathname === "/api/claude/health";
	} catch {
		return false;
	}
}

/** Build tracked command params. */
function buildTrackedCommandParams({
	req,
}: {
	req: ParsedRequest;
}): Record<string, unknown> {
	try {
		const params: Record<string, unknown> = {};
		if (Object.keys(req.params).length > 0) {
			params.params = req.params;
		}
		if (Object.keys(req.query).length > 0) {
			params.query = req.query;
		}
		if (req.body !== undefined) {
			params.body = req.body;
		}
		return params;
	} catch {
		return {};
	}
}

/** Set request command meta. */
function setRequestCommandMeta({
	req,
	record,
}: {
	req: ParsedRequest;
	record: CommandRecord | null;
}): void {
	try {
		if (!req.responseMeta || !record) return;
		req.responseMeta.correlationId = record.correlationId;
		req.responseMeta.lifecycle = toCommandLifecycle({ record });
	} catch {
		// no-op
	}
}

/** Get request correlation id. */
export function getRequestCorrelationId({
	req,
}: {
	req: ParsedRequest;
}): CorrelationId | undefined {
	try {
		return req.responseMeta?.correlationId;
	} catch {
		return undefined;
	}
}

/** Handle is terminal command. */
function isTerminalCommand({ record }: { record: CommandRecord }): boolean {
	try {
		return record.state === "applied" || record.state === "failed";
	} catch {
		return false;
	}
}

/** Handle wrap router with correlation tracking. */
export function wrapRouterWithCorrelationTracking({
	router,
}: {
	router: Router;
}): void {
	try {
		const originalGet = router.get.bind(router);
		const originalPost = router.post.bind(router);
		const originalPatch = router.patch.bind(router);
		const originalDelete = router.delete.bind(router);

		const wrapHandler =
			({
				method,
				pathname,
				handler,
			}: {
				method: "GET" | "POST" | "PATCH" | "DELETE";
				pathname: string;
				handler: (req: ParsedRequest) => Promise<unknown>;
			}) =>
			async (req: ParsedRequest): Promise<unknown> => {
				if (shouldSkipCorrelationTracking({ pathname })) {
					return handler(req);
				}

				const started = claudeCorrelationTracker.startCommand({
					command: `${method} ${pathname}`,
					params: buildTrackedCommandParams({ req }),
				});
				setRequestCommandMeta({ req, record: started });

				const accepted = claudeCorrelationTracker.acceptCommand({
					correlationId: started.correlationId,
				});
				setRequestCommandMeta({ req, record: accepted });

				const applying = claudeCorrelationTracker.applyCommand({
					correlationId: started.correlationId,
					state: "applying",
				});
				setRequestCommandMeta({ req, record: applying });

				try {
					const result = await handler(req);
					const applied = claudeCorrelationTracker.applyCommand({
						correlationId: started.correlationId,
						state: "applied",
					});
					setRequestCommandMeta({ req, record: applied });
					return result;
				} catch (error) {
					const failed = claudeCorrelationTracker.failCommand({
						correlationId: started.correlationId,
						error:
							error instanceof Error
								? error.message
								: "Unknown command failure",
					});
					setRequestCommandMeta({ req, record: failed });
					throw error;
				}
			};

		router.get = (pathname, handler) =>
			originalGet(pathname, wrapHandler({ method: "GET", pathname, handler }));
		router.post = (pathname, handler) =>
			originalPost(
				pathname,
				wrapHandler({ method: "POST", pathname, handler })
			);
		router.patch = (pathname, handler) =>
			originalPatch(
				pathname,
				wrapHandler({ method: "PATCH", pathname, handler })
			);
		router.delete = (pathname, handler) =>
			originalDelete(
				pathname,
				wrapHandler({ method: "DELETE", pathname, handler })
			);
	} catch (error) {
		console.error(
			"[claude-meta-routes] Failed to wrap router with correlation tracking:",
			error
		);
	}
}

/** Register meta routes. */
export function registerMetaRoutes({
	router,
	getAppVersion,
	runDeepHealthChecks,
}: {
	router: Router;
	getAppVersion: () => string;
	runDeepHealthChecks?: () => Promise<DeepHealthReport>;
}): void {
	try {
		router.get("/api/claude/health", async (req) => {
			try {
				const deepRequested = shouldRunDeepHealth({
					value:
						typeof req.query.deep === "string" ? req.query.deep : undefined,
				});
				const appVersion = getAppVersion();
				const electronVersion = process.versions.electron ?? "unknown";
				const apiVersionInfo = getApiVersionInfo({
					appVersion,
					electronVersion,
				});
				const capabilities = getCapabilities().map((capability) => ({
					name: capability.name,
					version: capability.version,
					category: capability.category,
					deprecated: capability.deprecated === true,
				}));

				const response: Record<string, unknown> = {
					status: "ok",
					version: appVersion,
					uptime: process.uptime(),
					apiVersion: getApiVersion(),
					protocolVersion: apiVersionInfo.protocolVersion,
					appVersion: apiVersionInfo.appVersion,
					electronVersion: apiVersionInfo.electronVersion,
					capabilities,
				};

				if (deepRequested) {
					if (runDeepHealthChecks) {
						try {
							const report = await runDeepHealthChecks();
							response.deepStatus = deriveDeepHealthStatus({ report });
							response.deepChecks = report;
						} catch (error) {
							response.deepStatus = "degraded";
							response.deepError =
								error instanceof Error
									? error.message
									: "Deep health checks failed";
						}
					} else {
						response.deepStatus = "unsupported";
						response.deepError = "Deep health checks are not available";
					}
				}

				return response;
			} catch (error) {
				throw new HttpError(
					500,
					error instanceof Error
						? error.message
						: "Failed to build health response"
				);
			}
		});

		router.get("/api/claude/capabilities", async () => {
			try {
				const appVersion = getAppVersion();
				const electronVersion = process.versions.electron ?? "unknown";
				const manifest = getCapabilityManifest();
				return {
					...manifest,
					appVersion,
					electronVersion,
				};
			} catch (error) {
				throw new HttpError(
					500,
					error instanceof Error
						? error.message
						: "Failed to build capability manifest"
				);
			}
		});

		router.get("/api/claude/capabilities/:name", async (req) => {
			try {
				const minVersion =
					typeof req.query.minVersion === "string"
						? req.query.minVersion
						: undefined;
				return getCapabilitySupport({
					name: req.params.name,
					minVersion,
				});
			} catch (error) {
				throw new HttpError(
					500,
					error instanceof Error
						? error.message
						: "Failed to evaluate capability support"
				);
			}
		});

		router.get("/api/claude/commands/registry", async () => {
			try {
				const commands = getClaudeCommandRegistry();
				return {
					apiVersion: getApiVersion(),
					count: commands.length,
					commands,
				};
			} catch (error) {
				throw new HttpError(
					500,
					error instanceof Error
						? error.message
						: "Failed to build command registry"
				);
			}
		});

		router.get("/api/claude/commands", async (req) => {
			try {
				const rawLimit = req.query.limit;
				const parsedLimit =
					typeof rawLimit === "string"
						? Number.parseInt(rawLimit, 10)
						: undefined;
				const limit =
					typeof parsedLimit === "number" && Number.isFinite(parsedLimit)
						? parsedLimit
						: undefined;
				return {
					commands: claudeCorrelationTracker.listCommands({ limit }),
				};
			} catch (error) {
				throw new HttpError(
					500,
					error instanceof Error ? error.message : "Failed to list commands"
				);
			}
		});

		router.get("/api/claude/commands/:correlationId", async (req) => {
			try {
				const command = claudeCorrelationTracker.getCommand({
					correlationId: req.params.correlationId as CorrelationId,
				});
				if (!command) {
					throw new HttpError(
						404,
						`Command not found: ${req.params.correlationId}`
					);
				}
				return command;
			} catch (error) {
				if (error instanceof HttpError) throw error;
				throw new HttpError(
					500,
					error instanceof Error ? error.message : "Failed to get command"
				);
			}
		});

		router.get("/api/claude/commands/:correlationId/wait", async (req) => {
			try {
				const command = await claudeCorrelationTracker.waitForCommand({
					correlationId: req.params.correlationId as CorrelationId,
					timeoutMs: COMMAND_WAIT_TIMEOUT_MS,
				});
				if (!command) {
					throw new HttpError(
						404,
						`Command not found: ${req.params.correlationId}`
					);
				}
				return {
					command,
					timedOut: !isTerminalCommand({ record: command }),
				};
			} catch (error) {
				if (error instanceof HttpError) throw error;
				throw new HttpError(
					500,
					error instanceof Error ? error.message : "Failed to wait for command"
				);
			}
		});
	} catch (error) {
		console.error(
			"[claude-meta-routes] Failed to register meta routes:",
			error
		);
	}
}

module.exports = {
	getRequestCorrelationId,
	wrapRouterWithCorrelationTracking,
	registerMetaRoutes,
};
