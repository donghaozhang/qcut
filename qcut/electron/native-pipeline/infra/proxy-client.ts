/**
 * Client for the QCut license-server AI proxy.
 *
 * Routes API requests through the server so provider keys never touch
 * the user's machine. Falls back to direct calls when proxy is
 * unavailable or user has their own key (BYOK).
 *
 * @module electron/native-pipeline/infra/proxy-client
 */

import {
	type ProviderName,
	buildProviderUrl,
	extractOutputUrl,
	getAdaptivePollInterval,
} from "./api-provider-urls.js";

const DEFAULT_LICENSE_SERVER =
	"https://qcut-license-server.zdhpeter.workers.dev";

/** Resolves the license-server base URL from env or default. */
export function getLicenseServerUrl(): string {
	return process.env.QCUT_LICENSE_SERVER_URL?.trim() || DEFAULT_LICENSE_SERVER;
}

/** Session token provider — injected at startup from license-handler. */
let sessionTokenProvider: (() => Promise<string>) | null = null;

/** Registers the callback that supplies session tokens for proxy auth. */
export function setSessionTokenProvider(provider: () => Promise<string>): void {
	sessionTokenProvider = provider;
}

/** Returns the current session token, or empty string if unavailable. */
export async function getSessionToken(): Promise<string> {
	if (!sessionTokenProvider) return "";
	try {
		return await sessionTokenProvider();
	} catch {
		return "";
	}
}

/** Whether proxy mode is available (has session token, no override). */
export async function isProxyAvailable(): Promise<boolean> {
	const token = await getSessionToken();
	return token.length > 0;
}

export interface ProxyRequestOptions {
	provider: string;
	endpoint: string;
	method?: string;
	body?: unknown;
	credits?: {
		amount: number;
		modelKey: string;
		description: string;
	};
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface ProxyResponse {
	ok: boolean;
	status: number;
	data: unknown;
}

/** How many times to retry transient proxy failures (429 + 5xx). */
const PROXY_RETRIES = 3;

/**
 * Exponential backoff delay for a retry attempt. Mirrors the direct-mode
 * `fetchWithRetry` behavior in `api-caller.ts` so users see identical
 * resilience whether or not they're logged in:
 *   429 → 5s, 10s, 20s, 40s
 *   5xx → 1s, 2s, 3s (linear)
 */
function proxyBackoffMs(status: number, attempt: number): number {
	if (status === 429) return 5000 * 2 ** attempt;
	return 1000 * (attempt + 1);
}

/** Export for tests that want to assert backoff math without timing. */
export { proxyBackoffMs };

/**
 * Determines whether a proxy response should trigger a retry. 429 is
 * rate-limit, 5xx is server error — both transient. 4xx other than 429
 * are caller-side problems and should fail fast.
 */
function isProxyRetryable(status: number): boolean {
	return status === 429 || status >= 500;
}

/**
 * Forward a JSON request through the AI proxy.
 * POST /api/ai/proxy
 *
 * Retries 429 + 5xx with exponential backoff (up to `PROXY_RETRIES`)
 * so that logged-in users see the same resilience as direct-mode callers
 * (`fetchWithRetry` in `api-caller.ts`). Non-retryable errors and the
 * final failing attempt return their response to the caller unchanged.
 */
export async function proxyRequest(
	options: ProxyRequestOptions
): Promise<ProxyResponse> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();
	const body = JSON.stringify({
		provider: options.provider,
		endpoint: options.endpoint,
		method: options.method ?? "POST",
		body: options.body,
		credits: options.credits,
	});
	const perAttemptTimeoutMs = options.timeoutMs ?? 120_000;

	let lastResponse: ProxyResponse | null = null;
	for (let attempt = 0; attempt <= PROXY_RETRIES; attempt++) {
		// Each attempt gets its OWN fresh timeout. Reusing a single
		// `AbortSignal.timeout` across retries lets backoff delays push
		// later attempts past the deadline and fire an abort even when
		// the retry itself would succeed. User-supplied signals (e.g.
		// cancellation) apply to every attempt.
		const timeoutSignal = AbortSignal.timeout(perAttemptTimeoutMs);
		const signal = options.signal
			? AbortSignal.any([options.signal, timeoutSignal])
			: timeoutSignal;
		const response = await fetch(`${baseUrl}/api/ai/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body,
			signal,
		});

		const text = await response.text();
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}

		const result: ProxyResponse = {
			ok: response.ok,
			status: response.status,
			data,
		};

		if (result.ok || !isProxyRetryable(result.status)) return result;

		lastResponse = result;
		if (attempt === PROXY_RETRIES) break;
		const delay = proxyBackoffMs(result.status, attempt);
		console.error(
			`[proxy] ${result.status} on ${options.provider} call — retry ${attempt + 1}/${PROXY_RETRIES} in ${delay}ms`
		);
		await new Promise((r) => setTimeout(r, delay));
	}

	// Every retry exhausted — return the last response so the caller can
	// surface the original error to the user.
	return (
		lastResponse ?? {
			ok: false,
			status: 0,
			data: "proxy request failed with no response",
		}
	);
}

/**
 * Get a signed upload URL from the proxy.
 * POST /api/ai/upload-url
 */
export async function proxyUploadUrl({
	fileName,
	contentType,
	fileSize,
}: {
	fileName: string;
	contentType: string;
	fileSize?: number;
}): Promise<{ uploadUrl: string; fileUrl: string }> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const response = await fetch(`${baseUrl}/api/ai/upload-url`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			provider: "fal",
			fileName,
			contentType,
			fileSize,
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`Upload URL request failed (${response.status}): ${errorText}`
		);
	}

	return response.json() as Promise<{ uploadUrl: string; fileUrl: string }>;
}

/**
 * Poll async job status through the proxy.
 * GET /api/ai/status
 */
export async function proxyPollStatus({
	provider,
	endpoint,
	requestId,
	statusUrl,
	signal,
}: {
	provider: string;
	endpoint?: string;
	requestId: string;
	/** FAL-returned status_url — proxy uses this verbatim (preferred). */
	statusUrl?: string;
	signal?: AbortSignal;
}): Promise<{ status: number; data: unknown }> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const params = new URLSearchParams({ provider, requestId });
	if (endpoint) params.set("endpoint", endpoint);
	if (statusUrl) params.set("statusUrl", statusUrl);

	// Retry 429 + 5xx to match proxyRequest's resilience. Status polling
	// is the hot path — a single transient failure shouldn't abort an
	// in-progress render. Each attempt gets its own timeout signal for
	// the same reason as proxyRequest (backoff-push-past-deadline bug).
	let lastStatus = 0;
	let lastData: unknown = null;
	for (let attempt = 0; attempt <= PROXY_RETRIES; attempt++) {
		const timeoutSignal = AbortSignal.timeout(15_000);
		const attemptSignal = signal
			? AbortSignal.any([signal, timeoutSignal])
			: timeoutSignal;
		const response = await fetch(`${baseUrl}/api/ai/status?${params}`, {
			method: "GET",
			headers: { Authorization: `Bearer ${token}` },
			signal: attemptSignal,
		});

		const text = await response.text();
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
		lastStatus = response.status;
		lastData = data;
		if (response.ok || !isProxyRetryable(response.status)) {
			return { status: response.status, data };
		}
		if (attempt === PROXY_RETRIES) break;
		const delay = proxyBackoffMs(response.status, attempt);
		await new Promise((r) => setTimeout(r, delay));
	}

	return { status: lastStatus, data: lastData };
}
/**
 * Fetch completed async job result through the proxy.
 * GET /api/ai/result
 */
export async function proxyFetchResult({
	provider,
	endpoint,
	requestId,
	resultUrl,
	signal,
}: {
	provider: string;
	endpoint: string;
	requestId: string;
	/** FAL-returned response_url — proxy uses this verbatim (preferred). */
	resultUrl?: string;
	signal?: AbortSignal;
}): Promise<{ status: number; data: unknown }> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const params = new URLSearchParams({ provider, endpoint, requestId });
	if (resultUrl) params.set("resultUrl", resultUrl);

	const response = await fetch(`${baseUrl}/api/ai/result?${params}`, {
		method: "GET",
		headers: { Authorization: `Bearer ${token}` },
		signal: signal ?? AbortSignal.timeout(30_000),
	});

	const text = await response.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		data = text;
	}

	return { status: response.status, data };
}

// ── High-level proxy orchestration ──────────────────────────────────────────

export interface ProxyApiCallOptions {
	endpoint: string;
	payload: Record<string, unknown>;
	provider: ProviderName;
	async?: boolean;
	onProgress?: (percent: number, message: string) => void;
	timeoutMs?: number;
	signal?: AbortSignal;
	/** Credit info for server-side deduction. */
	credits?: { amount: number; modelKey: string; description: string };
}

export interface ApiCallResult {
	success: boolean;
	data?: unknown;
	outputUrl?: string;
	error?: string;
	duration: number;
	cost?: number;
}

/**
 * Proxy-mode implementation of callModelApi.
 * Routes through the license server so provider keys never leave the server.
 */
export async function callModelApiViaProxy(
	options: ProxyApiCallOptions,
	startTime: number
): Promise<ApiCallResult> {
	const { endpoint, payload, provider, signal, credits } = options;
	const providerUrl = buildProviderUrl(provider, endpoint);

	try {
		const res = await proxyRequest({
			provider,
			endpoint: providerUrl,
			method: "POST",
			body:
				provider === "gmi" && endpoint && endpoint !== "requests"
					? { model: endpoint, payload }
					: payload,
			credits,
			signal,
			timeoutMs: options.timeoutMs,
		});

		if (!res.ok) {
			return {
				success: false,
				error: `API error ${res.status}: ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = res.data as Record<string, unknown>;

		if (provider === "fal" && options.async !== false) {
			const requestId =
				typeof data.request_id === "string" ? data.request_id : "";
			const statusUrl =
				typeof data.status_url === "string" ? data.status_url : undefined;
			const resultUrl =
				typeof data.response_url === "string" ? data.response_url : undefined;
			if (requestId && data.status !== "COMPLETED") {
				return pollViaProxy({
					provider: "fal",
					endpoint,
					requestId,
					statusUrl,
					resultUrl,
					onProgress: options.onProgress,
					signal,
					startTime,
				});
			}
			if (requestId && data.status === "COMPLETED") {
				const result = await proxyFetchResult({
					provider: "fal",
					endpoint,
					requestId,
					resultUrl,
					signal,
				});
				const resultData = result.data as Record<string, unknown>;
				return {
					success: true,
					data: resultData,
					outputUrl: extractOutputUrl(resultData),
					duration: (Date.now() - startTime) / 1000,
				};
			}
		}

		if (provider === "gmi") {
			const requestId =
				typeof data.request_id === "string"
					? data.request_id
					: typeof data.id === "string"
						? data.id
						: "";
			if (requestId) {
				return pollViaProxy({
					provider: "gmi",
					endpoint,
					requestId,
					onProgress: options.onProgress,
					signal,
					startTime,
				});
			}
		}

		return {
			success: true,
			data,
			outputUrl: extractOutputUrl(data),
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: msg.includes("aborted") ? "Cancelled" : msg,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}

const MAX_POLL_ATTEMPTS = 360;

/** Poll an async job through the proxy until completion. */
async function pollViaProxy({
	provider,
	endpoint,
	requestId,
	statusUrl,
	resultUrl,
	onProgress,
	signal,
	startTime,
}: {
	provider: string;
	endpoint: string;
	requestId: string;
	/** FAL-returned status_url — forwarded to proxy for correct path. */
	statusUrl?: string;
	/** FAL-returned response_url — forwarded to proxy for correct path. */
	resultUrl?: string;
	onProgress?: (percent: number, message: string) => void;
	signal?: AbortSignal;
	startTime: number;
}): Promise<ApiCallResult> {
	let lastPercent = 10;

	for (
		let attempt = 0;
		attempt < MAX_POLL_ATTEMPTS && !signal?.aborted;
		attempt++
	) {
		const elapsed = Date.now() - startTime;
		const interval = getAdaptivePollInterval(elapsed);
		await new Promise((r) => setTimeout(r, interval));

		const poll = await proxyPollStatus({
			provider,
			endpoint: provider === "fal" ? endpoint : undefined,
			requestId,
			statusUrl,
			signal,
		});

		const status = poll.data as Record<string, unknown>;
		const statusStr = String(status?.status ?? "").toUpperCase();

		if (statusStr === "COMPLETED" || statusStr === "SUCCESS") {
			if (provider === "fal") {
				const result = await proxyFetchResult({
					provider: "fal",
					endpoint,
					requestId,
					resultUrl,
					signal,
				});
				const data = result.data as Record<string, unknown>;
				return {
					success: true,
					data,
					outputUrl: extractOutputUrl(data),
					duration: (Date.now() - startTime) / 1000,
				};
			}
			const outcome = status.outcome as Record<string, unknown> | undefined;
			return {
				success: true,
				data: status,
				outputUrl: extractOutputUrl(outcome ?? status),
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (statusStr === "FAILED" || statusStr === "CANCELLED") {
			return {
				success: false,
				error: `Job ${statusStr.toLowerCase()}: ${String(status?.error ?? "unknown error")}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (onProgress && lastPercent < 90) {
			lastPercent = Math.min(lastPercent + 5, 90);
			onProgress(lastPercent, `${provider} processing...`);
		}
	}

	return {
		success: false,
		error: signal?.aborted
			? "Cancelled"
			: `Polling timed out after ${MAX_POLL_ATTEMPTS} attempts`,
		duration: (Date.now() - startTime) / 1000,
	};
}
