/**
 * IMA Router API Client
 *
 * HTTP client for IMA Router video generation APIs (api.imarouter.com).
 * Implements the ProviderClient interface for use with the ProviderRouter.
 *
 * Transport resolves in priority order (mirrors gmi-client.ts):
 *  1. Local API key (env `VITE_IMAROUTER_API_KEY` or Electron secure storage)
 *     — direct call.
 *  2. QCut session token — relay through the license server
 *     (`/api/ai/proxy`, `/api/ai/status`). Enables logged-in users without
 *     a local key.
 *  3. Error surfaced with an actionable sign-in/configure hint.
 *
 * Relay path estimates and attaches a credit amount so the server deducts
 * from the user's QCut balance atomically; failed / cancelled / timed-out
 * jobs trigger a refund call so credits never burn silently.
 *
 * API: https://doc.imarouter.com/
 * Auth: Bearer token (direct) or QCut session (relay).
 */

import { platform } from "@qcut/platform-core";

import { AI_MODELS } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import { useLicenseStore } from "@/stores/license-store";

import {
	getSessionToken,
	proxyStatus,
	proxySubmit,
	refundCredits,
	type ProxySubmitCredits,
} from "../ai-video/core/license-relay";
import { InsufficientCreditsError } from "../ai-video/core/relay-errors";
import type { CreditBalanceInfo } from "../ai-video/core/relay-types";
import type {
	ProviderClient,
	ProviderPollOptions,
	ProviderPollResult,
	ProviderSubmitOptions,
	ProviderSubmitResult,
} from "../ai-video/core/provider-types";
import { estimateCreditCost } from "../credit-costs";

const IMAROUTER_API_BASE = "https://api.imarouter.com";
const MISSING_CREDENTIALS_MESSAGE =
	"IMA Router unavailable. Please sign in to your QCut account or set IMAROUTER_API_KEY in QCut settings.";

let cachedKey: string | null = null;

interface PendingDeduction {
	credits: ProxySubmitCredits;
	sessionToken: string;
}

const pendingRelayDeductions = new Map<string, PendingDeduction>();

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

export function clearImaRouterApiKeyCache(): void {
	cachedKey = null;
}

/** Exposed for tests — clears the pending-refund tracker. */
export function clearImaRouterPendingDeductions(): void {
	pendingRelayDeductions.clear();
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

/**
 * Find the renderer modelKey that owns `endpoint` so we can look up its
 * pricing entry for relay credits. `providerRouter.submit` passes the
 * endpoint (`"v1/videos"`) as `model`, but `estimateCreditCost` is keyed
 * on the model id. All IMA Router entries share `"v1/videos"`, so we
 * also accept a per-call `payload.model` (the IMA Router API model name,
 * e.g. `"seedance-2.0-fast"`) and find the registry entry whose
 * `default_params.model` matches that.
 */
function findModelKeyForRelay(
	endpoint: string,
	payload: Record<string, unknown>
): string | undefined {
	const apiModel =
		typeof payload.model === "string" ? payload.model : undefined;
	for (const model of AI_MODELS) {
		const endpoints = model.endpoints as Record<string, string> | undefined;
		const defaults = model.default_params as
			| Record<string, unknown>
			| undefined;
		if (!endpoints) continue;
		const hasEndpoint = Object.values(endpoints).includes(endpoint);
		if (!hasEndpoint) continue;
		if (apiModel && defaults?.model && defaults.model !== apiModel) continue;
		return model.id;
	}
	return undefined;
}

function buildCreditsForModel(
	endpoint: string,
	payload: Record<string, unknown>
): ProxySubmitCredits | undefined {
	const duration = Number(payload.duration);
	const durationSeconds =
		Number.isFinite(duration) && duration > 0 ? duration : undefined;

	const modelKey = findModelKeyForRelay(endpoint, payload) ?? endpoint;
	const amount = estimateCreditCost(modelKey, { durationSeconds });
	if (!Number.isFinite(amount) || amount <= 0) return undefined;
	return {
		amount,
		modelKey,
		description: `IMA Router — ${modelKey}${
			durationSeconds ? ` (${durationSeconds}s)` : ""
		}`,
	};
}

function parseBalanceFromResponse(
	data: unknown
): CreditBalanceInfo | undefined {
	if (!data || typeof data !== "object") return undefined;
	const credits = (data as Record<string, unknown>).credits;
	if (!credits || typeof credits !== "object") return undefined;
	const obj = credits as Record<string, unknown>;
	if (
		typeof obj.planCredits === "number" &&
		typeof obj.topUpCredits === "number" &&
		typeof obj.totalCredits === "number" &&
		typeof obj.planCreditsResetAt === "string"
	) {
		return obj as unknown as CreditBalanceInfo;
	}
	return undefined;
}

function scheduleRefund(
	credits: ProxySubmitCredits,
	reason: string,
	sessionToken: string
): void {
	refundCredits({
		amount: credits.amount,
		modelKey: credits.modelKey,
		description: `${credits.description} — refund (${reason})`,
		sessionToken,
	})
		.then(() => {
			useLicenseStore
				.getState()
				.checkLicense()
				.catch(() => {
					/* ignore */
				});
		})
		.catch((error) => {
			console.warn("[imarouter-client] refund call failed:", error);
		});
}

async function readErrorDetail(response: Response): Promise<string> {
	const errorData = await response.json().catch(() => ({}));
	const data = errorData as Record<string, unknown>;
	return (
		(data.message as string | undefined) ||
		(data.detail as string | undefined) ||
		(data.error as string | undefined) ||
		response.statusText
	);
}

export const imaRouterClient: ProviderClient = {
	name: "imarouter",

	async isAvailable(): Promise<boolean> {
		if (await getApiKey()) return true;
		const token = await getSessionToken();
		return token.length > 0;
	},

	async submit(
		model: string,
		payload: Record<string, unknown>,
		options?: ProviderSubmitOptions
	): Promise<ProviderSubmitResult> {
		const apiKey = await getApiKey();

		let response: Response;
		let relayCredits: ProxySubmitCredits | undefined;
		let sessionTokenForRefund = "";

		if (apiKey) {
			response = await fetch(`${IMAROUTER_API_BASE}/v1/videos`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: options?.signal,
			});
		} else {
			const sessionToken = await getSessionToken();
			if (!sessionToken) {
				throw new Error(MISSING_CREDENTIALS_MESSAGE);
			}
			sessionTokenForRefund = sessionToken;
			relayCredits = buildCreditsForModel(model, payload);
			response = await proxySubmit({
				provider: "imarouter",
				endpoint: `${IMAROUTER_API_BASE}/v1/videos`,
				method: "POST",
				body: payload,
				signal: options?.signal,
				sessionToken,
				credits: relayCredits,
			});
		}

		if (response.status === 402 && relayCredits) {
			const errorBody = await response.json().catch(() => ({}));
			throw new InsufficientCreditsError({
				required: relayCredits.amount,
				balance: parseBalanceFromResponse(errorBody),
				modelKey: relayCredits.modelKey,
			});
		}

		if (!response.ok) {
			const detail = await readErrorDetail(response);
			if (relayCredits && sessionTokenForRefund) {
				scheduleRefund(
					relayCredits,
					"submit-http-error",
					sessionTokenForRefund
				);
			}
			throw new Error(`IMA Router API error (${response.status}): ${detail}`);
		}

		const result = (await response.json()) as ImaRouterSubmitResponse;
		const taskId = result.task_id ?? result.id;
		if (!taskId) {
			if (relayCredits && sessionTokenForRefund) {
				scheduleRefund(relayCredits, "no-task-id", sessionTokenForRefund);
			}
			throw new Error(
				`IMA Router submit returned no task id: ${result.message ?? JSON.stringify(result)}`
			);
		}

		if (relayCredits && sessionTokenForRefund) {
			pendingRelayDeductions.set(taskId, {
				credits: relayCredits,
				sessionToken: sessionTokenForRefund,
			});
			useLicenseStore
				.getState()
				.checkLicense()
				.catch(() => {
					/* ignore */
				});
		}
		return { requestId: taskId, provider: "imarouter" };
	},

	async poll(
		requestId: string,
		options?: ProviderPollOptions
	): Promise<ProviderPollResult> {
		const apiKey = await getApiKey();
		const sessionToken = apiKey ? "" : await getSessionToken();

		if (!apiKey && !sessionToken) {
			return { status: "failed", error: MISSING_CREDENTIALS_MESSAGE };
		}

		const maxAttempts = options?.maxAttempts ?? 360;
		const intervalMs = options?.pollIntervalMs ?? 5_000;

		const finish = (
			result: ProviderPollResult,
			reason: "provider-failed" | "poll-http-error" = "provider-failed"
		): ProviderPollResult => {
			const pending = pendingRelayDeductions.get(requestId);
			pendingRelayDeductions.delete(requestId);
			if (pending && result.status === "failed") {
				scheduleRefund(pending.credits, reason, pending.sessionToken);
			}
			return result;
		};

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (options?.signal?.aborted) {
				return finish({ status: "failed", error: "Cancelled" });
			}

			let response: Response;
			try {
				response = apiKey
					? await fetch(`${IMAROUTER_API_BASE}/v1/videos/${requestId}`, {
							method: "GET",
							headers: { Authorization: `Bearer ${apiKey}` },
							signal: options?.signal,
						})
					: await proxyStatus({
							provider: "imarouter",
							requestId,
							signal: options?.signal,
							sessionToken,
						});
			} catch (error) {
				finish(
					{
						status: "failed",
						error:
							error instanceof Error
								? `IMA Router poll transport error: ${error.message}`
								: "IMA Router poll transport error",
					},
					"poll-http-error"
				);
				throw error;
			}

			if (!response.ok) {
				const err = new Error(
					`IMA Router poll failed (${response.status}): ${response.statusText}`
				);
				finish({ status: "failed", error: err.message }, "poll-http-error");
				throw err;
			}

			const data = (await response.json()) as ImaRouterStatusResponse;

			const normalized: ProviderPollResult = {
				status:
					data.status === "completed"
						? "completed"
						: data.status === "failed"
							? "failed"
							: data.status === "queued"
								? "queued"
								: "processing",
				progress: typeof data.progress === "number" ? data.progress : undefined,
				videoUrl: data.results?.[0]?.url,
				error:
					data.status === "failed"
						? typeof data.error === "string"
							? data.error
							: (data.error?.message ?? data.message)
						: undefined,
			};
			options?.onProgress?.(normalized);

			if (normalized.status === "completed") {
				pendingRelayDeductions.delete(requestId);
				return normalized;
			}
			if (normalized.status === "failed") {
				return finish(normalized, "provider-failed");
			}

			await new Promise((r) => setTimeout(r, intervalMs));
		}

		return finish(
			{
				status: "failed",
				error: `IMA Router task ${requestId} timed out after ${maxAttempts} attempts`,
			},
			"poll-http-error"
		);
	},
};
