/**
 * FAL Provider Adapter
 *
 * Thin wrapper around existing FAL request/polling code that implements
 * the ProviderClient interface. No existing FAL code is modified.
 */

import type {
	ProviderClient,
	ProviderSubmitResult,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderPollOptions,
} from "./provider-types";
import {
	getFalApiKeyAsync,
	makeFalRequest,
	FAL_QUEUE_BASE,
} from "./fal-request";

/** FAL provider client implementing the unified ProviderClient interface. */
export const falProvider: ProviderClient = {
	name: "fal",

	async isAvailable(): Promise<boolean> {
		return !!(await getFalApiKeyAsync());
	},

	async submit(
		endpoint: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const response = await makeFalRequest(endpoint, payload, {
			queueMode: true,
			signal: options?.signal,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const detail =
				(errorData as Record<string, unknown>).detail ||
				(errorData as Record<string, unknown>).error ||
				response.statusText;
			throw new Error(`FAL API error (${response.status}): ${detail}`);
		}

		const result = (await response.json()) as {
			request_id?: string;
			status_url?: string;
			response_url?: string;
		};

		if (!result.request_id) {
			throw new Error("FAL queue did not return a request_id");
		}

		return { requestId: result.request_id, provider: "fal" };
	},

	async poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const maxAttempts = options?.maxAttempts ?? 240;
		const intervalMs = options?.pollIntervalMs ?? 5000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const statusUrl = `${FAL_QUEUE_BASE}/requests/${requestId}/status`;

			const apiKey = await getFalApiKeyAsync();
			const response = await fetch(statusUrl, {
				headers: apiKey ? { Authorization: `Key ${apiKey}` } : {},
				signal: options?.signal,
			});

			if (!response.ok) {
				throw new Error(
					`FAL poll failed (${response.status}): ${response.statusText}`
				);
			}

			const data = (await response.json()) as {
				status: string;
				logs?: Array<{ message: string }>;
				response_url?: string;
			};

			const normalized: ProviderPollResult = {
				status:
					data.status === "COMPLETED"
						? "completed"
						: data.status === "FAILED"
							? "failed"
							: data.status === "IN_PROGRESS"
								? "processing"
								: "queued",
			};

			if (data.status === "IN_PROGRESS") {
				normalized.progress = Math.min(
					90,
					Math.round((attempt / maxAttempts) * 90)
				);
			}

			if (options?.onProgress) {
				options.onProgress(normalized);
			}

			if (normalized.status === "completed") {
				// Fetch the actual result
				const responseUrl =
					data.response_url ||
					`${FAL_QUEUE_BASE}/requests/${requestId}/response`;
				const resultResponse = await fetch(responseUrl, {
					headers: apiKey ? { Authorization: `Key ${apiKey}` } : {},
					signal: options?.signal,
				});

				if (!resultResponse.ok) {
					return {
						status: "failed",
						error: `Failed to fetch FAL result: ${resultResponse.status}`,
					};
				}

				const result = (await resultResponse.json()) as Record<string, unknown>;
				const videoUrl =
					(result.video as Record<string, unknown>)?.url ??
					(result as Record<string, unknown>).url;

				return {
					status: "completed",
					progress: 100,
					videoUrl: videoUrl as string | undefined,
				};
			}

			if (normalized.status === "failed") {
				return {
					status: "failed",
					error: `FAL request ${requestId} failed`,
				};
			}

			await new Promise((resolve) => setTimeout(resolve, intervalMs));
		}

		return {
			status: "failed",
			error: `FAL request ${requestId} timed out after ${maxAttempts} attempts`,
		};
	},
};
