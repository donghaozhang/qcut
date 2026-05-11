/**
 * License-Server Relay Helpers
 *
 * Shared utilities for proxying AI provider requests through the QCut
 * license server when a logged-in user has no local provider API key.
 *
 * The license server holds provider keys on behalf of authenticated users;
 * a session token (from `platform().license.getAuthToken()`) is exchanged
 * for provider access.
 *
 * Kept provider-agnostic so FAL, GMI, and future relays share a single
 * transport layer. See `fal-request.ts` and `gmi-client.ts` for callers.
 */

import { platform } from "@qcut/platform-core";

/**
 * License server URL used for relayed provider requests.
 *
 * Falls back to production if the env var is not set so packaged builds
 * work without additional configuration.
 */
export const LICENSE_SERVER_URL =
	import.meta.env.VITE_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";

/**
 * Attempt to obtain the current QCut session token for license-server auth.
 *
 * Returns `""` when no platform/license API is available, when the user is
 * not signed in, or when the token fetch throws. Callers treat empty string
 * as "relay not available" and fall through to an error.
 */
export async function getSessionToken(): Promise<string> {
	try {
		const licenseApi = platform().license;
		if (!licenseApi) return "";
		if ("getAuthToken" in licenseApi) {
			const token = await (
				licenseApi as { getAuthToken: () => Promise<string> }
			).getAuthToken();
			return token ?? "";
		}
	} catch (error) {
		console.warn("[getSessionToken] Failed to get session token:", error);
	}
	return "";
}

export interface ProxySubmitCredits {
	/** Credits to deduct for this operation. Must be > 0. */
	amount: number;
	/** Model identifier recorded in the credit ledger. */
	modelKey: string;
	/** Human-readable ledger description. */
	description: string;
}

export interface ProxySubmitOptions {
	provider:
		| "fal"
		| "gmi"
		| "runway"
		| "elevenlabs"
		| "gemini"
		| "openrouter"
		| "imarouter";
	/** Full provider endpoint URL (e.g. `https://console.gmicloud.ai/api/v1/...`). */
	endpoint: string;
	method?: "POST" | "GET" | "PUT" | "DELETE";
	body?: unknown;
	signal?: AbortSignal;
	sessionToken?: string;
	/**
	 * When set, the license server atomically deducts these credits before
	 * forwarding to the provider. A 402 response indicates insufficient
	 * balance and the provider call is not made.
	 */
	credits?: ProxySubmitCredits;
}

/**
 * Forward a provider request through `POST /api/ai/proxy`.
 *
 * Resolves the session token via `getSessionToken()` if not supplied.
 * Returns the raw `Response` so callers can parse provider-specific payloads
 * (the license server forwards status + body verbatim).
 *
 * Throws if no session token is available — callers are expected to check
 * `getSessionToken()` themselves when they need to produce a richer error.
 */
export async function proxySubmit(
	options: ProxySubmitOptions
): Promise<Response> {
	const token = options.sessionToken ?? (await getSessionToken());
	if (!token) {
		throw new Error("No QCut session token available for license-server relay");
	}

	const payload: Record<string, unknown> = {
		provider: options.provider,
		endpoint: options.endpoint,
		method: options.method ?? "POST",
		body: options.body,
	};
	if (options.credits && options.credits.amount > 0) {
		payload.credits = options.credits;
	}

	return fetch(`${LICENSE_SERVER_URL}/api/ai/proxy`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(payload),
		signal: options.signal,
	});
}

export interface RefundCreditsOptions {
	amount: number;
	modelKey: string;
	description: string;
	sessionToken?: string;
	signal?: AbortSignal;
}

/**
 * Refund credits previously deducted by a relay call that failed
 * downstream (provider error, timeout, safety-filter reject).
 *
 * Fire-and-forget is fine — failures only show up in telemetry. Never
 * swallow the underlying provider error by throwing from here.
 */
export async function refundCredits(
	options: RefundCreditsOptions
): Promise<Response> {
	const token = options.sessionToken ?? (await getSessionToken());
	if (!token) {
		throw new Error("No QCut session token available for license-server relay");
	}

	return fetch(`${LICENSE_SERVER_URL}/api/ai/refund`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({
			amount: options.amount,
			modelKey: options.modelKey,
			description: options.description,
		}),
		signal: options.signal,
	});
}

export interface ProxyStatusOptions {
	provider: "fal" | "gmi" | "imarouter";
	requestId: string;
	/** Required for FAL; optional/ignored for GMI (server constructs the URL). */
	endpoint?: string;
	/** Preferred FAL status URL from the initial submit response. */
	statusUrl?: string;
	signal?: AbortSignal;
	sessionToken?: string;
}

/**
 * Poll an async job status through `GET /api/ai/status`.
 *
 * See `packages/license-server/src/routes/ai-proxy.ts` for supported
 * providers and URL construction.
 */
export async function proxyStatus(
	options: ProxyStatusOptions
): Promise<Response> {
	const token = options.sessionToken ?? (await getSessionToken());
	if (!token) {
		throw new Error("No QCut session token available for license-server relay");
	}

	const params = new URLSearchParams({
		provider: options.provider,
		requestId: options.requestId,
	});
	if (options.endpoint) params.set("endpoint", options.endpoint);
	if (options.statusUrl) params.set("statusUrl", options.statusUrl);

	return fetch(`${LICENSE_SERVER_URL}/api/ai/status?${params.toString()}`, {
		method: "GET",
		headers: { Authorization: `Bearer ${token}` },
		signal: options.signal,
	});
}
