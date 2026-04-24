/**
 * Core FAL API Request Utilities
 *
 * Provides a consistent interface for making FAL AI API requests.
 * Centralizes authentication, error handling, and response parsing.
 */

import { platform } from "@qcut/platform-core";
import { handleAIServiceError } from "@/lib/debug/error-handler";
import { estimateCreditCost } from "@/lib/credit-costs";
import { LICENSE_SERVER_URL, getSessionToken } from "./license-relay";

// Direct FAL AI integration - no backend needed
export const FAL_API_BASE = "https://fal.run";
export const FAL_QUEUE_BASE = "https://queue.fal.run";

/**
 * Retrieves the current FAL API key from environment at call time.
 *
 * WHY: Tests stub environment variables after module load; reading lazily keeps
 * stubs in sync instead of freezing the value during import.
 *
 * @deprecated Use getFalApiKeyAsync() for production code to support Electron storage
 */
export function getFalApiKey(): string | undefined {
	return import.meta.env.VITE_FAL_API_KEY;
}

/**
 * Cache for the Electron-stored API key to avoid repeated async calls.
 * Cleared on app reload.
 */
let cachedElectronApiKey: string | null = null;
let electronKeyFetchPromise: Promise<string | null> | null = null;

/**
 * Retrieve the FAL API key from the environment or Electron secure storage.
 *
 * Checks the VITE_FAL_API_KEY environment variable first; if absent, attempts to read
 * the key from Electron secure storage via platform().apiKeys and caches that result
 * for the session to avoid repeated storage reads.
 *
 * @returns The FAL API key if configured, or `undefined` if not found.
 */
export async function getFalApiKeyAsync(): Promise<string | undefined> {
	// First try environment variable (instant, no async needed)
	const envApiKey = import.meta.env.VITE_FAL_API_KEY;
	if (envApiKey) {
		return envApiKey;
	}

	// Return cached Electron key if available
	if (cachedElectronApiKey) {
		return cachedElectronApiKey;
	}

	// Check platform storage (async)
	let electronApiKeys: ReturnType<typeof platform>["apiKeys"] | undefined;
	try {
		electronApiKeys = platform().apiKeys;
	} catch {
		// Platform not initialized yet — skip
	}
	if (electronApiKeys) {
		// Deduplicate concurrent calls
		if (!electronKeyFetchPromise) {
			electronKeyFetchPromise = (async () => {
				try {
					const keys = await electronApiKeys.get();
					if (keys?.falApiKey) {
						cachedElectronApiKey = keys.falApiKey;
						return keys.falApiKey;
					}
				} catch (error) {
					handleAIServiceError(error, "Load FAL API key", {
						operation: "electronKeyFetch",
					});
				}
				return null;
			})();
		}

		const key = await electronKeyFetchPromise;
		electronKeyFetchPromise = null; // Reset for next call
		if (key) {
			return key;
		}
	}

	return;
}

/**
 * Clears the cached Electron API key. Useful for testing or when user updates their key.
 */
export function clearFalApiKeyCache(): void {
	cachedElectronApiKey = null;
	electronKeyFetchPromise = null;
}

/**
 * Generates a unique job ID for tracking video generation requests.
 *
 * Format: job_{random_string}_{timestamp}
 * Example: job_abc123xyz_1699876543210
 */
export function generateJobId(): string {
	return `job_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
}

/**
 * Options for FAL API requests
 */
export interface FalRequestOptions {
	/** Request timeout in milliseconds */
	timeout?: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
	/** Enable queue mode for long-running jobs */
	queueMode?: boolean;
	/**
	 * Renderer-side model key (e.g. `kling-v2.6-pro`). Required by the
	 * relay-mode credit deduction path; direct-call BYOK users ignore it.
	 * Distinct from the FAL endpoint string (`fal-ai/kling/v2.6/text-to-video`).
	 */
	modelKey?: string;
	/** Duration in seconds — used to compute per-second credit costs. */
	durationSeconds?: number;
	/**
	 * When true and a QCut session token is available, route through the
	 * license-server proxy first and only fall back to the local FAL key
	 * on proxy failure. Mirrors the CLI `api-caller` proxy-first semantics,
	 * giving logged-in users a working path when their local key lacks
	 * access to a specific model (e.g. FAL's OpenAI passthrough models).
	 * Default false → legacy "proxy only if no local key" behavior.
	 */
	proxyFirst?: boolean;
}

/**
 * Combine the caller's AbortSignal with an optional timeout into a single signal.
 * Uses AbortSignal.any (widely available in modern Chromium/Node 20+) when both
 * are present, so cancellation *and* timeout both trigger abort.
 */
function buildAbortSignal(
	options: FalRequestOptions | undefined
): AbortSignal | undefined {
	const signals: AbortSignal[] = [];
	if (options?.signal) signals.push(options.signal);
	if (options?.timeout && options.timeout > 0) {
		signals.push(AbortSignal.timeout(options.timeout));
	}
	if (signals.length === 0) return undefined;
	if (signals.length === 1) return signals[0];
	return AbortSignal.any(signals);
}

/**
 * Peek at a proxy response body (via clone, so the original stream is untouched)
 * and decide whether the caller can treat it as success. Returns false when the
 * proxy returned a 200 FastAPI-style `{ detail: [...] }` error envelope with no
 * success marker like `request_id` — in which case the caller should fall back.
 */
async function isProxyResponseUsable(response: Response): Promise<boolean> {
	if (!response.ok) return false;
	let body: unknown;
	try {
		body = await response.clone().json();
	} catch {
		return true; // Non-JSON 200 — pass through; caller will handle it.
	}
	if (!body || typeof body !== "object") return true;
	const obj = body as Record<string, unknown>;
	if (
		Array.isArray(obj.detail) &&
		!obj.request_id &&
		!obj.images &&
		!obj.data
	) {
		return false;
	}
	return true;
}

async function submitFalViaProxy(
	targetUrl: string,
	payload: Record<string, unknown>,
	sessionToken: string,
	options: FalRequestOptions | undefined
): Promise<Response> {
	const proxyBody: Record<string, unknown> = {
		provider: "fal",
		endpoint: targetUrl,
		method: "POST",
		body: payload,
	};
	if (options?.modelKey) {
		const amount = estimateCreditCost(options.modelKey, {
			durationSeconds: options.durationSeconds,
		});
		if (Number.isFinite(amount) && amount > 0) {
			proxyBody.credits = {
				amount,
				modelKey: options.modelKey,
				description: `FAL — ${options.modelKey}${
					options.durationSeconds ? ` (${options.durationSeconds}s)` : ""
				}`,
			};
		}
	}
	return fetch(`${LICENSE_SERVER_URL}/api/ai/proxy`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionToken}`,
		},
		body: JSON.stringify(proxyBody),
		signal: buildAbortSignal(options),
	});
}

/**
 * Makes an authenticated request to FAL AI API.
 *
 * Default behavior: use the local FAL key when present, otherwise route
 * through the license-server proxy for signed-in users.
 *
 * With `proxyFirst: true`: try the license-server proxy first even when a
 * local key is present, and fall back to the local key only on proxy failure.
 * This unblocks users whose local key lacks access to a specific model.
 */
export async function makeFalRequest(
	endpoint: string,
	payload: Record<string, unknown>,
	options?: FalRequestOptions
): Promise<Response> {
	const apiKey = await getFalApiKeyAsync();
	const base = options?.queueMode ? FAL_QUEUE_BASE : FAL_API_BASE;
	const targetUrl = endpoint.startsWith("https://")
		? endpoint
		: `${base}/${endpoint}`;

	const sessionToken =
		options?.proxyFirst || !apiKey ? await getSessionToken() : "";

	if (sessionToken && (options?.proxyFirst || !apiKey)) {
		let proxyResponse: Response | null = null;
		try {
			proxyResponse = await submitFalViaProxy(
				targetUrl,
				payload,
				sessionToken,
				options
			);
		} catch (error) {
			if (!apiKey) throw error;
			console.warn(
				"[makeFalRequest] proxy threw, falling back to local FAL key",
				error
			);
		}
		if (proxyResponse) {
			// The proxy can return HTTP 200 with a FastAPI-style `{ detail: [...] }`
			// error envelope when the upstream provider fails. Without peeking at the
			// body we'd treat that as success and skip the local-key fallback, leaving
			// the caller to parse an error payload as a normal FAL response.
			const usable = apiKey ? await isProxyResponseUsable(proxyResponse) : true;
			if (usable) {
				return proxyResponse;
			}
			console.warn(
				`[makeFalRequest] proxy returned ${proxyResponse.status} (or 200 error envelope), falling back to local FAL key`
			);
		}
	}

	if (!apiKey) {
		const error = new Error(
			"FAL API key not configured. Please sign in to your QCut account or set VITE_FAL_API_KEY."
		);
		handleAIServiceError(error, "FAL API Request", {
			configRequired: "VITE_FAL_API_KEY",
			operation: "checkApiKey",
		});
		throw error;
	}

	const headers: Record<string, string> = {
		Authorization: `Key ${apiKey}`,
		"Content-Type": "application/json",
	};
	if (options?.queueMode) {
		headers["X-Fal-Queue"] = "true";
	}

	return fetch(targetUrl, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
		signal: buildAbortSignal(options),
	});
}

// ---------------------------------------------------------------------------
// Queue-mode submit + poll + fetch result
// ---------------------------------------------------------------------------

/** Maximum wall-clock time a queue job may take before we give up polling. */
const QUEUE_MAX_WAIT_MS = 15 * 60 * 1000; // 15 min — well over any FAL image-gen ceiling
/** Interval between status polls. 3 s keeps UI feeling live without hammering. */
const QUEUE_POLL_INTERVAL_MS = 3_000;

interface QueueSubmitEnvelope {
	request_id?: string;
	status_url?: string;
	response_url?: string;
	/** Some FAL endpoints return the images inline when the job is small enough. */
	images?: unknown;
	image?: unknown;
	data?: unknown;
	detail?: unknown;
}

interface QueueStatusEnvelope {
	status?: string;
	queue_position?: number;
	error?: string;
}

/** Rewrite a sync FAL URL (`fal.run/...`) into its queue equivalent (`queue.fal.run/...`). */
function toQueueSubmitUrl(syncEndpoint: string): string {
	if (syncEndpoint.startsWith(FAL_QUEUE_BASE)) return syncEndpoint;
	if (syncEndpoint.startsWith(FAL_API_BASE)) {
		return FAL_QUEUE_BASE + syncEndpoint.slice(FAL_API_BASE.length);
	}
	// Non-FAL endpoint — caller shouldn't have asked for queue mode. Fall back
	// to the given URL; the submit will fail fast if it's not a queue URL.
	return syncEndpoint;
}

/**
 * Pull the FAL endpoint path (e.g. `openai/gpt-image-2`) out of a full queue
 * URL. Needed so `/api/ai/status` and `/api/ai/result` can construct the
 * correct upstream URL when `statusUrl` / `resultUrl` weren't forwarded.
 */
function extractEndpointPath(queueUrl: string): string {
	if (!queueUrl.startsWith(FAL_QUEUE_BASE + "/")) return "";
	return queueUrl.slice(FAL_QUEUE_BASE.length + 1).replace(/\/+$/, "");
}

function buildProxyStatusUrl(params: {
	requestId: string;
	endpointPath: string;
	statusUrlHint?: string;
}): string {
	const q = new URLSearchParams({
		provider: "fal",
		endpoint: params.endpointPath,
		requestId: params.requestId,
	});
	if (params.statusUrlHint) q.set("statusUrl", params.statusUrlHint);
	return `${LICENSE_SERVER_URL}/api/ai/status?${q.toString()}`;
}

function buildProxyResultUrl(params: {
	requestId: string;
	endpointPath: string;
	resultUrlHint?: string;
}): string {
	const q = new URLSearchParams({
		provider: "fal",
		endpoint: params.endpointPath,
		requestId: params.requestId,
	});
	if (params.resultUrlHint) q.set("resultUrl", params.resultUrlHint);
	return `${LICENSE_SERVER_URL}/api/ai/result?${q.toString()}`;
}

function sleepMs(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submit a FAL job via the queue, poll through the license-server proxy until
 * it completes, and return a `Response` shaped identically to the synchronous
 * `makeFalRequest` return value — so existing callers that parse
 * `{ images: [...] }` don't have to care that a poll loop ran.
 *
 * Usage is confined to models flagged with `useQueue: true` in the
 * `TEXT2IMAGE_MODELS` registry. For signed-in users this routes entirely
 * through `/api/ai/proxy`, `/api/ai/status`, and `/api/ai/result` — each call
 * completes in a few seconds, sidestepping Cloudflare's ~100 s edge timeout
 * that sync calls to slow models (GPT-Image-2, Imagen4 Ultra) hit.
 *
 * BYOK (no session token) path falls back to direct `queue.fal.run` calls
 * using the local key. Behaviour matches the proxy path end-to-end.
 */
export async function makeFalRequestQueued(
	endpoint: string,
	payload: Record<string, unknown>,
	options?: FalRequestOptions
): Promise<Response> {
	const syncUrl = endpoint.startsWith("https://")
		? endpoint
		: `${FAL_API_BASE}/${endpoint}`;
	const queueSubmitUrl = toQueueSubmitUrl(syncUrl);
	const endpointPath = extractEndpointPath(queueSubmitUrl);

	// Step 1 — submit. Use `makeFalRequest` so the proxy-first + BYOK fallback
	// semantics carry over for free. The submit itself is cheap (<3 s typical).
	const submitResponse = await makeFalRequest(queueSubmitUrl, payload, options);
	if (!submitResponse.ok) {
		return submitResponse; // Caller handles error envelope uniformly.
	}

	let submitBody: QueueSubmitEnvelope;
	try {
		submitBody = (await submitResponse.clone().json()) as QueueSubmitEnvelope;
	} catch {
		return submitResponse;
	}

	// If FAL returned the result inline (small jobs sometimes skip the queue),
	// pass it through unchanged.
	if (!submitBody.request_id && (submitBody.images || submitBody.image)) {
		return submitResponse;
	}

	const requestId = submitBody.request_id;
	if (!requestId) {
		// Unexpected submit shape — return so callers see the raw payload.
		return submitResponse;
	}

	// Determine transport: proxy if we have a session token, direct otherwise.
	const sessionToken = await getSessionToken();
	const apiKey = await getFalApiKeyAsync();
	const useProxy = Boolean(sessionToken && (options?.proxyFirst || !apiKey));

	const abort = buildAbortSignal(options);
	const deadline = Date.now() + QUEUE_MAX_WAIT_MS;

	// Step 2 — poll status.
	while (Date.now() < deadline) {
		if (abort?.aborted) {
			throw new DOMException("FAL queue poll aborted", "AbortError");
		}
		await sleepMs(QUEUE_POLL_INTERVAL_MS);

		const statusResponse = useProxy
			? await fetch(
					buildProxyStatusUrl({
						requestId,
						endpointPath,
						statusUrlHint: submitBody.status_url,
					}),
					{
						headers: { Authorization: `Bearer ${sessionToken}` },
						signal: abort,
					}
				)
			: await fetch(
					submitBody.status_url ??
						`${queueSubmitUrl}/requests/${requestId}/status`,
					{
						headers: apiKey ? { Authorization: `Key ${apiKey}` } : {},
						signal: abort,
					}
				);

		if (!statusResponse.ok) {
			// Transient status error — one retry's worth before surfacing.
			if (statusResponse.status >= 500) continue;
			return statusResponse;
		}

		let status: QueueStatusEnvelope;
		try {
			status = (await statusResponse.json()) as QueueStatusEnvelope;
		} catch {
			continue;
		}

		if (status.status === "COMPLETED") break;
		if (status.status === "FAILED") {
			// Fabricate a 502 Response so the call site's error-handling path
			// triggers (same as a sync-mode upstream failure).
			return new Response(
				JSON.stringify({ detail: status.error ?? "FAL queue job failed" }),
				{ status: 502, headers: { "Content-Type": "application/json" } }
			);
		}
	}

	if (Date.now() >= deadline) {
		return new Response(
			JSON.stringify({
				detail: `FAL queue job ${requestId} exceeded ${QUEUE_MAX_WAIT_MS / 1000}s`,
			}),
			{ status: 504, headers: { "Content-Type": "application/json" } }
		);
	}

	// Step 3 — fetch the completed result.
	return useProxy
		? fetch(
				buildProxyResultUrl({
					requestId,
					endpointPath,
					resultUrlHint: submitBody.response_url,
				}),
				{
					headers: { Authorization: `Bearer ${sessionToken}` },
					signal: abort,
				}
			)
		: fetch(
				submitBody.response_url ?? `${queueSubmitUrl}/requests/${requestId}`,
				{
					headers: apiKey ? { Authorization: `Key ${apiKey}` } : {},
					signal: abort,
				}
			);
}

/**
 * Handles FAL API response and converts errors to user-friendly messages.
 *
 * @param response - Fetch Response object
 * @param operation - Name of the operation for error context
 * @throws Error with appropriate message for different error codes
 */
export async function handleFalResponse(
	response: Response,
	operation: string
): Promise<void> {
	if (response.ok) return;

	const errorData = await response.json().catch(() => ({}));

	if (response.status === 401) {
		throw new Error(
			"Invalid FAL.ai API key. Please check your API key configuration."
		);
	}

	if (response.status === 429) {
		throw new Error(
			"Rate limit exceeded. Please wait a moment before trying again."
		);
	}

	if (response.status === 413) {
		throw new Error(
			"Image file too large. Maximum size is 7MB for this model."
		);
	}

	throw new Error(
		`FAL API error: ${(errorData as Record<string, unknown>).detail || response.statusText}`
	);
}

/**
 * Formats error messages from FAL queue responses.
 *
 * @param errorData - Error data from FAL API
 * @returns User-friendly error message
 */
export function formatQueueError(errorData: unknown): string {
	if (typeof errorData === "object" && errorData !== null) {
		const data = errorData as Record<string, unknown>;
		if (data.error && typeof data.error === "string") {
			return data.error;
		}
		if (data.detail && typeof data.detail === "string") {
			return data.detail;
		}
		if (data.message && typeof data.message === "string") {
			return data.message;
		}
	}
	return "An unknown error occurred during video generation";
}

/**
 * Upload URL for FAL.ai storage.
 */
export const FAL_UPLOAD_URL = "https://fal.run/upload";

/**
 * Parses FAL API error responses into user-friendly messages.
 *
 * Handles multiple FAL error response formats:
 * - `{ error: string }` - Simple error message
 * - `{ error: object }` - Structured error object
 * - `{ detail: string }` - FastAPI-style string detail
 * - `{ detail: Array<{ msg: string }> }` - FastAPI validation errors
 * - `{ message: string }` - Generic message format
 *
 * @param errorData - Raw error data from FAL API response
 * @param fallbackStatus - Optional HTTP status code to include in fallback message
 * @returns User-friendly error message string
 *
 * @example
 * const errorData = await response.json().catch(() => ({}));
 * const message = parseFalErrorResponse(errorData, response.status);
 */
export function parseFalErrorResponse(
	errorData: unknown,
	fallbackStatus?: number
): string {
	if (typeof errorData !== "object" || errorData === null) {
		return fallbackStatus
			? `API request failed: ${fallbackStatus}`
			: "An unknown error occurred";
	}

	const data = errorData as Record<string, unknown>;

	// Handle { error: string | object }
	if (data.error !== undefined) {
		if (typeof data.error === "string") {
			return data.error;
		}
		if (typeof data.error === "object" && data.error !== null) {
			return JSON.stringify(data.error, null, 2);
		}
	}

	// Handle { detail: string | Array<{ msg: string }> }
	if (data.detail !== undefined) {
		if (typeof data.detail === "string") {
			return data.detail;
		}
		if (Array.isArray(data.detail)) {
			return data.detail
				.map((d: unknown) => {
					if (typeof d === "object" && d !== null && "msg" in d) {
						return (d as { msg: string }).msg;
					}
					return JSON.stringify(d);
				})
				.join(", ");
		}
		if (typeof data.detail === "object") {
			return JSON.stringify(data.detail, null, 2);
		}
	}

	// Handle { message: string }
	if (typeof data.message === "string") {
		return data.message;
	}

	return fallbackStatus
		? `API request failed: ${fallbackStatus}`
		: "An unknown error occurred";
}

/**
 * Sleep utility for polling intervals.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
