/**
 * Unified API Caller for native pipeline
 *
 * Supports FAL, ElevenLabs, Google/Gemini, and OpenRouter providers.
 * Works in both Electron main process and standalone CLI (no Electron dependency).
 *
 * @module electron/native-pipeline/api-caller
 */

import * as fs from "fs";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import {
	type ProviderName,
	buildProviderUrl,
	extractOutputUrl,
	getAdaptivePollInterval,
	FAL_BASE,
	FAL_STATUS_BASE,
	GEMINI_BASE,
	OPENROUTER_BASE,
	VOLCENGINE_BASE,
} from "./api-provider-urls.js";
import {
	callModelApiViaProxy,
	isProxyAvailable,
	proxyUploadUrl,
} from "./proxy-client.js";
import { estimateProxyCredits } from "./credit-estimator.js";

export type { ProviderName };
export type ApiKeyProvider = (provider: ProviderName) => Promise<string>;

export interface ApiCallOptions {
	endpoint: string;
	payload: Record<string, unknown>;
	provider: ProviderName;
	async?: boolean;
	onProgress?: (percent: number, message: string) => void;
	timeoutMs?: number;
	retries?: number;
	signal?: AbortSignal;
	/** Model registry key — used to calculate credit cost in proxy mode. */
	modelKey?: string;
}

export interface ApiCallResult {
	success: boolean;
	data?: unknown;
	outputUrl?: string;
	error?: string;
	duration: number;
	cost?: number;
}

interface FalQueueResponse {
	request_id: string;
	status: string;
	response_url?: string;
	status_url?: string;
}

interface FalStatusResponse {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	logs?: { message: string }[];
	response_url?: string;
}

interface GmiStatusResponse {
	request_id: string;
	status: "queued" | "processing" | "success" | "failed" | "cancelled";
	outcome?: {
		video_url?: string;
		media_urls?: Array<{ id: string; url: string }>;
		thumbnail_image_url?: string;
		error?: string;
		error_code?: number;
		error_source?: string;
	} | null;
	error?: string;
}

const FAL_TRUSTED_HOSTS = [".fal.run", ".fal.ai"];

/** Validate that a URL belongs to a trusted FAL domain before sending auth headers. */
function isTrustedFalUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return FAL_TRUSTED_HOSTS.some((host) => parsed.hostname.endsWith(host));
	} catch {
		return false;
	}
}
const FAL_STORAGE_INITIATE =
	"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

const MIME_TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".mpeg": "video/mpeg",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
};

/**
 * Upload a local file to FAL CDN storage.
 * Returns the public file URL that can be used in FAL API requests.
 */
export async function uploadToFalStorage(
	filePath: string
): Promise<{ success: boolean; url?: string; error?: string }> {
	try {
		const filename = path.basename(filePath);
		const ext = path.extname(filePath).toLowerCase();
		const contentType = MIME_TYPES[ext] || "application/octet-stream";

		// Proxy mode: server vends the signed URL (key never leaves server)
		const useProxy = await isProxyAvailable();
		const apiKey = useProxy ? "" : await getApiKey("fal");

		if (!useProxy && !apiKey) {
			return { success: false, error: "No FAL API key configured" };
		}

		let uploadUrl: string;
		let fileUrl: string;

		if (useProxy) {
			const urls = await proxyUploadUrl({
				fileName: filename,
				contentType,
			});
			uploadUrl = urls.uploadUrl;
			fileUrl = urls.fileUrl;
		} else {
			const initRes = await fetch(FAL_STORAGE_INITIATE, {
				method: "POST",
				headers: {
					Authorization: `Key ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					file_name: filename,
					content_type: contentType,
				}),
			});

			if (!initRes.ok) {
				return {
					success: false,
					error: `FAL upload initiate failed: ${initRes.status}`,
				};
			}

			const initData = (await initRes.json()) as {
				upload_url?: string;
				file_url?: string;
			};
			if (!initData.upload_url || !initData.file_url) {
				return { success: false, error: "FAL API did not return upload URLs" };
			}
			uploadUrl = initData.upload_url;
			fileUrl = initData.file_url;
		}

		// Step 2: Read file and PUT to signed URL
		let fileBuffer: Buffer;
		try {
			fileBuffer = fs.readFileSync(filePath);
		} catch (err) {
			return {
				success: false,
				error: `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
			};
		}

		const uploadRes = await fetch(uploadUrl, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: fileBuffer,
		});

		if (!uploadRes.ok) {
			return {
				success: false,
				error: `FAL upload failed: ${uploadRes.status}`,
			};
		}

		return { success: true, url: fileUrl };
	} catch (err) {
		return {
			success: false,
			error: `FAL upload error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

export { GEMINI_BASE, OPENROUTER_BASE, VOLCENGINE_BASE };

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const GMI_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_RETRIES = 2;

export { getAdaptivePollInterval };

/** Resolve API key from environment variables only (no Electron dependency). */
export function envApiKeyProvider(provider: ProviderName): Promise<string> {
	switch (provider) {
		case "fal":
			return Promise.resolve(
				process.env.FAL_KEY || process.env.FAL_API_KEY || ""
			);
		case "elevenlabs":
			return Promise.resolve(process.env.ELEVENLABS_API_KEY || "");
		case "google":
			return Promise.resolve(
				process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ""
			);
		case "openrouter":
			return Promise.resolve(process.env.OPENROUTER_API_KEY || "");
		case "volcengine":
			return Promise.resolve(process.env.ARK_API_KEY || "");
		case "gmi":
		case "gmi-llm":
			return Promise.resolve(process.env.GMI_API_KEY || "");
		case "runway":
			return Promise.resolve(process.env.RUNWAY_API_KEY || "");
	}
}

/** Default provider: tries Electron encrypted storage, then falls back to env vars. */
async function defaultApiKeyProvider(provider: ProviderName): Promise<string> {
	try {
		const { getDecryptedApiKeys } = await import("../../api-key-handler.js");
		const keys = await getDecryptedApiKeys();
		switch (provider) {
			case "fal":
				return (
					process.env.FAL_KEY || process.env.FAL_API_KEY || keys.falApiKey || ""
				);
			case "elevenlabs":
				return process.env.ELEVENLABS_API_KEY || keys.elevenLabsApiKey || "";
			case "google":
				return (
					process.env.GEMINI_API_KEY ||
					process.env.GOOGLE_AI_API_KEY ||
					keys.geminiApiKey ||
					""
				);
			case "openrouter":
				return process.env.OPENROUTER_API_KEY || keys.openRouterApiKey || "";
			case "volcengine":
				return process.env.ARK_API_KEY || "";
			case "gmi":
			case "gmi-llm":
				return process.env.GMI_API_KEY || keys.gmiApiKey || "";
			case "runway":
				return process.env.RUNWAY_API_KEY || keys.runwayApiKey || "";
		}
	} catch {
		// Not in Electron — fall through to env vars
	}
	return envApiKeyProvider(provider);
}

let activeKeyProvider: ApiKeyProvider = defaultApiKeyProvider;

/** Override the API key provider (e.g., for CLI use with env-var-only provider). */
export function setApiKeyProvider(provider: ApiKeyProvider): void {
	activeKeyProvider = provider;
}

/** Resolve the API key for a provider using the currently active key provider. */
async function getApiKey(provider: ProviderName): Promise<string> {
	return activeKeyProvider(provider);
}

/** Build provider-specific HTTP headers for outbound API requests. */
function buildHeaders(
	provider: ApiCallOptions["provider"],
	apiKey: string
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	switch (provider) {
		case "fal":
			headers.Authorization = `Key ${apiKey}`;
			break;
		case "elevenlabs":
			headers["xi-api-key"] = apiKey;
			break;
		case "google":
			headers["x-goog-api-key"] = apiKey;
			break;
		case "openrouter":
			headers.Authorization = `Bearer ${apiKey}`;
			break;
		case "volcengine":
			headers.Authorization = `Bearer ${apiKey}`;
			break;
		case "gmi":
		case "gmi-llm":
			headers.Authorization = `Bearer ${apiKey}`;
			break;
		case "runway":
			headers.Authorization = `Bearer ${apiKey}`;
			headers["X-Runway-Version"] = "2024-11-06";
			break;
	}
	return headers;
}

/** Build a fully qualified provider URL from a logical endpoint path. */
function buildUrl(
	provider: ApiCallOptions["provider"],
	endpoint: string
): string {
	return buildProviderUrl(provider, endpoint);
}

/**
 * Execute fetch with retry/backoff for transient failures.
 *
 * Retries network errors and 5xx responses up to `retries` attempts.
 */
async function fetchWithRetry(
	url: string,
	init: RequestInit,
	retries: number
): Promise<Response> {
	let lastError: Error | null = null;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetch(url, init);
			if (response.ok || attempt === retries) {
				return response;
			}
			if (response.status >= 500) {
				lastError = new Error(
					`Server error ${response.status}: ${response.statusText}`
				);
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
				continue;
			}
			return response;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < retries) {
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}
	}
	throw lastError ?? new Error("Fetch failed");
}

/**
 * Poll FAL queue state until completion, failure, or cancellation.
 *
 * Uses only trusted URLs for status/result polling.
 */
export async function pollQueueStatus(
	requestId: string,
	endpoint: string,
	options?: {
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
		statusUrl?: string;
		responseUrl?: string;
	}
): Promise<ApiCallResult> {
	const startTime = Date.now();
	const apiKey = await getApiKey("fal");
	const headers = buildHeaders("fal", apiKey);

	const defaultStatusUrl = `${FAL_STATUS_BASE}/${endpoint}/requests/${requestId}/status`;
	const defaultResultUrl = `${FAL_STATUS_BASE}/${endpoint}/requests/${requestId}`;
	const statusUrl =
		options?.statusUrl && isTrustedFalUrl(options.statusUrl)
			? options.statusUrl
			: defaultStatusUrl;
	const resultUrl =
		options?.responseUrl && isTrustedFalUrl(options.responseUrl)
			? options.responseUrl
			: defaultResultUrl;

	let lastPercent = 0;

	while (true) {
		if (options?.signal?.aborted) {
			return {
				success: false,
				error: "Cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const statusRes = await fetch(statusUrl, {
			headers,
			signal: options?.signal,
		});
		if (!statusRes.ok) {
			return {
				success: false,
				error: `Queue status check failed: ${statusRes.status}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const status = (await statusRes.json()) as FalStatusResponse;

		if (status.status === "COMPLETED") {
			const candidateUrl = status.response_url || resultUrl;
			const fetchUrl = isTrustedFalUrl(candidateUrl) ? candidateUrl : resultUrl;
			if (status.response_url && !isTrustedFalUrl(status.response_url)) {
				console.warn(
					`[api-caller] Ignoring untrusted response_url in poll: ${status.response_url}`
				);
			}
			const resultRes = await fetch(fetchUrl, {
				headers,
				signal: options?.signal,
			});
			if (!resultRes.ok) {
				return {
					success: false,
					error: `Failed to fetch result: ${resultRes.status}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}
			const data = await resultRes.json();
			return {
				success: true,
				data,
				outputUrl: extractOutputUrl(data),
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (status.status === "FAILED") {
			const errorMsg =
				status.logs?.map((l) => l.message).join("; ") || "Generation failed";
			return {
				success: false,
				error: errorMsg,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (status.status === "IN_PROGRESS" && options?.onProgress) {
			lastPercent = Math.min(lastPercent + 5, 90);
			options.onProgress(lastPercent, `Processing... (${status.status})`);
		}

		const interval = getAdaptivePollInterval(Date.now() - startTime);
		await new Promise((r) => setTimeout(r, interval));
	}
}

/**
 * Poll a GMI Cloud request until completion or failure.
 *
 * GMI uses a single GET endpoint for both status and result:
 *   GET /requests/{requestId} → { status, outcome?, error? }
 */
async function pollGmiQueue(
	requestId: string,
	options?: {
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
	}
): Promise<ApiCallResult> {
	const startTime = Date.now();
	const apiKey = await getApiKey("gmi");
	const headers = buildHeaders("gmi", apiKey);
	const statusUrl = `https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests/${requestId}`;

	const maxAttempts = 360;
	let lastPercent = 0;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (options?.signal?.aborted) {
			return {
				success: false,
				error: "Cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const statusRes = await fetch(statusUrl, {
			method: "GET",
			headers,
			signal: options?.signal,
		});

		if (!statusRes.ok) {
			return {
				success: false,
				error: `GMI status check failed: ${statusRes.status}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const status = (await statusRes.json()) as GmiStatusResponse;

		if (status.status === "success") {
			if (options?.onProgress) {
				options.onProgress(100, "Completed");
			}
			const videoUrl =
				status.outcome?.video_url || status.outcome?.media_urls?.[0]?.url;
			return {
				success: true,
				data: status,
				outputUrl: videoUrl,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (status.status === "failed" || status.status === "cancelled") {
			const errorMsg =
				status.error ||
				(status.outcome as Record<string, unknown>)?.error ||
				`Generation ${status.status}`;
			return {
				success: false,
				error: String(errorMsg),
				duration: (Date.now() - startTime) / 1000,
			};
		}

		if (options?.onProgress) {
			lastPercent = Math.min(lastPercent + 5, 90);
			options.onProgress(lastPercent, `${status.status}...`);
		}

		const interval = getAdaptivePollInterval(Date.now() - startTime);
		await new Promise((r) => setTimeout(r, interval));
	}

	return {
		success: false,
		error: `GMI request ${requestId} timed out after ${maxAttempts} attempts`,
		duration: (Date.now() - startTime) / 1000,
	};
}

export { extractOutputUrl };

/**
 * Call a provider endpoint and normalize the result payload.
 *
 * For FAL async endpoints, handles queue submission and polling.
 */
export async function callModelApi(
	options: ApiCallOptions
): Promise<ApiCallResult> {
	const startTime = Date.now();
	const {
		endpoint,
		payload,
		provider,
		timeoutMs = provider === "gmi" ? GMI_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
		retries = DEFAULT_RETRIES,
		signal,
	} = options;

	const apiKey = await getApiKey(provider);
	const useProxy = !apiKey && (await isProxyAvailable());

	if (!apiKey && !useProxy) {
		return {
			success: false,
			error: `No API key configured for provider: ${provider}`,
			duration: 0,
		};
	}

	// ── Proxy mode: route through license server ──
	if (useProxy) {
		const credits = options.modelKey
			? estimateProxyCredits(options.modelKey, options.payload)
			: undefined;
		return callModelApiViaProxy({ ...options, credits }, startTime);
	}

	const headers = buildHeaders(provider, apiKey);
	const url = buildUrl(provider, endpoint);

	const controller = new AbortController();
	const combinedSignal = signal
		? AbortSignal.any([signal, controller.signal])
		: controller.signal;

	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		if (provider === "fal" && options.async !== false) {
			const queueRes = await fetchWithRetry(
				url,
				{
					method: "POST",
					headers,
					body: JSON.stringify(payload),
					signal: combinedSignal,
				},
				retries
			);

			if (!queueRes.ok) {
				const errorText = await queueRes.text();
				return {
					success: false,
					error: `FAL API error ${queueRes.status}: ${errorText}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}

			const queueData = (await queueRes.json()) as FalQueueResponse;

			// If queue already completed (sync response), extract result directly
			if (queueData.status === "COMPLETED" && !queueData.request_id) {
				return {
					success: true,
					data: queueData,
					outputUrl: extractOutputUrl(queueData),
					duration: (Date.now() - startTime) / 1000,
				};
			}

			if (queueData.request_id) {
				// If already completed with request_id, fetch result directly
				if (queueData.status === "COMPLETED" && queueData.response_url) {
					if (isTrustedFalUrl(queueData.response_url)) {
						try {
							const resultRes = await fetch(queueData.response_url, {
								headers,
								signal: combinedSignal,
							});
							if (resultRes.ok) {
								const data = await resultRes.json();
								return {
									success: true,
									data,
									outputUrl: extractOutputUrl(data),
									duration: (Date.now() - startTime) / 1000,
								};
							}
							console.warn(
								`[api-caller] response_url fetch failed (${resultRes.status}), falling back to polling`
							);
						} catch (fetchErr) {
							console.warn(
								`[api-caller] response_url fetch error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}, falling back to polling`
							);
						}
					} else {
						console.warn(
							`[api-caller] Skipping untrusted response_url: ${queueData.response_url}`
						);
					}
				}

				return pollQueueStatus(queueData.request_id, endpoint, {
					onProgress: options.onProgress,
					signal: combinedSignal,
					statusUrl: queueData.status_url,
					responseUrl: queueData.response_url,
				});
			}

			return {
				success: true,
				data: queueData,
				outputUrl: extractOutputUrl(queueData),
				duration: (Date.now() - startTime) / 1000,
			};
		} else if (provider === "gmi" || provider === "gmi-llm") {
			// GMI Cloud: async submit + poll (like FAL but different API shape)
			const submitPayload =
				endpoint && endpoint !== "requests"
					? { model: endpoint, payload }
					: payload;

			const submitRes = await fetchWithRetry(
				url,
				{
					method: "POST",
					headers,
					body: JSON.stringify(submitPayload),
					signal: combinedSignal,
				},
				retries
			);

			if (!submitRes.ok) {
				const errorText = await submitRes.text();
				return {
					success: false,
					error: `GMI API error ${submitRes.status}: ${errorText}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}

			const submitData = (await submitRes.json()) as {
				id?: string;
				request_id?: string;
			};
			const requestId = submitData.request_id || submitData.id;
			if (!requestId) {
				return {
					success: false,
					error: "GMI submit did not return a request ID",
					duration: (Date.now() - startTime) / 1000,
				};
			}

			return pollGmiQueue(requestId, {
				onProgress: options.onProgress,
				signal: combinedSignal,
			});
		}

		const response = await fetchWithRetry(
			url,
			{
				method: "POST",
				headers,
				body: JSON.stringify(payload),
				signal: combinedSignal,
			},
			retries
		);

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `API error ${response.status}: ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = await response.json();
		return {
			success: true,
			data,
			outputUrl: extractOutputUrl(data),
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: msg.includes("aborted") ? "Cancelled" : msg,
			duration: (Date.now() - startTime) / 1000,
		};
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Download an output artifact URL to a local file path.
 *
 * Ensures the destination directory exists before streaming bytes.
 */
export async function downloadOutput(
	url: string,
	outputPath: string
): Promise<string> {
	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Download failed: ${response.status} ${response.statusText}`
		);
	}

	if (!response.body) {
		throw new Error("No response body for download");
	}

	const fileStream = fs.createWriteStream(outputPath);
	// Web ReadableStream vs Node.js stream type mismatch workaround
	await pipeline(Readable.fromWeb(response.body as any), fileStream);
	return outputPath;
}
