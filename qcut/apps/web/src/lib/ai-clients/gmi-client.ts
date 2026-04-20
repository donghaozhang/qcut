/**
 * GMI Cloud API Client
 *
 * HTTP client for GMI Cloud video generation APIs.
 * Implements the ProviderClient interface for use with the ProviderRouter.
 *
 * Transport resolves in priority order:
 *  1. Local API key (env `VITE_GMI_API_KEY` or Electron secure storage) — direct call.
 *  2. QCut session token — relay through the license server (`/api/ai/proxy`,
 *     `/api/ai/status`). Enables logged-in users without a local key.
 *  3. Error surfaced to the caller with an actionable sign-in/configure hint.
 *
 * API: https://console.gmicloud.ai
 * Auth: Bearer token (direct) or QCut session (relay).
 */

import { platform } from "@qcut/platform-core";
import {
	getSessionToken,
	proxyStatus,
	proxySubmit,
} from "../ai-video/core/license-relay";
import type {
	ProviderClient,
	ProviderSubmitResult,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderPollOptions,
} from "../ai-video/core/provider-types";

const GMI_API_BASE =
	"https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";

const MISSING_CREDENTIALS_MESSAGE =
	"GMI unavailable. Sign in to your QCut account, or set VITE_GMI_API_KEY.";

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
		media_urls?: Array<{ id: string; url: string }>;
		thumbnail_image_url?: string;
	};
	error?: string;
}

/** Sleep utility for polling intervals. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readErrorDetail(response: Response): Promise<string> {
	const errorData = await response.json().catch(() => ({}));
	return (
		((errorData as Record<string, unknown>).detail as string | undefined) ||
		((errorData as Record<string, unknown>).message as string | undefined) ||
		response.statusText
	);
}

/** GMI Cloud provider client. */
export const gmiClient: ProviderClient = {
	name: "gmi",

	async isAvailable(): Promise<boolean> {
		if (await getGmiApiKey()) return true;
		const token = await getSessionToken();
		return token.length > 0;
	},

	async submit(
		model: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const apiKey = await getGmiApiKey();
		const body = { model, payload };

		let response: Response;

		if (apiKey) {
			response = await fetch(`${GMI_API_BASE}/requests`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				signal: options?.signal,
			});
		} else {
			const sessionToken = await getSessionToken();
			if (!sessionToken) {
				throw new Error(MISSING_CREDENTIALS_MESSAGE);
			}
			response = await proxySubmit({
				provider: "gmi",
				endpoint: `${GMI_API_BASE}/requests`,
				method: "POST",
				body,
				signal: options?.signal,
				sessionToken,
			});
		}

		if (!response.ok) {
			const detail = await readErrorDetail(response);
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
		const sessionToken = apiKey ? "" : await getSessionToken();

		if (!apiKey && !sessionToken) {
			throw new Error(MISSING_CREDENTIALS_MESSAGE);
		}

		const maxAttempts = options?.maxAttempts ?? 360;
		const intervalMs = options?.pollIntervalMs ?? 5000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const response = apiKey
				? await fetch(`${GMI_API_BASE}/requests/${requestId}`, {
						method: "GET",
						headers: { Authorization: `Bearer ${apiKey}` },
						signal: options?.signal,
					})
				: await proxyStatus({
						provider: "gmi",
						requestId,
						signal: options?.signal,
						sessionToken,
					});

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
				videoUrl: data.outcome?.video_url || data.outcome?.media_urls?.[0]?.url,
				thumbnailUrl: data.outcome?.thumbnail_image_url,
				error: data.error,
			};

			if (data.status === "processing") {
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
			error: `GMI request ${requestId} timed out after ${maxAttempts} attempts`,
		};
	},
};
