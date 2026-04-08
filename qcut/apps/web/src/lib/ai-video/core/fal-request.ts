/**
 * Core FAL API Request Utilities
 *
 * Provides a consistent interface for making FAL AI API requests.
 * Centralizes authentication, error handling, and response parsing.
 */

import { platform } from "@qcut/platform-core";
import { handleAIServiceError } from "@/lib/debug/error-handler";

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
}

/**
 * Makes an authenticated request to FAL AI API.
 *
 * @param endpoint - FAL endpoint path (e.g., "fal-ai/kling-video/v2.6/pro/text-to-video")
 * @param payload - Request payload
 * @param options - Optional request configuration
 * @returns Raw Response object for flexible handling
 * @throws Error with user-friendly message if API key is missing
 */
/**
 * License server URL for proxy mode.
 * Falls back to production URL if env var is not set.
 */
const LICENSE_SERVER_URL =
	import.meta.env.VITE_LICENSE_SERVER_URL ||
	"https://qcut-license-server.zdhpeter.workers.dev";

/** Try to get a session token from the license store (if available). */
async function getSessionToken(): Promise<string> {
	try {
		const licenseApi = platform().license;
		if (!licenseApi) return "";
		// The license API exposes the auth token via getAuthToken if available
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

export async function makeFalRequest(
	endpoint: string,
	payload: Record<string, unknown>,
	options?: FalRequestOptions
): Promise<Response> {
	const apiKey = await getFalApiKeyAsync();

	// If no local key, try proxy mode
	if (!apiKey) {
		const sessionToken = await getSessionToken();
		if (sessionToken) {
			const base = options?.queueMode ? FAL_QUEUE_BASE : FAL_API_BASE;
			const targetUrl = endpoint.startsWith("https://")
				? endpoint
				: `${base}/${endpoint}`;

			return fetch(`${LICENSE_SERVER_URL}/api/ai/proxy`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({
					provider: "fal",
					endpoint: targetUrl,
					method: "POST",
					body: payload,
				}),
				signal: options?.signal,
			});
		}

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

	// Queue mode uses queue.fal.run subdomain for async job submission
	if (options?.queueMode) {
		headers["X-Fal-Queue"] = "true";
	}

	const base = options?.queueMode ? FAL_QUEUE_BASE : FAL_API_BASE;
	const url = endpoint.startsWith("https://")
		? endpoint
		: `${base}/${endpoint}`;

	return fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
		signal: options?.signal,
	});
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
