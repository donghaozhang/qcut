/**
 * Runway API Client
 *
 * HTTP client for Runway ML video generation APIs.
 * Implements the ProviderClient interface for use with the ProviderRouter.
 *
 * API: https://api.runwayml.com
 * Auth: Bearer token
 * Version: 2024-11-06
 */

import { platform } from "@qcut/platform-core";
import type {
	ProviderClient,
	ProviderSubmitResult,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderPollOptions,
} from "../ai-video/core/provider-types";

const RUNWAY_API_BASE = "https://api.runwayml.com/v1";
const RUNWAY_API_VERSION = "2024-11-06";

let cachedRunwayApiKey: string | null = null;

/** Retrieve the Runway API key from env or Electron secure storage. */
async function getRunwayApiKey(): Promise<string | undefined> {
	const envKey = import.meta.env.VITE_RUNWAY_API_KEY;
	if (envKey) return envKey;

	if (cachedRunwayApiKey) return cachedRunwayApiKey;

	try {
		const keys = await platform().apiKeys.get();
		if (keys?.runwayApiKey) {
			cachedRunwayApiKey = keys.runwayApiKey;
			return cachedRunwayApiKey;
		}
	} catch {
		// Platform not initialized — skip
	}
	return undefined;
}

/** Clear the cached Runway API key. */
export function clearRunwayApiKeyCache(): void {
	cachedRunwayApiKey = null;
}

/** Runway task status response shape. */
interface RunwayTaskResponse {
	id: string;
	status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
	failure?: string;
	failureCode?: string;
	output?: string[];
}

/** Sleep utility for polling intervals. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build standard Runway API headers. */
function buildRunwayHeaders(apiKey: string): Record<string, string> {
	return {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
		"X-Runway-Version": RUNWAY_API_VERSION,
	};
}

/**
 * Map Runway endpoint shorthand to full API path.
 *
 * Model strings like "text_to_video", "image_to_video", "video_to_video"
 * map to Runway REST endpoints.
 */
function resolveEndpoint(model: string): string {
	if (model.startsWith("/")) return model;
	if (model === "text_to_video") return "/text_to_video";
	if (model === "image_to_video") return "/image_to_video";
	if (model === "video_to_video") return "/video_to_video";
	// Default: treat as a direct endpoint path
	return `/${model}`;
}

/** Runway provider client. */
export const runwayClient: ProviderClient = {
	name: "runway",

	async isAvailable(): Promise<boolean> {
		return !!(await getRunwayApiKey());
	},

	async submit(
		model: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const apiKey = await getRunwayApiKey();
		if (!apiKey) {
			throw new Error(
				"Runway API key not configured. Set VITE_RUNWAY_API_KEY or configure it in Settings."
			);
		}

		const endpoint = resolveEndpoint(model);
		const response = await fetch(`${RUNWAY_API_BASE}${endpoint}`, {
			method: "POST",
			headers: buildRunwayHeaders(apiKey),
			body: JSON.stringify(payload),
			signal: options?.signal,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const detail =
				(errorData as Record<string, unknown>).error ||
				(errorData as Record<string, unknown>).message ||
				response.statusText;
			throw new Error(`Runway API error (${response.status}): ${detail}`);
		}

		const result = (await response.json()) as { id: string };
		return { requestId: result.id, provider: "runway" };
	},

	async poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const apiKey = await getRunwayApiKey();
		if (!apiKey) {
			throw new Error("Runway API key not available for polling.");
		}

		const maxAttempts = options?.maxAttempts ?? 120;
		const intervalMs = options?.pollIntervalMs ?? 5000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const response = await fetch(
				`${RUNWAY_API_BASE}/tasks/${requestId}`,
				{
					method: "GET",
					headers: buildRunwayHeaders(apiKey),
					signal: options?.signal,
				}
			);

			if (!response.ok) {
				throw new Error(
					`Runway poll failed (${response.status}): ${response.statusText}`
				);
			}

			const data = (await response.json()) as RunwayTaskResponse;

			const normalized: ProviderPollResult = {
				status:
					data.status === "SUCCEEDED"
						? "completed"
						: data.status === "FAILED" || data.status === "CANCELLED"
							? "failed"
							: data.status === "RUNNING"
								? "processing"
								: "queued",
				videoUrl: data.output?.[0],
				error: data.failure,
			};

			if (data.status === "RUNNING") {
				normalized.progress = Math.min(
					90,
					Math.round((attempt / maxAttempts) * 90)
				);
			}

			if (normalized.status === "completed" || normalized.status === "failed") {
				if (normalized.status === "completed") {
					normalized.progress = 100;
				}
				if (options?.onProgress) {
					options.onProgress(normalized);
				}
				return normalized;
			}

			if (options?.onProgress) {
				options.onProgress(normalized);
			}

			await sleep(intervalMs);
		}

		return {
			status: "failed",
			error: `Runway task ${requestId} timed out after ${maxAttempts} attempts`,
		};
	},
};
