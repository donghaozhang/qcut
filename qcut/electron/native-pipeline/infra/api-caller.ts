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

export interface ElevenLabsSpeechToTextOptions {
	endpoint: string;
	audioInput: string;
	payload: Record<string, unknown>;
	signal?: AbortSignal;
	timeoutMs?: number;
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

/**
 * Emits an OpenRouter video debug log line when `QCUT_DEBUG_OPENROUTER_VIDEO=1`.
 *
 * @param message - The debug message.
 * @param metadata - Optional metadata (or a lazy factory evaluated only when logging is on).
 */
function logOpenRouterVideoDebug({
	message,
	metadata,
}: {
	message: string;
	metadata?: Record<string, unknown> | (() => Record<string, unknown>);
}): void {
	if (process.env.QCUT_DEBUG_OPENROUTER_VIDEO !== "1") return;
	const value = typeof metadata === "function" ? metadata() : metadata;
	const suffix = value ? ` ${JSON.stringify(value)}` : "";
	console.warn(`[openrouter-video-debug] ${message}${suffix}`);
}

/**
 * Starts a periodic "still waiting" heartbeat for long-running OpenRouter calls.
 *
 * The heartbeat is a no-op for non-OpenRouter providers or when disabled via
 * `QCUT_OPENROUTER_HEARTBEAT=0`.
 *
 * @param provider - The provider servicing the request.
 * @param stage - Human-readable stage label included in the heartbeat message.
 * @param modelKey - Optional model identifier included in the message.
 * @param startTime - Epoch ms when the request started, used to compute elapsed time.
 * @param timeoutMs - Configured request timeout, reported in the message.
 * @param onProgress - Optional progress callback invoked on each heartbeat.
 * @returns A cleanup function that stops the heartbeat timer.
 */
function startApiHeartbeat({
	provider,
	stage,
	modelKey,
	startTime,
	timeoutMs,
	onProgress,
}: {
	provider: ProviderName;
	stage: string;
	modelKey?: string;
	startTime: number;
	timeoutMs: number;
	onProgress?: (percent: number, message: string) => void;
}): () => void {
	if (provider !== "openrouter") return () => undefined;
	if (process.env.QCUT_OPENROUTER_HEARTBEAT === "0") return () => undefined;

	const timer = setInterval(() => {
		const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
		const timeoutSeconds = Math.round(timeoutMs / 1000);
		const modelSuffix = modelKey ? ` for ${modelKey}` : "";
		const message = `Still waiting for ${provider} ${stage}${modelSuffix}: ${elapsedSeconds}s elapsed, timeout ${timeoutSeconds}s`;
		onProgress?.(45, message);
		console.warn(`[api-caller] ${message}`);
	}, 30_000);

	return () => clearInterval(timer);
}

/**
 * Reads and JSON-parses a response body while emitting a waiting heartbeat.
 *
 * @param response - The fetch response whose body is read.
 * @param provider - The provider servicing the request.
 * @param modelKey - Optional model identifier for heartbeat messages.
 * @param startTime - Epoch ms when the request started.
 * @param timeoutMs - Configured request timeout.
 * @param onProgress - Optional progress callback for heartbeats.
 * @returns The parsed JSON body.
 */
async function readJsonResponseWithHeartbeat({
	response,
	provider,
	modelKey,
	startTime,
	timeoutMs,
	onProgress,
}: {
	response: Response;
	provider: ProviderName;
	modelKey?: string;
	startTime: number;
	timeoutMs: number;
	onProgress?: (percent: number, message: string) => void;
}): Promise<unknown> {
	logOpenRouterVideoDebug({
		message: "reading direct API response body",
		metadata: {
			provider,
			status: response.status,
			contentLength: response.headers.get("content-length"),
			contentType: response.headers.get("content-type"),
		},
	});
	const stopBodyHeartbeat = startApiHeartbeat({
		provider,
		stage: "response body",
		modelKey,
		startTime,
		timeoutMs,
		onProgress,
	});
	let bodyText: string;
	try {
		bodyText = await response.text();
	} finally {
		stopBodyHeartbeat();
	}
	logOpenRouterVideoDebug({
		message: "direct API response body received",
		metadata: {
			provider,
			bodyChars: bodyText.length,
			elapsedMs: Date.now() - startTime,
		},
	});
	return JSON.parse(bodyText);
}

interface ImaRouterSubmitResponse {
	task_id?: string;
	id?: string;
	data?: {
		task_id?: string;
		id?: string;
	};
	code?: number | string;
	message?: string;
}

interface ImaRouterStatusResponse {
	code?: string;
	data?: {
		task_id?: string;
		status?:
			| "queued"
			| "processing"
			| "succeeded"
			| "completed"
			| "failed"
			| "error"
			| string;
		format?: string;
		url?: string;
		error?: { code?: number | string; message?: string } | string | null;
		metadata?: unknown;
		amount_usd?: number;
		usage?: unknown;
	};
	status?: "queued" | "in_progress" | "completed" | "failed" | string;
	progress?: number;
	results?: Array<{ url?: string }>;
	error?: { code?: number | string; message?: string } | string;
	message?: string;
}

const FAL_TRUSTED_HOSTS = [".fal.run", ".fal.ai"];

/**
 * Strip caller-supplied text out of a provider error body so a failure
 * log never echoes a prompt or reference URL back to disk. Keeps JSON
 * status codes and short error slugs, elides anything long.
 */
function redactErrorPreview(body: string): string {
	const trimmed = body.trim();
	if (trimmed.length === 0) return "";
	try {
		const parsed = JSON.parse(trimmed) as Record<string, unknown>;
		const code =
			typeof parsed.error_code === "number"
				? String(parsed.error_code)
				: typeof parsed.code === "string"
					? parsed.code
					: undefined;
		const source =
			typeof parsed.error_source === "string" ? parsed.error_source : undefined;
		const label = [code, source].filter(Boolean).join(" / ");
		return label ? `[${label}]` : "[provider error body redacted]";
	} catch {
		return `[provider error body redacted; ${trimmed.length} bytes]`;
	}
}

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
	".aac": "audio/aac",
	".flac": "audio/flac",
	".m4a": "audio/mp4",
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
 * Resolves a MIME content type from a file path's extension.
 *
 * @param filePath - The file path to inspect.
 * @returns The matching MIME type, defaulting to `application/octet-stream`.
 */
function getContentTypeForPath(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Derives a filename from a local path or remote URL.
 *
 * @param input - A local file path or `http(s)` URL.
 * @returns The basename, falling back to `"audio"` when none can be derived.
 */
function filenameFromInput({ input }: { input: string }): string {
	if (!/^https?:\/\//i.test(input)) return path.basename(input);
	try {
		const url = new URL(input);
		const name = path.basename(url.pathname);
		return name || "audio";
	} catch {
		return "audio";
	}
}

/**
 * Appends a single field to a speech-to-text multipart form.
 *
 * Skips null/undefined values and JSON-encodes arrays and objects.
 *
 * @param form - The form to mutate.
 * @param key - The field name.
 * @param value - The field value to append.
 */
function appendSpeechToTextField({
	form,
	key,
	value,
}: {
	form: FormData;
	key: string;
	value: unknown;
}): void {
	if (value === undefined || value === null) return;
	if (Array.isArray(value)) {
		form.append(key, JSON.stringify(value));
		return;
	}
	if (typeof value === "object") {
		form.append(key, JSON.stringify(value));
		return;
	}
	form.append(key, String(value));
}

/**
 * Loads an audio input into a {@link Blob}, fetching remote URLs or reading local files.
 *
 * @param audioInput - A local file path or `http(s)` URL.
 * @param signal - Optional abort signal for the remote fetch.
 * @returns The audio blob and its derived filename.
 * @throws If a remote URL cannot be fetched.
 */
async function buildAudioBlob({
	audioInput,
	signal,
}: {
	audioInput: string;
	signal?: AbortSignal;
}): Promise<{ blob: Blob; filename: string }> {
	if (/^https?:\/\//i.test(audioInput)) {
		const response = await fetch(audioInput, { signal });
		if (!response.ok) {
			throw new Error(`Failed to fetch audio URL: ${response.status}`);
		}
		const contentType =
			response.headers.get("content-type") || getContentTypeForPath(audioInput);
		const bytes = await response.arrayBuffer();
		return {
			blob: new Blob([bytes], { type: contentType }),
			filename: filenameFromInput({ input: audioInput }),
		};
	}

	const fileBytes = fs.readFileSync(audioInput);
	return {
		blob: new Blob([new Uint8Array(fileBytes)], {
			type: getContentTypeForPath(audioInput),
		}),
		filename: filenameFromInput({ input: audioInput }),
	};
}

/**
 * Builds the multipart form for an ElevenLabs speech-to-text request.
 *
 * Sets the audio file and `model_id` (default `scribe_v2`), maps `language` to
 * `language_code`, and appends the remaining payload fields.
 *
 * @param audio - The audio blob and filename to upload.
 * @param payload - Additional request parameters.
 * @returns The assembled {@link FormData}.
 */
function buildElevenLabsSpeechToTextForm({
	audio,
	payload,
}: {
	audio: { blob: Blob; filename: string };
	payload: Record<string, unknown>;
}): FormData {
	const form = new FormData();
	form.append("file", audio.blob, audio.filename);
	form.append("model_id", String(payload.model_id ?? "scribe_v2"));

	const payloadFields = { ...payload };
	delete payloadFields.model_id;
	if (
		typeof payloadFields.language === "string" &&
		typeof payloadFields.language_code !== "string"
	) {
		payloadFields.language_code = payloadFields.language;
	}
	delete payloadFields.language;

	for (const [key, value] of Object.entries(payloadFields)) {
		appendSpeechToTextField({ form, key, value });
	}
	return form;
}

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
		const apiKey = await getApiKey("fal");

		if (!useProxy && !apiKey) {
			return { success: false, error: "No FAL API key configured" };
		}

		let uploadUrl: string;
		let fileUrl: string;

		if (useProxy) {
			try {
				const urls = await proxyUploadUrl({
					fileName: filename,
					contentType,
				});
				uploadUrl = urls.uploadUrl;
				fileUrl = urls.fileUrl;
			} catch (error) {
				if (!apiKey) throw error;
				console.warn(
					`[api-caller] Proxy upload URL failed (${error instanceof Error ? error.message : String(error)}); falling back to local FAL_KEY`
				);
				const urls = await createFalUploadUrls({
					filename,
					contentType,
					apiKey,
				});
				uploadUrl = urls.uploadUrl;
				fileUrl = urls.fileUrl;
			}
		} else {
			const urls = await createFalUploadUrls({
				filename,
				contentType,
				apiKey,
			});
			uploadUrl = urls.uploadUrl;
			fileUrl = urls.fileUrl;
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

/**
 * Vend FAL storage upload URLs directly via the FAL API using a local key
 * (the BYOK fallback when the proxy path is unavailable). The initiate POST is
 * bounded by a 15s timeout. Throws if FAL doesn't return both URLs.
 */
async function createFalUploadUrls({
	filename,
	contentType,
	apiKey,
}: {
	filename: string;
	contentType: string;
	apiKey: string;
}): Promise<{ uploadUrl: string; fileUrl: string }> {
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
		signal: AbortSignal.timeout(15_000),
	});

	if (!initRes.ok) {
		throw new Error(`FAL upload initiate failed: ${initRes.status}`);
	}

	const initData = (await initRes.json()) as {
		upload_url?: string;
		file_url?: string;
	};
	if (!initData.upload_url || !initData.file_url) {
		throw new Error("FAL API did not return upload URLs");
	}
	return { uploadUrl: initData.upload_url, fileUrl: initData.file_url };
}

export { GEMINI_BASE, OPENROUTER_BASE, VOLCENGINE_BASE };

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const GMI_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_RETRIES = 3;
const IMAROUTER_IMAGE_GENERATIONS_PATH = "v1/images/generations";
const IMAROUTER_VIDEO_GENERATIONS_PATH = "v1/videos";

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
		case "imarouter":
			return Promise.resolve(process.env.IMAROUTER_API_KEY || "");
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
			case "imarouter":
				// `keys.imarouterApiKey` is read defensively — older encrypted-store
				// blobs don't have the field, and accessing it via the typed accessor
				// returns undefined which the `||` chain handles.
				return (
					process.env.IMAROUTER_API_KEY ||
					(keys as { imarouterApiKey?: string }).imarouterApiKey ||
					""
				);
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
		case "imarouter":
			headers.Authorization = `Bearer ${apiKey}`;
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
 * Retries network errors, 429 (rate limit), and 5xx responses up to `retries` attempts.
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
			if (response.status === 429 || response.status >= 500) {
				const delay =
					response.status === 429
						? 5000 * 2 ** attempt // 429: exponential backoff (5s, 10s, 20s, 40s)
						: 1000 * (attempt + 1); // 5xx: linear backoff
				lastError = new Error(
					`API error ${response.status}: ${response.statusText}`
				);
				await new Promise((r) => setTimeout(r, delay));
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
				const body = await resultRes.text().catch(() => "");
				// Provider error bodies can echo the caller's prompt; log the
				// status + byte count only and surface a redacted preview in
				// the returned error so downstream traces stay PII-free.
				console.error(
					`[api-caller] Result fetch ${resultRes.status} at ${fetchUrl} (${body.length} bytes)`
				);
				return {
					success: false,
					error: `Failed to fetch result: ${resultRes.status}${body ? ` — ${redactErrorPreview(body)}` : ""}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}
			const data = await resultRes.json();
			const extracted = extractOutputUrl(data);
			// Guard against FAL COMPLETED-with-error envelope ({detail:[...]}) —
			// without this the caller treats downstream failures as success.
			if (
				!extracted &&
				data &&
				typeof data === "object" &&
				Array.isArray((data as Record<string, unknown>).detail)
			) {
				const detail = (data as Record<string, unknown>)
					.detail as Array<unknown>;
				const first = detail[0];
				const firstMsg =
					typeof first === "string"
						? first
						: (((first as Record<string, unknown>)?.msg as string) ??
							((first as Record<string, unknown>)?.type as string) ??
							"Unknown error");
				return {
					success: false,
					error: `FAL returned error: ${String(firstMsg)} — full payload: ${JSON.stringify(data).slice(0, 300)}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}
			return {
				success: true,
				data,
				outputUrl: extracted,
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
			return {
				success: true,
				data: status,
				outputUrl: extractOutputUrl(status.outcome ?? status),
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

const IMAROUTER_MAX_POLL_MS = 30 * 60 * 1000; // 30 min ceiling

/**
 * Returns the status payload object from an IMA Router response.
 *
 * Prefers the nested `data` object and falls back to the top-level response.
 *
 * @param status - The IMA Router status response.
 * @returns The payload record to read status/error fields from.
 */
function getImaRouterStatusPayload(
	status: ImaRouterStatusResponse
): Record<string, unknown> {
	const data = status.data;
	if (data && typeof data === "object") return data as Record<string, unknown>;
	return status as Record<string, unknown>;
}

/**
 * Extracts the normalized (lowercased) task status from an IMA Router response.
 *
 * @param status - The IMA Router status response.
 * @returns The status string in lower case, or an empty string if absent.
 */
function getImaRouterStatus(status: ImaRouterStatusResponse): string {
	const payload = getImaRouterStatusPayload(status);
	return String(payload.status ?? status.status ?? "").toLowerCase();
}

/**
 * Extracts a human-readable error message from a failed IMA Router response.
 *
 * @param status - The IMA Router status response.
 * @returns The error string, nested error message, top-level message, or `"task failed"`.
 */
function getImaRouterErrorMessage(status: ImaRouterStatusResponse): string {
	const payload = getImaRouterStatusPayload(status);
	const error = payload.error ?? status.error;
	if (typeof error === "string") return error;
	if (error && typeof error === "object") {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	return status.message ?? "task failed";
}

/**
 * Poll an IMA Router video task until completion, failure, or timeout.
 *
 * Shape:
 *   submit:  POST /v1/videos                  → { task_id }
 *   poll:    GET  /v1/videos/{task_id}        → { status, progress, results: [{ url }] }
 *
 * Mirrors the GMI poller but reads IMA Router's lowercase status enum
 * (`queued | in_progress | completed | failed`) and surfaces error
 * payloads when the task ends in `failed`.
 */
type ImaRouterTaskKind = "video" | "image";

/**
 * Polls an IMA Router task endpoint until it completes, fails, or is cancelled.
 *
 * @param taskId - The IMA Router task identifier to poll.
 * @param taskPath - The status endpoint path for the task kind.
 * @param kind - Whether the task produces an image or video, used to shape the result.
 * @param options - Optional progress and cancellation hooks.
 * @returns The final API call result for the task.
 */
async function pollImaRouterGenericTask(
	taskId: string,
	taskPath: string,
	kind: ImaRouterTaskKind,
	options?: {
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
	}
): Promise<ApiCallResult> {
	const startTime = Date.now();
	const apiKey = await getApiKey("imarouter");
	const headers = buildHeaders("imarouter", apiKey);
	const statusUrl = buildProviderUrl("imarouter", `${taskPath}/${taskId}`);
	const kindLabel = kind === "image" ? "image " : "";

	let lastPercent = -1;
	while (Date.now() - startTime < IMAROUTER_MAX_POLL_MS) {
		if (options?.signal?.aborted) {
			return {
				success: false,
				error: "Cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const res = await fetch(statusUrl, { headers, signal: options?.signal });
		if (!res.ok) {
			const body = await res.text();
			return {
				success: false,
				error: `IMA Router ${kindLabel}status error ${res.status}: ${redactErrorPreview(body)}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const status = (await res.json()) as ImaRouterStatusResponse;
		const payload = getImaRouterStatusPayload(status);
		const state = getImaRouterStatus(status);
		const percent =
			typeof status.progress === "number"
				? Math.max(0, Math.min(100, Math.round(status.progress)))
				: state === "succeeded" || state === "completed"
					? 100
					: lastPercent;
		if (options?.onProgress && percent !== lastPercent) {
			lastPercent = percent;
			options.onProgress(percent, state || "processing");
		}

		if (state === "completed" || state === "succeeded") {
			return {
				success: true,
				data: status,
				outputUrl: extractOutputUrl(payload) ?? extractOutputUrl(status),
				duration: (Date.now() - startTime) / 1000,
			};
		}
		if (state === "failed" || state === "error") {
			return {
				success: false,
				error: `IMA Router ${kindLabel}task ${taskId} failed: ${getImaRouterErrorMessage(status)}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const interval = getAdaptivePollInterval(Date.now() - startTime);
		await new Promise((r) => setTimeout(r, interval));
	}

	return {
		success: false,
		error: `IMA Router ${kindLabel}task ${taskId} timed out after ${IMAROUTER_MAX_POLL_MS / 1000}s`,
		duration: (Date.now() - startTime) / 1000,
	};
}

/**
 * Polls an IMA Router video-generation task to completion.
 *
 * @param taskId - The IMA Router task identifier.
 * @param options - Optional progress and cancellation hooks.
 * @returns The final API call result for the video task.
 */
async function pollImaRouterTask(
	taskId: string,
	options?: {
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
	}
): Promise<ApiCallResult> {
	return pollImaRouterGenericTask(
		taskId,
		IMAROUTER_VIDEO_GENERATIONS_PATH,
		"video",
		options
	);
}

/**
 * Polls an IMA Router image-generation task to completion.
 *
 * @param taskId - The IMA Router task identifier.
 * @param options - Optional progress and cancellation hooks.
 * @returns The final API call result for the image task.
 */
async function pollImaRouterImageTask(
	taskId: string,
	options?: {
		onProgress?: (percent: number, message: string) => void;
		signal?: AbortSignal;
	}
): Promise<ApiCallResult> {
	return pollImaRouterGenericTask(
		taskId,
		IMAROUTER_IMAGE_GENERATIONS_PATH,
		"image",
		options
	);
}

export { extractOutputUrl, pollImaRouterTask, pollImaRouterImageTask };

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
		timeoutMs = provider === "gmi" || provider === "imarouter"
			? GMI_TIMEOUT_MS
			: DEFAULT_TIMEOUT_MS,
		retries = DEFAULT_RETRIES,
		signal,
	} = options;

	const apiKey = await getApiKey(provider);
	const proxyAvailable = await isProxyAvailable();

	if (!apiKey && !proxyAvailable) {
		return {
			success: false,
			error: `No API key configured for provider: ${provider}`,
			duration: 0,
		};
	}

	// ── Proxy-first: route through license server when user is logged in.
	// Falls back to the local provider key only when the proxy call fails
	// AND a local key is present. Users without a local key still get the
	// proxy result (success or error) surfaced directly.
	// Timeout pass-through preserves the GMI-aware envelope — long-running
	// GMI ops (kling-create-element, ~5 min) would otherwise abort at the
	// proxy-client default. `retries` is intentionally not forwarded: the
	// proxy has its own fixed retry budget (PROXY_RETRIES).
	if (proxyAvailable) {
		const credits = options.modelKey
			? estimateProxyCredits(options.modelKey, options.payload)
			: undefined;
		logOpenRouterVideoDebug({
			message: "calling proxy",
			metadata: () => ({
				provider,
				modelKey: options.modelKey,
				timeoutMs,
				payloadChars: JSON.stringify(payload).length,
			}),
		});
		const stopProxyHeartbeat = startApiHeartbeat({
			provider,
			stage: "proxy",
			modelKey: options.modelKey,
			startTime,
			timeoutMs,
			onProgress: options.onProgress,
		});
		let proxyResult: ApiCallResult;
		try {
			proxyResult = await callModelApiViaProxy(
				{ ...options, credits, timeoutMs },
				startTime
			);
		} finally {
			stopProxyHeartbeat();
		}
		logOpenRouterVideoDebug({
			message: "proxy returned",
			metadata: {
				success: proxyResult.success,
				error: proxyResult.error,
				duration: proxyResult.duration,
			},
		});
		if (proxyResult.success || !apiKey) {
			return proxyResult;
		}
		console.warn(
			`[api-caller] Proxy call failed for ${provider} (${proxyResult.error}); falling back to local ${provider.toUpperCase()}_KEY`
		);
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
		} else if (provider === "gmi") {
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
		} else if (provider === "imarouter") {
			// IMA Router: POST the full payload (no GMI-style { model, payload }
			// envelope). Videos and images share the `{ id | task_id }` async task
			// shape but use different polling paths.
			const submitRes = await fetchWithRetry(
				url,
				{
					method: "POST",
					headers,
					body: JSON.stringify(payload),
					signal: combinedSignal,
				},
				retries
			);

			if (!submitRes.ok) {
				const body = await submitRes.text();
				return {
					success: false,
					error: `IMA Router submit error ${submitRes.status}: ${redactErrorPreview(body)}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}

			const submitData = (await submitRes.json()) as ImaRouterSubmitResponse;
			const taskId =
				submitData.task_id ||
				submitData.id ||
				submitData.data?.task_id ||
				submitData.data?.id;
			if (!taskId) {
				return {
					success: false,
					error: `IMA Router submit did not return a task id: ${submitData.message ?? JSON.stringify(submitData)}`,
					duration: (Date.now() - startTime) / 1000,
				};
			}

			const pollOptions = {
				onProgress: options.onProgress,
				signal: combinedSignal,
			};
			if (endpoint.replace(/^\/+/, "") === IMAROUTER_IMAGE_GENERATIONS_PATH) {
				return pollImaRouterImageTask(taskId, pollOptions);
			}
			return pollImaRouterTask(taskId, pollOptions);
		}

		logOpenRouterVideoDebug({
			message: "calling direct API",
			metadata: () => ({
				provider,
				url,
				timeoutMs,
				retries,
				payloadChars: JSON.stringify(payload).length,
			}),
		});
		const stopDirectHeartbeat = startApiHeartbeat({
			provider,
			stage: "direct API",
			modelKey: options.modelKey,
			startTime,
			timeoutMs,
			onProgress: options.onProgress,
		});
		let response: Response;
		try {
			response = await fetchWithRetry(
				url,
				{
					method: "POST",
					headers,
					body: JSON.stringify(payload),
					signal: combinedSignal,
				},
				retries
			);
		} finally {
			stopDirectHeartbeat();
		}
		logOpenRouterVideoDebug({
			message: "direct API response received",
			metadata: {
				provider,
				status: response.status,
				ok: response.ok,
				elapsedMs: Date.now() - startTime,
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `API error ${response.status}: ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		let data: unknown;
		try {
			data = await readJsonResponseWithHeartbeat({
				response,
				provider,
				modelKey: options.modelKey,
				startTime,
				timeoutMs,
				onProgress: options.onProgress,
			});
		} catch (error) {
			return {
				success: false,
				error: `Failed to read API response JSON: ${error instanceof Error ? error.message : String(error)}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}
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
 * Calls the ElevenLabs speech-to-text API and returns the transcription result.
 *
 * Loads the audio, builds the multipart form, and posts it with a timeout/abort guard.
 *
 * @param endpoint - The ElevenLabs endpoint identifier.
 * @param audioInput - A local path or `http(s)` URL to the audio to transcribe.
 * @param payload - Additional request parameters (model, language, etc.).
 * @param signal - Optional abort signal.
 * @param timeoutMs - Request timeout in milliseconds (defaults to the module default).
 * @returns The API call result containing the transcription.
 */
export async function callElevenLabsSpeechToText({
	endpoint,
	audioInput,
	payload,
	signal,
	timeoutMs = DEFAULT_TIMEOUT_MS,
}: ElevenLabsSpeechToTextOptions): Promise<ApiCallResult> {
	const startTime = Date.now();
	const apiKey = await getApiKey("elevenlabs");
	if (!apiKey) {
		return {
			success: false,
			error: "No API key configured for provider: elevenlabs",
			duration: 0,
		};
	}

	const controller = new AbortController();
	const combinedSignal = signal
		? AbortSignal.any([signal, controller.signal])
		: controller.signal;
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const audio = await buildAudioBlob({ audioInput, signal: combinedSignal });
		const form = buildElevenLabsSpeechToTextForm({ audio, payload });
		const response = await fetch(buildUrl("elevenlabs", endpoint), {
			method: "POST",
			headers: { "xi-api-key": apiKey },
			body: form,
			signal: combinedSignal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			return {
				success: false,
				error: `ElevenLabs API error ${response.status}: ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = await response.json();
		return {
			success: true,
			data,
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
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
