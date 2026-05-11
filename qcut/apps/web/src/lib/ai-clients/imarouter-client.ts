/**
 * IMA Router API Client
 *
 * HTTP client for IMA Router video generation APIs (api.imarouter.com).
 * Implements the ProviderClient interface for use with the ProviderRouter.
 *
 * Transport: direct, user-supplied API key only — there is no license-server
 * relay for IMA Router today (the user supplies their own IMAROUTER_API_KEY
 * and pays IMA Router directly). Mirrors the simpler half of the GMI client;
 * see imarouter-integration-plan.md §4 for the rationale.
 *
 * API: https://doc.imarouter.com/
 * Auth: Bearer token.
 */

import { platform } from "@qcut/platform-core";

import type {
	ProviderClient,
	ProviderPollOptions,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderSubmitResult,
} from "../ai-video/core/provider-types";

const IMAROUTER_API_BASE = "https://api.imarouter.com";
const MISSING_CREDENTIALS_MESSAGE =
	"IMA Router unavailable. Set IMAROUTER_API_KEY in QCut settings.";

let cachedKey: string | null = null;

/**
 * Resolve the IMA Router API key from env (`VITE_IMAROUTER_API_KEY`) or
 * the Electron secure-storage bridge. Cached after first hit.
 */
async function getApiKey(): Promise<string | undefined> {
	const envKey = (import.meta.env as Record<string, string | undefined>)
		.VITE_IMAROUTER_API_KEY;
	if (envKey) return envKey;
	if (cachedKey) return cachedKey;

	try {
		const keys = (await platform().apiKeys.get()) as
			| { imarouterApiKey?: string }
			| undefined;
		if (keys?.imarouterApiKey) {
			cachedKey = keys.imarouterApiKey;
			return cachedKey;
		}
	} catch {
		// Platform not initialized — fall through to undefined.
	}
	return undefined;
}

/** Exposed for tests. */
export function clearImaRouterApiKeyCache(): void {
	cachedKey = null;
}

interface ImaRouterSubmitResponse {
	task_id?: string;
	id?: string;
	code?: number | string;
	message?: string;
}

interface ImaRouterStatusResponse {
	status?: "queued" | "in_progress" | "completed" | "failed" | string;
	progress?: number;
	results?: Array<{ url?: string }>;
	error?: { code?: number | string; message?: string } | string;
	message?: string;
}

async function imaFetch<T>(
	path: string,
	init: RequestInit,
	apiKey: string
): Promise<T> {
	const res = await fetch(`${IMAROUTER_API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text };
	}
	if (!res.ok) {
		const obj = json as { code?: number | string; message?: string };
		throw new Error(
			`IMA Router ${path} error ${res.status}${
				obj.code ? ` [${obj.code}]` : ""
			}: ${obj.message ?? text.slice(0, 200)}`
		);
	}
	return json as T;
}

export const imaRouterClient: ProviderClient = {
	name: "imarouter",

	async isAvailable(): Promise<boolean> {
		const key = await getApiKey();
		return Boolean(key);
	},

	async submit(
		model: string,
		payload: Record<string, unknown>,
		_options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const apiKey = await getApiKey();
		if (!apiKey) throw new Error(MISSING_CREDENTIALS_MESSAGE);

		// `model` may be either the registry endpoint (`v1/videos`) or the API
		// model name (e.g. `seedance-2.0`). The registry stores the IMA Router
		// API model as `defaults.model`, which the caller merges into payload.
		// Submit goes to `/v1/videos`; the payload already has the right shape.
		const body: ImaRouterSubmitResponse = await imaFetch(
			"/v1/videos",
			{ method: "POST", body: JSON.stringify(payload) },
			apiKey
		);

		const id = body.task_id ?? body.id;
		if (!id) {
			throw new Error(
				`IMA Router submit returned no task id: ${body.message ?? JSON.stringify(body)}`
			);
		}
		return { requestId: id, provider: "imarouter" };
	},

	async poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const apiKey = await getApiKey();
		if (!apiKey) {
			return {
				status: "failed",
				error: MISSING_CREDENTIALS_MESSAGE,
			};
		}

		const maxAttempts = options?.maxAttempts ?? 180; // ~15 min at 5 s
		const intervalMs = options?.pollIntervalMs ?? 5_000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (options?.signal?.aborted) {
				return { status: "failed", error: "Cancelled" };
			}
			let status: ImaRouterStatusResponse;
			try {
				status = await imaFetch<ImaRouterStatusResponse>(
					`/v1/videos/${requestId}`,
					{ method: "GET" },
					apiKey
				);
			} catch (err) {
				return {
					status: "failed",
					error: err instanceof Error ? err.message : String(err),
				};
			}

			const result: ProviderPollResult = {
				status:
					status.status === "completed"
						? "completed"
						: status.status === "failed"
							? "failed"
							: status.status === "queued"
								? "queued"
								: "processing",
				progress:
					typeof status.progress === "number" ? status.progress : undefined,
				videoUrl: status.results?.[0]?.url,
				error:
					status.status === "failed"
						? typeof status.error === "string"
							? status.error
							: (status.error?.message ?? status.message)
						: undefined,
			};
			options?.onProgress?.(result);

			if (result.status === "completed" || result.status === "failed") {
				return result;
			}
			await new Promise((r) => setTimeout(r, intervalMs));
		}

		return {
			status: "failed",
			error: `IMA Router task ${requestId} timed out after ${maxAttempts} attempts`,
		};
	},
};
