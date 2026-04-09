import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	type AiProvider,
	buildProviderAuthHeaders,
	getProviderKey,
	isEndpointAllowed,
	isValidProvider,
} from "../services/provider-keys";
import { deductCreditsForUser } from "../services/credit-service";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_UPLOAD_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const PROXY_FETCH_TIMEOUT_MS = 120_000; // 2 min

/** Only alphanumeric, hyphens, underscores, and forward slashes (for FAL endpoint paths). */
const VALID_REQUEST_ID = /^[a-zA-Z0-9_-]+$/;
const VALID_ENDPOINT_PATH = /^[a-zA-Z0-9_.\-/]+$/;

const aiProxyRoutes = new Hono();

aiProxyRoutes.use("/*", authMiddleware);
aiProxyRoutes.use("/*", rateLimitMiddleware);

// ---------------------------------------------------------------------------
// POST /proxy — forward a JSON request to an AI provider
// ---------------------------------------------------------------------------
aiProxyRoutes.post("/proxy", async (c) => {
	try {
		const userId = c.get("userId") as string;
		const raw = await c.req.text();

		if (raw.length > MAX_PROXY_BODY_BYTES) {
			return c.json({ error: "Request body too large (10 MB max)" }, 413);
		}

		let payload: {
			provider?: string;
			endpoint?: string;
			method?: string;
			body?: unknown;
			credits?: { amount: number; modelKey: string; description: string };
		};
		try {
			payload = JSON.parse(raw);
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}

		const { provider, endpoint, method, body, credits } = payload;

		if (typeof provider !== "string" || !isValidProvider(provider)) {
			return c.json(
				{
					error:
						"Invalid provider. Must be one of: fal, gemini, openrouter, elevenlabs, gmi, runway, freesound",
				},
				400
			);
		}

		if (typeof endpoint !== "string" || endpoint.length === 0) {
			return c.json({ error: "endpoint is required" }, 400);
		}

		if (!isEndpointAllowed({ provider, url: endpoint })) {
			return c.json({ error: "Endpoint not allowed for this provider" }, 403);
		}

		const authHeaders = buildProviderAuthHeaders(provider);
		if (!authHeaders) {
			return c.json(
				{ error: `API key not configured for provider: ${provider}` },
				503
			);
		}

		// Deduct credits if the client requested it
		if (credits) {
			const amount = Number(credits.amount);
			const modelKey =
				typeof credits.modelKey === "string" ? credits.modelKey.trim() : "";
			const description =
				typeof credits.description === "string"
					? credits.description.trim()
					: "";

			if (Number.isFinite(amount) && amount > 0 && modelKey.length > 0) {
				const deduction = await deductCreditsForUser({
					userId,
					amount,
					modelKey,
					description:
						description.length > 0 ? description : `${provider} — ${modelKey}`,
				});
				if (!deduction.success) {
					return c.json(
						{
							error: "Insufficient credits",
							credits: deduction.balance,
						},
						402
					);
				}
			}
		}

		const httpMethod = (method ?? "POST").toUpperCase();
		const providerResponse = await fetch(endpoint, {
			method: httpMethod,
			headers: {
				"Content-Type": "application/json",
				...authHeaders,
			},
			...(httpMethod !== "GET" && body != null
				? { body: JSON.stringify(body) }
				: {}),
			signal: AbortSignal.timeout(PROXY_FETCH_TIMEOUT_MS),
		});

		const responseBody = await providerResponse.text();
		return new Response(responseBody, {
			status: providerResponse.status,
			headers: {
				"Content-Type":
					providerResponse.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch (error) {
		if (error instanceof DOMException && error.name === "TimeoutError") {
			return c.json({ error: "Provider request timed out" }, 504);
		}
		return c.json(
			{
				error: error instanceof Error ? error.message : "Proxy request failed",
			},
			500
		);
	}
});

// ---------------------------------------------------------------------------
// POST /upload-url — vend a signed upload URL (FAL storage)
// ---------------------------------------------------------------------------
aiProxyRoutes.post("/upload-url", async (c) => {
	try {
		c.get("userId"); // ensure authenticated

		const payload = await c.req.json();
		const provider = payload?.provider;
		const fileName =
			typeof payload?.fileName === "string" ? payload.fileName.trim() : "";
		const contentType =
			typeof payload?.contentType === "string"
				? payload.contentType.trim()
				: "application/octet-stream";
		const fileSize = Number(payload?.fileSize ?? 0);

		if (provider !== "fal") {
			return c.json(
				{ error: "Upload URL vending is only supported for fal" },
				400
			);
		}
		if (fileName.length === 0) {
			return c.json({ error: "fileName is required" }, 400);
		}
		if (fileSize > MAX_UPLOAD_FILE_SIZE) {
			return c.json({ error: "File too large (500 MB max)" }, 413);
		}

		const falKey = getProviderKey("fal");
		if (!falKey) {
			return c.json({ error: "FAL API key not configured on server" }, 503);
		}

		const initiateResponse = await fetch(
			"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
			{
				method: "POST",
				headers: {
					Authorization: `Key ${falKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					file_name: fileName,
					content_type: contentType,
				}),
				signal: AbortSignal.timeout(15_000),
			}
		);

		if (!initiateResponse.ok) {
			const errorText = await initiateResponse.text();
			return c.json(
				{
					error: `FAL upload initiation failed: ${initiateResponse.status}`,
					detail: errorText,
				},
				502
			);
		}

		const result = await initiateResponse.json();
		return c.json({
			uploadUrl: result.upload_url,
			fileUrl: result.file_url,
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to generate upload URL",
			},
			500
		);
	}
});

// ---------------------------------------------------------------------------
// GET /status — poll async job status (FAL queue, GMI queue)
// ---------------------------------------------------------------------------
aiProxyRoutes.get("/status", async (c) => {
	try {
		c.get("userId"); // ensure authenticated

		const provider = c.req.query("provider") ?? "";
		const endpoint = c.req.query("endpoint") ?? "";
		const requestId = c.req.query("requestId") ?? "";

		if (!isValidProvider(provider)) {
			return c.json({ error: "Invalid provider" }, 400);
		}

		if (requestId.length === 0) {
			return c.json({ error: "requestId is required" }, 400);
		}

		if (!VALID_REQUEST_ID.test(requestId)) {
			return c.json({ error: "Invalid requestId format" }, 400);
		}

		let statusUrl: string;
		if (provider === "fal") {
			if (endpoint.length === 0) {
				return c.json({ error: "endpoint is required for fal polling" }, 400);
			}
			if (!VALID_ENDPOINT_PATH.test(endpoint)) {
				return c.json({ error: "Invalid endpoint format" }, 400);
			}
			statusUrl = `https://queue.fal.run/${endpoint}/requests/${requestId}/status`;
		} else if (provider === "gmi") {
			statusUrl = `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/${requestId}`;
		} else {
			return c.json(
				{ error: `Polling not supported for provider: ${provider}` },
				400
			);
		}

		const authHeaders = buildProviderAuthHeaders(provider as AiProvider);
		if (!authHeaders) {
			return c.json(
				{ error: `API key not configured for provider: ${provider}` },
				503
			);
		}

		const providerResponse = await fetch(statusUrl, {
			method: "GET",
			headers: authHeaders,
			signal: AbortSignal.timeout(15_000),
		});

		const responseBody = await providerResponse.text();
		return new Response(responseBody, {
			status: providerResponse.status,
			headers: {
				"Content-Type":
					providerResponse.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Failed to poll status",
			},
			500
		);
	}
});

// ---------------------------------------------------------------------------
// GET /result — fetch completed async job result (FAL queue)
// ---------------------------------------------------------------------------
aiProxyRoutes.get("/result", async (c) => {
	try {
		c.get("userId"); // ensure authenticated

		const provider = c.req.query("provider") ?? "";
		const endpoint = c.req.query("endpoint") ?? "";
		const requestId = c.req.query("requestId") ?? "";

		if (provider !== "fal") {
			return c.json({ error: "Result fetching only supported for fal" }, 400);
		}
		if (endpoint.length === 0 || requestId.length === 0) {
			return c.json({ error: "endpoint and requestId are required" }, 400);
		}
		if (!VALID_REQUEST_ID.test(requestId)) {
			return c.json({ error: "Invalid requestId format" }, 400);
		}
		if (!VALID_ENDPOINT_PATH.test(endpoint)) {
			return c.json({ error: "Invalid endpoint format" }, 400);
		}

		const resultUrl = `https://queue.fal.run/${endpoint}/requests/${requestId}`;

		const authHeaders = buildProviderAuthHeaders("fal");
		if (!authHeaders) {
			return c.json({ error: "FAL API key not configured" }, 503);
		}

		const providerResponse = await fetch(resultUrl, {
			method: "GET",
			headers: authHeaders,
			signal: AbortSignal.timeout(30_000),
		});

		const responseBody = await providerResponse.text();
		return new Response(responseBody, {
			status: providerResponse.status,
			headers: {
				"Content-Type":
					providerResponse.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error ? error.message : "Failed to fetch result",
			},
			500
		);
	}
});

export { aiProxyRoutes };
