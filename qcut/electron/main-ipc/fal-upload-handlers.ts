/**
 * FAL upload IPC handlers (shared 2-step signed-URL flow).
 * @module electron/main-ipc/fal-upload-handlers
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { MainIpcDeps, Logger } from "./types.js";
import { FAL_CONTENT_TYPES, FAL_DEFAULTS } from "./types.js";
import {
	isProxyAvailable,
	proxyUploadUrl,
} from "../native-pipeline/infra/proxy-client.js";

/** Shared FAL 2-step upload: initiate signed URL, then PUT the file. */
async function falUpload(
	logger: Logger,
	tag: string,
	data: Uint8Array,
	filename: string,
	apiKey: string,
	mediaType: string
): Promise<{ success: boolean; url?: string; error?: string }> {
	try {
		logger.info(`[FAL ${tag}] Starting upload: ${filename}`);
		logger.info(`[FAL ${tag}] File size: ${data.length} bytes`);

		const ext = filename.toLowerCase().split(".").pop();
		const contentType =
			FAL_CONTENT_TYPES[mediaType]?.[ext ?? ""] ??
			FAL_DEFAULTS[mediaType] ??
			"application/octet-stream";

		let upload_url: string;
		let file_url: string;

		const useProxy = await isProxyAvailable();

		if (useProxy) {
			logger.info(`[FAL ${tag}] Using proxy for upload URL`);
			const urls = await proxyUploadUrl({
				fileName: filename,
				contentType,
			});
			upload_url = urls.uploadUrl;
			file_url = urls.fileUrl;
		} else {
			const initResponse = await fetch(
				"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
				{
					method: "POST",
					headers: {
						Authorization: `Key ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						file_name: filename,
						content_type: contentType,
					}),
				}
			);

			if (!initResponse.ok) {
				const errorText = await initResponse.text();
				logger.error(
					`[FAL ${tag}] Initiate failed: ${initResponse.status} - ${errorText}`
				);
				return {
					success: false,
					error: `Upload initiate failed: ${initResponse.status} - ${errorText}`,
				};
			}

			const initData = (await initResponse.json()) as {
				upload_url?: string;
				file_url?: string;
			};

			if (!initData.upload_url || !initData.file_url) {
				logger.error(`[FAL ${tag}] Missing URLs in response`);
				return {
					success: false,
					error: "FAL API did not return upload URLs",
				};
			}
			upload_url = initData.upload_url;
			file_url = initData.file_url;
		}

		logger.info(`[FAL ${tag}] Step 2: Uploading to signed URL...`);

		const uploadResponse = await fetch(upload_url, {
			method: "PUT",
			headers: { "Content-Type": contentType },
			body: Buffer.from(data),
		});

		if (!uploadResponse.ok) {
			const errorText = await uploadResponse.text();
			logger.error(
				`[FAL ${tag}] Upload failed: ${uploadResponse.status} - ${errorText}`
			);
			return {
				success: false,
				error: `Upload failed: ${uploadResponse.status} - ${errorText}`,
			};
		}

		logger.info(`[FAL ${tag}] Success! File URL: ${file_url}`);
		return { success: true, url: file_url };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`[FAL ${tag}] Error: ${message}`);
		return { success: false, error: message };
	}
}

export function registerFalUploadHandlers(deps: MainIpcDeps): void {
	const { logger } = deps;

	ipcMain.handle(
		"fal:upload-video",
		async (
			_event: IpcMainInvokeEvent,
			data: Uint8Array,
			filename: string,
			apiKey: string
		) => falUpload(logger, "Upload", data, filename, apiKey, "video")
	);

	ipcMain.handle(
		"fal:upload-image",
		async (
			_event: IpcMainInvokeEvent,
			data: Uint8Array,
			filename: string,
			apiKey: string
		) => falUpload(logger, "Image Upload", data, filename, apiKey, "image")
	);

	ipcMain.handle(
		"fal:upload-audio",
		async (
			_event: IpcMainInvokeEvent,
			data: Uint8Array,
			filename: string,
			apiKey: string
		) => falUpload(logger, "Audio Upload", data, filename, apiKey, "audio")
	);

	ipcMain.handle(
		"fal:queue-fetch",
		async (
			_event: IpcMainInvokeEvent,
			url: string,
			apiKey: string
		): Promise<{ ok: boolean; status: number; data: unknown }> => {
			try {
				// Validate URL to prevent SSRF
				const parsedUrl = new URL(url);
				if (parsedUrl.protocol !== "https:") {
					throw new Error("Only HTTPS URLs are allowed");
				}
				if (!parsedUrl.hostname.endsWith(".fal.ai")) {
					throw new Error("Only fal.ai domains are allowed");
				}

				const response = await fetch(url, {
					headers: { Authorization: `Key ${apiKey}` },
				});
				const data = await response.json().catch(() => ({}));
				return { ok: response.ok, status: response.status, data };
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error(`[FAL Queue] Fetch error: ${message}`);
				return { ok: false, status: 0, data: { error: message } };
			}
		}
	);
}
