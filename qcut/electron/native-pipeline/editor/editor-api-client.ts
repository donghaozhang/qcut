/**
 * Editor API Client
 *
 * Shared HTTP client for proxying CLI commands to a running
 * QCut editor instance via its REST API at http://127.0.0.1:8765.
 *
 * @module electron/native-pipeline/editor-api-client
 */

import type { CLIRunOptions } from "../cli/cli-runner/types.js";
import type {
	ApiVersionInfo,
	CapabilityManifest,
} from "../../types/claude-api.js";
import { getAdaptivePollInterval } from "../infra/api-caller.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorApiConfig {
	baseUrl: string;
	token?: string;
	timeout: number;
	/** Skip per-request capability warning checks (saves ~1-2s in E2E flows) */
	skipCapabilityCheck?: boolean;
}

/** EditorApiError class. */
export class EditorApiError extends Error {
	statusCode?: number;
	apiError?: string;

	constructor(message: string, statusCode?: number, apiError?: string) {
		super(message);
		this.name = "EditorApiError";
		this.statusCode = statusCode;
		this.apiError = apiError;
	}
}

interface ApiEnvelope<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	timestamp?: number;
}

interface JobStatus {
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	progress?: number;
	message?: string;
	result?: unknown;
	correlationId?: string;
	errorDetails?: {
		stage?: string;
		process?: string;
		action?: string;
		guard?: string;
		hint?: string;
		statusCode?: number;
		cause?: string;
		timestamp?: number;
	};
	[key: string]: unknown;
}

interface HealthResponse extends Partial<ApiVersionInfo> {
	status?: string;
	version?: string;
	uptime?: number;
}

interface EndpointCapabilityRequirement {
	name: string;
	minVersion?: string;
}

export interface PollOptions {
	interval?: number;
	timeout?: number;
	debugTrace?: boolean;
	onProgress?: (progress: {
		status: string;
		progress?: number;
		message?: string;
	}) => void;
	signal?: AbortSignal;
}

export interface SseEvent {
	id?: string;
	event?: string;
	data?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** EditorApiClient class. */
export class EditorApiClient {
	private config: EditorApiConfig;
	private capabilityManifestCache: CapabilityManifest | null | undefined;
	private capabilityNegotiationPromise: Promise<CapabilityManifest | null> | null =
		null;
	private warningCache = new Set<string>();

	constructor(config?: Partial<EditorApiConfig>) {
		this.config = {
			baseUrl: config?.baseUrl ?? "http://127.0.0.1:8765",
			token: config?.token,
			timeout: config?.timeout ?? 30_000,
			skipCapabilityCheck: config?.skipCapabilityCheck ?? false,
		};
	}

	/** Check if the QCut editor HTTP server is reachable. */
	async checkHealth(): Promise<boolean> {
		try {
			await this.get("/api/claude/health");
			try {
				await this.negotiateCapabilities();
			} catch {
				// Health should remain backward-compatible even if negotiation fails.
			}
			return true;
		} catch {
			return false;
		}
	}

	async negotiateCapabilities(): Promise<CapabilityManifest | null> {
		try {
			if (this.capabilityManifestCache !== undefined) {
				return this.capabilityManifestCache;
			}

			if (this.capabilityNegotiationPromise) {
				return await this.capabilityNegotiationPromise;
			}

			this.capabilityNegotiationPromise = (async () => {
				try {
					const manifest = await this.request<CapabilityManifest>(
						"GET",
						`${this.config.baseUrl}/api/claude/capabilities`
					);
					if (!this.isCapabilityManifest(manifest)) {
						this.capabilityManifestCache = null;
						this.warnOnce({
							key: "capabilities:invalid-manifest",
							message:
								"[QCut CLI] Capability negotiation skipped: invalid manifest response.",
						});
						return null;
					}
					this.capabilityManifestCache = manifest;
					return manifest;
				} catch (error) {
					this.capabilityManifestCache = null;
					if (
						error instanceof EditorApiError &&
						(error.statusCode === 404 || error.statusCode === 501)
					) {
						this.warnOnce({
							key: "capabilities:unsupported-endpoint",
							message:
								"[QCut CLI] Capability negotiation endpoint not available; continuing without feature checks.",
						});
						return null;
					}
					if (
						error instanceof EditorApiError &&
						error.message.includes("Cannot connect to QCut")
					) {
						return null;
					}
					this.warnOnce({
						key: "capabilities:request-failed",
						message: `[QCut CLI] Capability negotiation failed: ${
							error instanceof Error ? error.message : String(error)
						}`,
					});
					return null;
				} finally {
					this.capabilityNegotiationPromise = null;
				}
			})();

			return await this.capabilityNegotiationPromise;
		} catch {
			return null;
		}
	}

	async getApiVersion(): Promise<string | null> {
		try {
			const manifest = await this.negotiateCapabilities();
			if (manifest?.apiVersion) {
				return manifest.apiVersion;
			}
		} catch {
			// fall back to health response
		}

		try {
			const health = await this.get<HealthResponse>("/api/claude/health");
			if (typeof health.apiVersion === "string") return health.apiVersion;
			if (typeof health.version === "string") return health.version;
			return null;
		} catch {
			return null;
		}
	}

	async get<T = unknown>(
		path: string,
		query?: Record<string, string>
	): Promise<T> {
		await this.warnIfCapabilityLikelyUnsupported({
			method: "GET",
			path,
		});

		let url = `${this.config.baseUrl}${path}`;
		if (query) {
			const params = new URLSearchParams(query);
			url += `?${params.toString()}`;
		}
		return await this.request<T>("GET", url);
	}

	async post<T = unknown>(
		path: string,
		body?: unknown,
		options?: { timeout?: number }
	): Promise<T> {
		await this.warnIfCapabilityLikelyUnsupported({
			method: "POST",
			path,
		});
		return await this.request<T>(
			"POST",
			`${this.config.baseUrl}${path}`,
			body,
			options?.timeout
		);
	}

	/**
	 * POST with ndjson streaming — reads lines as they arrive, calling
	 * `onLine` for each, and returns the final "result" line parsed.
	 */
	async postStream<T = unknown>(
		path: string,
		body: unknown,
		onLine: (line: string) => void,
		options?: { timeout?: number }
	): Promise<T> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.config.token) {
			headers.Authorization = `Bearer ${this.config.token}`;
		}

		const url = `${this.config.baseUrl}${path}`;
		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(options?.timeout ?? 300_000),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
				throw new EditorApiError(
					`Cannot connect to QCut at ${this.config.baseUrl}`
				);
			}
			throw new EditorApiError(`HTTP request failed: ${msg}`);
		}

		if (!response.body) {
			throw new EditorApiError("No response body for streaming request");
		}

		let resultData: T | undefined;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				onLine(trimmed);
				try {
					const parsed = JSON.parse(trimmed);
					if (parsed.type === "result") {
						resultData = parsed as T;
					} else if (parsed.type === "error") {
						throw new EditorApiError(parsed.error ?? "Stream error");
					}
				} catch (e) {
					if (e instanceof EditorApiError) throw e;
				}
			}
		}

		// Process remaining buffer
		if (buffer.trim()) {
			onLine(buffer.trim());
			try {
				const parsed = JSON.parse(buffer.trim());
				if (parsed.type === "result") resultData = parsed as T;
				else if (parsed.type === "error")
					throw new EditorApiError(parsed.error ?? "Stream error");
			} catch (e) {
				if (e instanceof EditorApiError) throw e;
			}
		}

		if (resultData === undefined) {
			throw new EditorApiError("No result received from streaming response");
		}
		return resultData;
	}

	async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
		await this.warnIfCapabilityLikelyUnsupported({
			method: "PATCH",
			path,
		});
		return await this.request<T>(
			"PATCH",
			`${this.config.baseUrl}${path}`,
			body
		);
	}

	async delete<T = unknown>(path: string, body?: unknown): Promise<T> {
		await this.warnIfCapabilityLikelyUnsupported({
			method: "DELETE",
			path,
		});
		return await this.request<T>(
			"DELETE",
			`${this.config.baseUrl}${path}`,
			body
		);
	}

	async streamSse({
		path,
		query,
		onEvent,
		signal,
	}: {
		path: string;
		query?: Record<string, string>;
		onEvent: (event: SseEvent) => void;
		signal?: AbortSignal;
	}): Promise<void> {
		await this.warnIfCapabilityLikelyUnsupported({
			method: "GET",
			path,
		});

		let url = `${this.config.baseUrl}${path}`;
		if (query) {
			const params = new URLSearchParams(query);
			url += `?${params.toString()}`;
		}

		const headers: Record<string, string> = {};
		if (this.config.token) {
			headers.Authorization = `Bearer ${this.config.token}`;
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method: "GET",
				headers,
				signal,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
				throw new EditorApiError(
					`Cannot connect to QCut at ${this.config.baseUrl}`
				);
			}
			if (signal?.aborted) {
				return;
			}
			throw new EditorApiError(`HTTP request failed: ${msg}`);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new EditorApiError(
				text || `Request failed (HTTP ${response.status})`,
				response.status
			);
		}

		if (!response.body) {
			throw new EditorApiError("No response body for SSE request");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const chunks = buffer.split("\n\n");
				buffer = chunks.pop() ?? "";

				for (const chunk of chunks) {
					const parsed = this.parseSseChunk({ chunk });
					if (parsed) {
						onEvent(parsed);
					}
				}
			}

			buffer += decoder.decode();
			if (buffer.trim()) {
				const parsed = this.parseSseChunk({ chunk: buffer });
				if (parsed) {
					onEvent(parsed);
				}
			}
		} catch (err) {
			if (signal?.aborted) {
				return;
			}
			const msg = err instanceof Error ? err.message : String(err);
			throw new EditorApiError(`SSE stream failed: ${msg}`);
		}
	}

	/**
	 * Poll an async job endpoint until it reaches a terminal status.
	 * Returns the full job object on completion.
	 */
	async pollJob<T = unknown>(
		statusPath: string,
		options: PollOptions = {}
	): Promise<T> {
		const fixedInterval = options.interval;
		const timeout = options.timeout ?? 300_000;
		const start = Date.now();

		while (true) {
			if (options.signal?.aborted) {
				throw new EditorApiError("Polling cancelled");
			}

			const job = await this.get<JobStatus>(statusPath);

			if (options.onProgress) {
				options.onProgress({
					status: job.status,
					progress: job.progress,
					message: job.message,
				});
			}

			if (job.status === "completed") {
				return job as T;
			}
			if (job.status === "failed") {
				const context = this.buildJobFailureContext({
					job,
					debugTrace: options.debugTrace === true,
				});
				const message = context
					? `${job.message ?? "Job failed"} [${context}]`
					: (job.message ?? "Job failed");
				throw new EditorApiError(message, undefined, context ?? job.message);
			}
			if (job.status === "cancelled") {
				throw new EditorApiError("Job was cancelled");
			}

			if (Date.now() - start > timeout) {
				throw new EditorApiError(
					`Polling timed out after ${Math.round(timeout / 1000)}s`
				);
			}

			const interval =
				fixedInterval ?? getAdaptivePollInterval(Date.now() - start);
			await sleep(interval);
		}
	}

	// -----------------------------------------------------------------------
	// Internal
	// -----------------------------------------------------------------------

	private async warnIfCapabilityLikelyUnsupported({
		method,
		path,
	}: {
		method: string;
		path: string;
	}): Promise<void> {
		try {
			if (this.config.skipCapabilityCheck) {
				return;
			}
			if (this.shouldSkipCapabilityCheck({ path })) {
				return;
			}

			const requirement = this.resolveCapabilityRequirement({ method, path });
			if (!requirement) {
				return;
			}

			const manifest = await this.negotiateCapabilities();
			if (!manifest) {
				return;
			}

			const capability = manifest.capabilities.find(
				(entry) => entry?.name === requirement.name
			);
			if (!capability) {
				this.warnOnce({
					key: `capability:missing:${requirement.name}`,
					message: `[QCut CLI] Server does not advertise capability '${requirement.name}' for ${method} ${path}. Request may fail.`,
				});
				return;
			}

			if (
				requirement.minVersion &&
				this.compareSemver({
					left: capability.version,
					right: requirement.minVersion,
				}) < 0
			) {
				this.warnOnce({
					key: `capability:version:${requirement.name}:${requirement.minVersion}`,
					message: `[QCut CLI] Capability '${requirement.name}' is ${capability.version}; ${requirement.minVersion}+ recommended for ${method} ${path}.`,
				});
			}
		} catch {
			// Capability checks should never block requests.
		}
	}

	private buildJobFailureContext({
		job,
		debugTrace,
	}: {
		job: JobStatus;
		debugTrace: boolean;
	}): string | null {
		try {
			const details = job.errorDetails;
			const parts: string[] = [];
			if (details && typeof details === "object") {
				if (typeof details.stage === "string" && details.stage.trim()) {
					parts.push(`stage=${details.stage.trim()}`);
				}
				if (typeof details.process === "string" && details.process.trim()) {
					parts.push(`process=${details.process.trim()}`);
				}
				if (typeof details.action === "string" && details.action.trim()) {
					parts.push(`action=${details.action.trim()}`);
				}
				if (typeof details.guard === "string" && details.guard.trim()) {
					parts.push(`guard=${details.guard.trim()}`);
				}
				if (typeof details.hint === "string" && details.hint.trim()) {
					parts.push(`hint=${details.hint.trim()}`);
				}
				if (debugTrace) {
					if (typeof details.statusCode === "number") {
						parts.push(`statusCode=${details.statusCode}`);
					}
					if (typeof details.cause === "string" && details.cause.trim()) {
						parts.push(`cause=${details.cause.trim()}`);
					}
					if (
						typeof details.timestamp === "number" &&
						Number.isFinite(details.timestamp)
					) {
						parts.push(`errorTs=${details.timestamp}`);
					}
				}
			}
			if (typeof job.correlationId === "string" && job.correlationId.trim()) {
				parts.push(`correlationId=${job.correlationId.trim()}`);
			}
			return parts.length > 0 ? parts.join(", ") : null;
		} catch {
			return null;
		}
	}

	private shouldSkipCapabilityCheck({ path }: { path: string }): boolean {
		try {
			return (
				path.startsWith("/api/claude/health") ||
				path.startsWith("/api/claude/capabilities")
			);
		} catch {
			return true;
		}
	}

	private resolveCapabilityRequirement({
		method,
		path,
	}: {
		method: string;
		path: string;
	}): EndpointCapabilityRequirement | null {
		try {
			if (path === "/api/claude/commands/registry") {
				return { name: "state.commandRegistry" };
			}
			if (path.startsWith("/api/claude/navigator/")) {
				return { name: "project.navigator" };
			}
			if (path.startsWith("/api/claude/screen-recording/")) {
				return { name: "media.screenRecording" };
			}
			if (path.startsWith("/api/claude/screenshot/")) {
				return { name: "media.screenshot" };
			}
			if (path.startsWith("/api/claude/ui/")) {
				return { name: "state.ui.panelSwitch" };
			}
			if (path.startsWith("/api/claude/moyin/")) {
				return { name: "state.moyin.pipeline" };
			}
			if (path.startsWith("/api/claude/mcp/")) {
				return { name: "events.mcpPreview" };
			}
			if (path.startsWith("/api/claude/diagnostics/")) {
				return { name: "analysis.diagnostics" };
			}
			if (
				path === "/api/claude/analyze/models" ||
				path === "/api/claude/generate/models"
			) {
				return { name: "analysis.models" };
			}
			if (path.startsWith("/api/claude/transcribe/")) {
				return { name: "analysis.transcription" };
			}
			if (path.startsWith("/api/claude/generate/")) {
				return { name: "analysis.generate" };
			}
			if (path.startsWith("/api/claude/analyze/")) {
				if (path.includes("/suggest-cuts")) {
					return { name: "analysis.suggestCuts" };
				}
				return { name: "analysis.video" };
			}
			if (
				path === "/api/claude/export/presets" ||
				path.includes("/recommend/")
			) {
				return { name: "export.presets" };
			}
			if (path.startsWith("/api/claude/export/")) {
				return { name: "export.jobs" };
			}
			if (path === "/api/claude/project/create") {
				return { name: "project.crud" };
			}
			if (
				path === "/api/claude/project/delete" ||
				path === "/api/claude/project/rename" ||
				path === "/api/claude/project/duplicate"
			) {
				return { name: "project.crud" };
			}
			if (path.includes("/project/") && path.endsWith("/settings")) {
				return { name: "project.settings" };
			}
			if (path.includes("/project/") && path.endsWith("/stats")) {
				return { name: "project.stats" };
			}
			if (
				path.includes("/project/") &&
				(path.endsWith("/summary") || path.endsWith("/report"))
			) {
				return { name: "project.summary" };
			}
			if (path.includes("/media/") && path.endsWith("/import-from-url")) {
				return { name: "media.import.url" };
			}
			if (path.includes("/media/") && path.endsWith("/batch-import")) {
				return { name: "media.import.batch" };
			}
			if (path.includes("/media/") && path.endsWith("/import")) {
				return { name: "media.import.local" };
			}
			if (path.includes("/media/") && path.endsWith("/extract-frame")) {
				return { name: "media.extractFrame" };
			}
			if (path.startsWith("/api/claude/media/")) {
				return { name: "media.library" };
			}
			if (path.includes("/timeline/") && path.includes("/auto-edit")) {
				return { name: "timeline.autoEdit" };
			}
			if (path.includes("/timeline/") && path.endsWith("/cuts")) {
				return { name: "timeline.cuts" };
			}
			if (path.includes("/timeline/") && path.endsWith("/range")) {
				return { name: "timeline.cuts" };
			}
			if (path.includes("/timeline/") && path.endsWith("/selection")) {
				return { name: "timeline.selection" };
			}
			if (path.includes("/timeline/") && path.endsWith("/arrange")) {
				return { name: "timeline.arrange" };
			}
			if (path.includes("/timeline/") && path.includes("/elements/batch")) {
				return { name: "timeline.batch" };
			}
			if (path.includes("/timeline/") && path.includes("/elements/")) {
				return { name: "timeline.elements" };
			}
			if (path.includes("/timeline/") && path.endsWith("/import")) {
				return { name: "timeline.import" };
			}
			if (path.startsWith("/api/claude/timeline/") && method === "GET") {
				return { name: "timeline.read" };
			}
			if (path.startsWith("/api/claude/timeline/")) {
				return { name: "timeline.elements" };
			}
			return null;
		} catch {
			return null;
		}
	}

	private isCapabilityManifest(value: unknown): value is CapabilityManifest {
		try {
			if (!value || typeof value !== "object") {
				return false;
			}
			const obj = value as {
				apiVersion?: unknown;
				protocolVersion?: unknown;
				capabilities?: unknown;
			};
			return (
				typeof obj.apiVersion === "string" &&
				typeof obj.protocolVersion === "string" &&
				Array.isArray(obj.capabilities)
			);
		} catch {
			return false;
		}
	}

	private compareSemver({
		left,
		right,
	}: {
		left: string;
		right: string;
	}): number {
		try {
			const leftParts = this.parseSemver({ value: left });
			const rightParts = this.parseSemver({ value: right });
			if (!leftParts || !rightParts) {
				return left.localeCompare(right, undefined, { numeric: true });
			}
			for (let i = 0; i < 3; i++) {
				if (leftParts[i] !== rightParts[i]) {
					return leftParts[i] - rightParts[i];
				}
			}
			return 0;
		} catch {
			return 0;
		}
	}

	private parseSemver({
		value,
	}: {
		value: string;
	}): [number, number, number] | null {
		try {
			const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
			if (!match) {
				return null;
			}
			return [
				Number.parseInt(match[1], 10),
				Number.parseInt(match[2], 10),
				Number.parseInt(match[3], 10),
			];
		} catch {
			return null;
		}
	}

	private warnOnce({ key, message }: { key: string; message: string }): void {
		try {
			if (this.warningCache.has(key)) {
				return;
			}
			this.warningCache.add(key);
			console.warn(message);
		} catch {
			// ignore logging errors
		}
	}

	private async request<T>(
		method: string,
		url: string,
		body?: unknown,
		timeoutOverride?: number
	): Promise<T> {
		const headers: Record<string, string> = {};
		if (this.config.token) {
			headers.Authorization = `Bearer ${this.config.token}`;
		}

		const init: RequestInit = {
			method,
			headers,
			signal: AbortSignal.timeout(timeoutOverride ?? this.config.timeout),
		};

		if (body !== undefined) {
			headers["Content-Type"] = "application/json";
			init.body = JSON.stringify(body);
		}

		let response: Response;
		try {
			response = await fetch(url, init);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
				throw new EditorApiError(
					`Cannot connect to QCut at ${this.config.baseUrl}`
				);
			}
			throw new EditorApiError(`HTTP request failed: ${msg}`);
		}

		let envelope: ApiEnvelope<T>;
		try {
			envelope = (await response.json()) as ApiEnvelope<T>;
		} catch {
			throw new EditorApiError(
				`Invalid JSON response (HTTP ${response.status})`,
				response.status
			);
		}

		if (!envelope.success) {
			throw new EditorApiError(
				envelope.error ?? `Request failed (HTTP ${response.status})`,
				response.status,
				envelope.error
			);
		}

		return envelope.data as T;
	}

	private parseSseChunk({
		chunk,
	}: {
		chunk: string;
	}): SseEvent | null {
		try {
			const trimmed = chunk.trim();
			if (!trimmed) {
				return null;
			}

			const event: SseEvent = {};
			const dataLines: string[] = [];
			for (const rawLine of trimmed.split("\n")) {
				const line = rawLine.trimEnd();
				if (!line || line.startsWith(":")) {
					continue;
				}
				if (line.startsWith("id:")) {
					event.id = line.slice(3).trim();
					continue;
				}
				if (line.startsWith("event:")) {
					event.event = line.slice(6).trim();
					continue;
				}
				if (line.startsWith("data:")) {
					dataLines.push(line.slice(5).trim());
				}
			}
			if (dataLines.length > 0) {
				event.data = dataLines.join("\n");
			}
			if (!event.id && !event.event && !event.data) {
				return null;
			}
			return event;
		} catch {
			return null;
		}
	}
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an EditorApiClient from CLI options + environment variables. */
export function createEditorClient(options: CLIRunOptions): EditorApiClient {
	const host = options.host ?? process.env.QCUT_API_HOST ?? "127.0.0.1";
	const port = options.port ?? process.env.QCUT_API_PORT ?? "8765";
	const token = options.token ?? process.env.QCUT_API_TOKEN ?? undefined;
	const timeout =
		options.timeout !== undefined ? Number(options.timeout) * 1000 : 30_000;

	return new EditorApiClient({
		baseUrl: `http://${host}:${port}`,
		token: token as string | undefined,
		timeout,
		skipCapabilityCheck: options.noCapabilityCheck ?? false,
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Handle sleep. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
