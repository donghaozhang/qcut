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

/**
 * Forward a JSON request through the AI proxy.
 * POST /api/ai/proxy
 */
export async function proxyRequest(
	options: ProxyRequestOptions
): Promise<ProxyResponse> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const response = await fetch(`${baseUrl}/api/ai/proxy`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			provider: options.provider,
			endpoint: options.endpoint,
			method: options.method ?? "POST",
			body: options.body,
			credits: options.credits,
		}),
		signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 120_000),
	});

	const text = await response.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		data = text;
	}

	return { ok: response.ok, status: response.status, data };
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

	return response.json();
}

/**
 * Poll async job status through the proxy.
 * GET /api/ai/status
 */
export async function proxyPollStatus({
	provider,
	endpoint,
	requestId,
	signal,
}: {
	provider: string;
	endpoint?: string;
	requestId: string;
	signal?: AbortSignal;
}): Promise<{ status: number; data: unknown }> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const params = new URLSearchParams({ provider, requestId });
	if (endpoint) params.set("endpoint", endpoint);

	const response = await fetch(`${baseUrl}/api/ai/status?${params}`, {
		method: "GET",
		headers: { Authorization: `Bearer ${token}` },
		signal: signal ?? AbortSignal.timeout(15_000),
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
/**
 * Fetch completed async job result through the proxy.
 * GET /api/ai/result
 */
export async function proxyFetchResult({
	provider,
	endpoint,
	requestId,
	signal,
}: {
	provider: string;
	endpoint: string;
	requestId: string;
	signal?: AbortSignal;
}): Promise<{ status: number; data: unknown }> {
	const token = await getSessionToken();
	const baseUrl = getLicenseServerUrl();

	const params = new URLSearchParams({ provider, endpoint, requestId });

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
			if (requestId && data.status !== "COMPLETED") {
				return pollViaProxy({
					provider: "fal",
					endpoint,
					requestId,
					onProgress: options.onProgress,
					signal,
					startTime,
				});
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
	onProgress,
	signal,
	startTime,
}: {
	provider: string;
	endpoint: string;
	requestId: string;
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
