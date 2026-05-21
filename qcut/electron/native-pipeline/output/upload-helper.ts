/**
 * Upload a local file to provider-addressable HTTPS storage.
 *
 * Used by the staged `flow novel2video` command to turn local
 * portrait PNGs into `reference_images` URLs that Seedance 2.0 can
 * fetch.
 *
 * Two upload paths in priority order:
 *
 *   1. **License-server proxy** (`POST /api/ai/upload-url`) — vends a
 *      signed FAL upload URL. Default path: keeps the FAL key off the
 *      user's machine and bills the upload bandwidth to the worker.
 *      Requires `QCUT_AUTH_TOKEN` (set by `qcut system login`).
 *
 *   2. **Direct FAL** (`https://rest.alpha.fal.ai/storage/upload/initiate`)
 *      — used as a fallback when the proxy can't vend a URL (typical
 *      cause: the worker has no `FAL_KEY` configured), provided the
 *      user has `FAL_KEY` / `FAL_API_KEY` in their env. Same two-step
 *      shape as the proxy (initiate → PUT) so the rest of the
 *      pipeline doesn't care which path was taken.
 *
 * Both paths return an `https://…fal…` URL that downstream models
 * (Seedance 2.0 reference_images, Kling, etc.) can fetch directly.
 *
 * @module electron/native-pipeline/output/upload-helper
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getLicenseServerUrl, getSessionToken } from "../infra/proxy-client.js";

/** Mime-type mapping for common portrait / media extensions. */
const EXT_TO_MIME: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".mp4": "video/mp4",
	".webm": "video/webm",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
};

export interface UploadOptions {
	/** Absolute path to the file on disk. */
	filePath: string;
	/** Injected fetch for testing. Defaults to `globalThis.fetch`. */
	fetchImpl?: typeof fetch;
	/** Override the proxy auth token (defaults to `getSessionToken()`). */
	authToken?: string;
	/** Abort the upload mid-flight. */
	signal?: AbortSignal;
	/** Content type override; otherwise inferred from extension. */
	contentType?: string;
}

export interface UploadResult {
	url: string;
	contentType: string;
	bytes: number;
}

export class UploadError extends Error {
	constructor(
		message: string,
		readonly stage: "preflight" | "vend-url" | "put",
		readonly status?: number
	) {
		super(message);
		this.name = "UploadError";
	}
}

/** True for fetch aborts — must surface to the caller, never swallowed. */
function isAbortError(err: unknown): boolean {
	return (
		err instanceof Error &&
		(err.name === "AbortError" ||
			(err as { code?: string }).code === "ABORT_ERR")
	);
}

/**
 * True when the proxy rejected auth (401/403) — the user has a token
 * but it's invalid/expired. Falling back to direct FAL here would hide
 * the real problem and bypass billing.
 */
function isProxyAuthError(err: unknown): boolean {
	if (!(err instanceof UploadError)) return false;
	return err.status === 401 || err.status === 403;
}

/** Infer a content type from file extension; defaults to octet-stream. */
export function inferContentType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

interface VendResponse {
	uploadUrl?: string;
	fileUrl?: string;
	error?: string;
}

/** FAL direct-upload initiate endpoint (matches `infra/api-caller.uploadToFalStorage`). */
const FAL_STORAGE_INITIATE =
	"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";

interface FalInitiateResponse {
	upload_url?: string;
	file_url?: string;
	error?: string;
}

/** Read FAL credentials from env (matches `envApiKeyProvider("fal")`). */
function getFalApiKey(): string | undefined {
	return process.env.FAL_KEY || process.env.FAL_API_KEY || undefined;
}

async function getUploadAuthToken({
	authToken,
}: {
	authToken?: string;
}): Promise<string> {
	if (authToken !== undefined) return authToken.trim();
	const sessionToken = (await getSessionToken()).trim();
	if (sessionToken) return sessionToken;
	return process.env.QCUT_AUTH_TOKEN?.trim() ?? "";
}

/**
 * Vend a signed upload URL via the license-server proxy.
 *
 * Retries once on transient 5xx; fails fast on 4xx (client error,
 * won't self-heal). Returns the vendor response on success or throws
 * `UploadError` so the caller can decide whether to fall back.
 */
async function vendProxyUploadUrl(args: {
	fetchImpl: typeof fetch;
	authToken: string;
	fileName: string;
	contentType: string;
	bytes: number;
	signal?: AbortSignal;
}): Promise<{ uploadUrl: string; fileUrl: string }> {
	const baseUrl = getLicenseServerUrl();
	const vendUrl = `${baseUrl}/api/ai/upload-url`;

	let vendAttempts = 0;
	let lastVendError = "";
	let lastStatus: number | undefined;
	while (vendAttempts < 2) {
		vendAttempts++;
		const vendRes = await args.fetchImpl(vendUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${args.authToken}`,
			},
			body: JSON.stringify({
				provider: "fal",
				fileName: args.fileName,
				contentType: args.contentType,
				fileSize: args.bytes,
			}),
			signal: args.signal,
		});
		const vendText = await vendRes.text();
		let vendJson: VendResponse | undefined;
		try {
			vendJson = vendText ? (JSON.parse(vendText) as VendResponse) : {};
		} catch {
			vendJson = { error: vendText };
		}
		if (vendRes.ok && vendJson?.uploadUrl && vendJson?.fileUrl) {
			return { uploadUrl: vendJson.uploadUrl, fileUrl: vendJson.fileUrl };
		}
		lastVendError = vendJson?.error ?? `HTTP ${vendRes.status}`;
		lastStatus = vendRes.status;
		if (vendRes.status < 500 || vendAttempts >= 2) {
			throw new UploadError(
				`Upload URL vend failed: ${lastVendError}`,
				"vend-url",
				vendRes.status
			);
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new UploadError(
		`Upload URL vend failed: ${lastVendError || "missing uploadUrl/fileUrl in response"}`,
		"vend-url",
		lastStatus
	);
}

/**
 * Vend a signed upload URL by calling FAL directly (no proxy).
 *
 * Used as a fallback when the license-server proxy can't vend (e.g.
 * worker has no `FAL_KEY`). Caller must already have verified that
 * `FAL_KEY` / `FAL_API_KEY` is set in env.
 */
async function vendDirectFalUploadUrl(args: {
	fetchImpl: typeof fetch;
	apiKey: string;
	fileName: string;
	contentType: string;
	signal?: AbortSignal;
}): Promise<{ uploadUrl: string; fileUrl: string }> {
	const initRes = await args.fetchImpl(FAL_STORAGE_INITIATE, {
		method: "POST",
		headers: {
			Authorization: `Key ${args.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			file_name: args.fileName,
			content_type: args.contentType,
		}),
		signal: args.signal,
	});
	if (!initRes.ok) {
		const detail = await initRes.text().catch(() => "");
		throw new UploadError(
			`FAL initiate failed: HTTP ${initRes.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
			"vend-url",
			initRes.status
		);
	}
	const initJson = (await initRes.json()) as FalInitiateResponse;
	if (!initJson.upload_url || !initJson.file_url) {
		throw new UploadError(
			`FAL initiate returned no upload_url/file_url${initJson.error ? `: ${initJson.error}` : ""}`,
			"vend-url"
		);
	}
	return { uploadUrl: initJson.upload_url, fileUrl: initJson.file_url };
}

/**
 * Upload a local file and return the HTTPS URL plus size metadata.
 *
 * Tries the license-server proxy first (keeps the FAL key off the
 * user's machine). If the vend step fails AND the user has `FAL_KEY`
 * in their env, falls back to a direct FAL upload — this unblocks
 * users when the worker isn't configured with a server-side FAL key.
 *
 * The signed-URL PUT step is never retried (signed URLs are
 * single-use; a retry would need a fresh URL).
 */
export async function uploadFileForReference(
	options: UploadOptions
): Promise<UploadResult> {
	const { filePath, signal } = options;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;

	// ── Pre-flight ────────────────────────────────────────────────
	if (!fs.existsSync(filePath)) {
		throw new UploadError(`File not found: ${filePath}`, "preflight");
	}
	const stat = fs.statSync(filePath);
	if (stat.size === 0) {
		throw new UploadError(
			`Empty file cannot be uploaded: ${filePath}`,
			"preflight"
		);
	}
	const bytes = stat.size;
	const fileName = path.basename(filePath);
	const contentType = options.contentType ?? inferContentType(filePath);

	const authToken = await getUploadAuthToken({ authToken: options.authToken });
	const falKey = getFalApiKey();

	// ── Step 1: vend signed URL (proxy preferred, direct FAL fallback) ──
	//
	// Prefer the proxy so billing/allowlisting stays centralized. Only fall
	// back to direct FAL for vend-level failures we explicitly want to
	// bypass (missing/unreachable proxy, un-vendable 4xx/5xx) — NOT for
	// aborts and NOT for real auth rejections, which should surface.
	let signed: { uploadUrl: string; fileUrl: string };
	if (authToken) {
		try {
			signed = await vendProxyUploadUrl({
				fetchImpl,
				authToken,
				fileName,
				contentType,
				bytes,
				signal,
			});
		} catch (proxyErr) {
			if (isAbortError(proxyErr)) throw proxyErr;
			if (isProxyAuthError(proxyErr)) throw proxyErr;
			if (!falKey) throw proxyErr;
			const proxyMessage =
				proxyErr instanceof Error ? proxyErr.message : String(proxyErr);
			console.warn(
				`[upload-helper] Proxy vend failed (${proxyMessage}); falling back to direct FAL upload.`
			);
			signed = await vendDirectFalUploadUrl({
				fetchImpl,
				apiKey: falKey,
				fileName,
				contentType,
				signal,
			});
		}
	} else if (falKey) {
		// No session token — only the direct-FAL path is viable. Used for
		// pre-login smoke tests and CI runs with `FAL_KEY` exported.
		signed = await vendDirectFalUploadUrl({
			fetchImpl,
			apiKey: falKey,
			fileName,
			contentType,
			signal,
		});
	} else {
		throw new UploadError(
			"No auth token and no FAL_KEY — run `qcut system login` or set FAL_KEY",
			"preflight"
		);
	}

	// ── Step 2: PUT bytes ─────────────────────────────────────────
	const body = fs.readFileSync(filePath);
	const putRes = await fetchImpl(signed.uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: body as unknown as RequestInit["body"],
		signal,
	});
	if (!putRes.ok) {
		const detail = await putRes.text().catch(() => "");
		throw new UploadError(
			`Upload PUT failed: HTTP ${putRes.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
			"put",
			putRes.status
		);
	}

	return {
		url: signed.fileUrl,
		contentType,
		bytes,
	};
}
