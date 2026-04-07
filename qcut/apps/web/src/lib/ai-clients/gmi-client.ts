/**
 * GMI Cloud API Client
 *
 * HTTP client for GMI Cloud video generation APIs.
 * Implements the ProviderClient interface for use with the ProviderRouter.
 *
 * API: https://console.gmicloud.ai
 * Auth: Bearer token
 */

import { platform } from "@qcut/platform-core";
import type {
	ProviderClient,
	ProviderSubmitResult,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderPollOptions,
} from "../ai-video/core/provider-types";

const GMI_API_BASE =
	"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";

let cachedGmiApiKey: string | null = null;

/** Retrieve the GMI API key from env or Electron secure storage. */
async function getGmiApiKey(): Promise<string | undefined> {
	const envKey = import.meta.env.VITE_GMI_API_KEY;
	if (envKey) return envKey;

	if (cachedGmiApiKey) return cachedGmiApiKey;

	try {
		const keys = await platform().apiKeys.get();
		if (keys?.gmiApiKey) {
			cachedGmiApiKey = keys.gmiApiKey;
			return cachedGmiApiKey;
		}
	} catch {
		// Platform not initialized — skip
	}
	return undefined;
}

/** Clear the cached GMI API key. */
export function clearGmiApiKeyCache(): void {
	cachedGmiApiKey = null;
}

/** GMI API request status shape. */
interface GmiRequestStatusResponse {
	id: string;
	status: "queued" | "processing" | "success" | "failed" | "cancelled";
	outcome?: {
		video_url?: string;
		thumbnail_image_url?: string;
	};
	error?: string;
}

/** Sleep utility for polling intervals. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GMI Cloud provider client. */
export const gmiClient: ProviderClient = {
	name: "gmi",

	async isAvailable(): Promise<boolean> {
		return !!(await getGmiApiKey());
	},

	async submit(
		model: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const apiKey = await getGmiApiKey();
		if (!apiKey) {
			throw new Error(
				"GMI API key not configured. Set VITE_GMI_API_KEY or configure it in Settings."
			);
		}

		const response = await fetch(`${GMI_API_BASE}/requests`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model, payload }),
			signal: options?.signal,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const detail =
				(errorData as Record<string, unknown>).detail ||
				(errorData as Record<string, unknown>).message ||
				response.statusText;
			throw new Error(`GMI API error (${response.status}): ${detail}`);
		}

		const result = (await response.json()) as { id: string };
		return { requestId: result.id, provider: "gmi" };
	},

	async poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const apiKey = await getGmiApiKey();
		if (!apiKey) {
			throw new Error("GMI API key not available for polling.");
		}

		const maxAttempts = options?.maxAttempts ?? 360;
		const intervalMs = options?.pollIntervalMs ?? 5000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const response = await fetch(
				`${GMI_API_BASE}/requests/${requestId}`,
				{
					method: "GET",
					headers: { Authorization: `Bearer ${apiKey}` },
					signal: options?.signal,
				}
			);

			if (!response.ok) {
				throw new Error(
					`GMI poll failed (${response.status}): ${response.statusText}`
				);
			}

			const data = (await response.json()) as GmiRequestStatusResponse;

			const normalized: ProviderPollResult = {
				status:
					data.status === "success"
						? "completed"
						: data.status === "cancelled"
							? "failed"
							: data.status,
				videoUrl: data.outcome?.video_url,
				thumbnailUrl: data.outcome?.thumbnail_image_url,
				error: data.error,
			};

			if (data.status === "processing") {
				normalized.progress = Math.min(
					90,
					Math.round((attempt / maxAttempts) * 90)
				);
			}

			if (options?.onProgress) {
				options.onProgress(normalized);
			}

			if (
				normalized.status === "completed" ||
				normalized.status === "failed"
			) {
				if (normalized.status === "completed") {
					normalized.progress = 100;
				}
				return normalized;
			}

			await sleep(intervalMs);
		}

		return {
			status: "failed",
			error: `GMI request ${requestId} timed out after ${maxAttempts} attempts`,
		};
	},
};
