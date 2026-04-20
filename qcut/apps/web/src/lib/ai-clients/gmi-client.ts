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
 * When the relay is used, the client also estimates and attaches a credit
 * amount so the server deducts from the user's QCut balance atomically.
 * Failed / cancelled / timed-out jobs trigger a refund call so credits
 * never burn silently.
 *
 * API: https://console.gmicloud.ai
 * Auth: Bearer token (direct) or QCut session (relay).
 */

import { platform } from "@qcut/platform-core";
import { useLicenseStore } from "@/stores/license-store";
import { estimateCreditCost } from "../credit-costs";
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

interface PendingDeduction {
	credits: ProxySubmitCredits;
	sessionToken: string;
}

/**
 * Pending credit deductions awaiting outcome. Keyed by GMI request ID
 * so the poll loop can refund on failure without carrying state through
 * the ProviderClient interface.
 */
const pendingRelayDeductions = new Map<string, PendingDeduction>();

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

/** Exposed for tests — clears the pending-refund tracker. */
export function clearGmiPendingDeductions(): void {
	pendingRelayDeductions.clear();
}

/** GMI API request status shape. */
interface GmiRequestStatusResponse {
	request_id?: string;
	id?: string;
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

/**
 * Build the credit entry the relay attaches to a submit. Returns
 * `undefined` when the model is missing a pricing entry or duration
 * doesn't apply (`estimateCreditCost` falls back to 1 for unknowns,
 * but we'd rather not deduct anything we can't explain to the user).
 */
function buildCreditsForModel(
	model: string,
	payload: Record<string, unknown>
): ProxySubmitCredits | undefined {
	const duration = Number(payload.duration);
	const durationSeconds =
		Number.isFinite(duration) && duration > 0 ? duration : undefined;
	const amount = estimateCreditCost(model, { durationSeconds });
	if (!Number.isFinite(amount) || amount <= 0) return undefined;
	return {
		amount,
		modelKey: model,
		description: `GMI — ${model}${
			durationSeconds ? ` (${durationSeconds}s)` : ""
		}`,
	};
}

/** Parse the balance payload the server sends on 402 and happy paths. */
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
	// Fire and forget — never throw from this path, otherwise a refund
	// failure would mask the underlying provider error.
	refundCredits({
		amount: credits.amount,
		modelKey: credits.modelKey,
		description: `${credits.description} — refund (${reason})`,
		sessionToken,
	})
		.then(() => {
			// Re-sync balance so the UI reflects the refund.
			useLicenseStore
				.getState()
				.checkLicense()
				.catch(() => {
					/* ignore */
				});
		})
		.catch((error) => {
			console.warn("[gmi-client] refund call failed:", error);
		});
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
		let relayCredits: ProxySubmitCredits | undefined;
		let sessionTokenForRefund = "";

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
			sessionTokenForRefund = sessionToken;
			relayCredits = buildCreditsForModel(model, payload);
			response = await proxySubmit({
				provider: "gmi",
				endpoint: `${GMI_API_BASE}/requests`,
				method: "POST",
				body,
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
				modelKey: model,
			});
		}

		if (!response.ok) {
			const detail = await readErrorDetail(response);
			throw new Error(`GMI API error (${response.status}): ${detail}`);
		}

		// GMI Cloud returns `request_id` (snake_case); some older responses used
		// `id`. Accept either — matches the native-pipeline parser at
		// `electron/native-pipeline/infra/api-caller.ts:753-757`.
		const result = (await response.json()) as {
			request_id?: string;
			id?: string;
		};
		const requestId = result.request_id ?? result.id;
		if (!requestId) {
			// Deduction happened server-side but we can't correlate it to a
			// request — refund immediately so the user isn't charged for a
			// black-hole submit.
			if (relayCredits && sessionTokenForRefund) {
				scheduleRefund(relayCredits, "no-request-id", sessionTokenForRefund);
			}
			throw new Error("GMI API returned no request ID");
		}

		if (relayCredits && sessionTokenForRefund) {
			pendingRelayDeductions.set(requestId, {
				credits: relayCredits,
				sessionToken: sessionTokenForRefund,
			});
			// Fire-and-forget license refresh so the renderer's balance chip
			// reflects the deduction. Errors are non-critical — the next
			// checkLicense() call picks up the ground truth.
			useLicenseStore
				.getState()
				.checkLicense()
				.catch(() => {
					/* ignore */
				});
		}
		return { requestId, provider: "gmi" };
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

		const finish = (result: ProviderPollResult): ProviderPollResult => {
			const pending = pendingRelayDeductions.get(requestId);
			pendingRelayDeductions.delete(requestId);
			if (pending && result.status === "failed") {
				scheduleRefund(
					pending.credits,
					"provider-failed",
					pending.sessionToken
				);
			}
			return result;
		};

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
				return finish(normalized);
			}

			if (options?.onProgress) {
				options.onProgress(normalized);
			}

			await sleep(intervalMs);
		}

		return finish({
			status: "failed",
			error: `GMI request ${requestId} timed out after ${maxAttempts} attempts`,
		});
	},
};
