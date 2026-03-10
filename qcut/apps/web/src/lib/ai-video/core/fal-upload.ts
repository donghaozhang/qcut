/**
 * FAL.ai File Upload Utilities
 *
 * Provides file upload functionality for FAL.ai storage.
 * Supports Electron IPC fallback for CORS bypass in desktop apps.
 *
 * @module ai-video/core/fal-upload
 */

import { platform } from "@qcut/platform-core";
import { handleAIServiceError } from "@/lib/debug/error-handler";
import { FAL_UPLOAD_URL } from "./fal-request";

/**
 * File type hints for routing to appropriate upload handler.
 */
export type FalUploadFileType = "image" | "audio" | "video" | "asset";

/**
 * Extended Error with HTTP status information for upload failures.
 */
export interface FalUploadError extends Error {
	status?: number;
	statusText?: string;
	errorData?: unknown;
}

/**
 * Result from Electron IPC upload handlers.
 */
interface ElectronUploadResult {
	success: boolean;
	url?: string;
	error?: string;
}

/**
 * Check if Electron IPC upload is available for a given file type.
 *
 * @param fileType - Type of file to check upload availability for
 * @returns true if Electron IPC can handle this file type
 */
export function isElectronUploadAvailable(
	fileType: FalUploadFileType
): boolean {
	try {
		const falApi = platform().fal;
		const hasUploadImage = typeof falApi.uploadImage === "function";
		const hasUploadAudio = typeof falApi.uploadAudio === "function";
		const hasUploadVideo = typeof falApi.uploadVideo === "function";

		return (
			(fileType === "image" && hasUploadImage) ||
			(fileType === "audio" && hasUploadAudio) ||
			(fileType === "video" && hasUploadVideo) ||
			(fileType === "asset" && hasUploadImage) // asset falls back to image
		);
	} catch {
		return false;
	}
}

/**
 * Upload a file to FAL.ai storage via Electron IPC.
 *
 * @param file - File to upload
 * @param fileType - Type hint for routing to correct IPC handler
 * @param apiKey - FAL API key
 * @returns URL of uploaded file
 * @throws Error if upload fails or IPC is not available
 */
async function uploadViaElectronIPC(
	file: File,
	fileType: FalUploadFileType,
	apiKey: string
): Promise<string> {
	const falApi = platform().fal;

	console.log(
		`[FAL Upload] 🔌 Using Electron IPC for ${fileType} upload (bypasses CORS)`
	);
	console.log(`[FAL Upload] 📄 File: ${file.name}, Size: ${file.size} bytes`);

	// Convert File to Uint8Array for IPC transfer
	const arrayBuffer = await file.arrayBuffer();
	const uint8Array = new Uint8Array(arrayBuffer);

	let result: ElectronUploadResult;

	const hasUploadImage = typeof falApi.uploadImage === "function";
	const hasUploadAudio = typeof falApi.uploadAudio === "function";
	const hasUploadVideo = typeof falApi.uploadVideo === "function";

	if (fileType === "image" && hasUploadImage) {
		console.log("[FAL Upload] 🖼️ Routing to Electron image upload IPC...");
		result = await falApi.uploadImage(uint8Array, file.name, apiKey);
	} else if (fileType === "audio" && hasUploadAudio) {
		console.log("[FAL Upload] 🎵 Routing to Electron audio upload IPC...");
		result = await falApi.uploadAudio(uint8Array, file.name, apiKey);
	} else if (fileType === "video" && hasUploadVideo) {
		console.log("[FAL Upload] 🎬 Routing to Electron video upload IPC...");
		result = await falApi.uploadVideo(uint8Array, file.name, apiKey);
	} else if (hasUploadImage) {
		// Generic asset fallback to image uploader
		console.log(`[FAL Upload] 📦 Using image upload IPC for ${fileType}...`);
		result = await falApi.uploadImage(uint8Array, file.name, apiKey);
	} else {
		throw new Error("No compatible IPC uploader found");
	}

	if (!result.success || !result.url) {
		throw new Error(result.error || `FAL ${fileType} upload failed via IPC`);
	}

	console.log(`[FAL Upload] ✅ IPC upload successful: ${result.url}`);
	return result.url;
}

/**
 * Upload a file to FAL.ai storage via direct fetch.
 *
 * @param file - File to upload
 * @param fileType - Type hint for error messages
 * @param apiKey - FAL API key
 * @returns URL of uploaded file
 * @throws FalUploadError if upload fails
 */
async function uploadViaFetch(
	file: File,
	fileType: FalUploadFileType,
	apiKey: string
): Promise<string> {
	console.log(
		`[FAL Upload] 🌐 Using direct fetch for ${fileType} upload (browser mode)`
	);

	const formData = new FormData();
	formData.append("file", file);

	const response = await fetch(FAL_UPLOAD_URL, {
		method: "POST",
		headers: {
			Authorization: `Key ${apiKey}`,
		},
		body: formData,
	});

	const data = (await response.json().catch(() => null)) as {
		url?: string;
	} | null;

	if (!response.ok) {
		const errorMessage = `FAL ${fileType} upload failed: ${response.status} ${response.statusText}`;
		const error = new Error(errorMessage) as FalUploadError;
		error.status = response.status;
		error.statusText = response.statusText;
		error.errorData = data;
		throw error;
	}

	if (!data || typeof data.url !== "string") {
		const error = new Error(
			`FAL ${fileType} upload response is missing a url field.`
		) as FalUploadError;
		error.errorData = data;
		throw error;
	}

	return data.url;
}

/**
 * Upload a file to FAL.ai storage.
 *
 * Automatically uses Electron IPC if available (bypasses CORS restrictions).
 * Falls back to direct fetch for browser environments.
 *
 * @param file - File to upload
 * @param fileType - Type hint for routing to correct IPC handler
 * @param apiKey - FAL API key
 * @returns URL of uploaded file
 * @throws Error if API key is missing or upload fails
 *
 * @example
 * ```typescript
 * const url = await uploadFileToFal(imageFile, "image", apiKey);
 * console.log("Uploaded to:", url);
 * ```
 */
export async function uploadFileToFal(
	file: File,
	fileType: FalUploadFileType,
	apiKey: string
): Promise<string> {
	if (!apiKey) {
		throw new Error(
			"FAL API key is required for asset upload. Please set the VITE_FAL_API_KEY environment variable."
		);
	}

	try {
		// Try Electron IPC first (bypasses CORS)
		if (isElectronUploadAvailable(fileType)) {
			return await uploadViaElectronIPC(file, fileType, apiKey);
		}

		// Fallback to direct fetch
		return await uploadViaFetch(file, fileType, apiKey);
	} catch (error) {
		const normalizedError =
			error instanceof Error ? error : new Error(String(error));

		const metadata: Record<string, unknown> = {
			filename: file.name,
			fileSize: file.size,
			fileType: file.type,
			uploadType: fileType,
		};

		const uploadError = normalizedError as FalUploadError;
		if (uploadError.status) metadata.status = uploadError.status;
		if (uploadError.statusText) metadata.statusText = uploadError.statusText;
		if (uploadError.errorData) metadata.errorData = uploadError.errorData;

		handleAIServiceError(normalizedError, `FAL ${fileType} upload`, metadata);
		throw normalizedError;
	}
}

// ============================================
// Convenience Wrappers
// ============================================

/**
 * Upload an image file to FAL.ai storage.
 *
 * @param file - Image file to upload
 * @param apiKey - FAL API key
 * @returns URL of uploaded image
 */
export async function uploadImageToFal(
	file: File,
	apiKey: string
): Promise<string> {
	return uploadFileToFal(file, "image", apiKey);
}

/**
 * Upload an audio file (MP3/WAV) to FAL.ai storage.
 *
 * @param file - Audio file to upload
 * @param apiKey - FAL API key
 * @returns URL of uploaded audio
 */
export async function uploadAudioToFal(
	file: File,
	apiKey: string
): Promise<string> {
	return uploadFileToFal(file, "audio", apiKey);
}

/**
 * Upload a video file (MP4/MOV/AVI) to FAL.ai storage.
 *
 * @param file - Video file to upload
 * @param apiKey - FAL API key
 * @returns URL of uploaded video
 */
export async function uploadVideoToFal(
	file: File,
	apiKey: string
): Promise<string> {
	return uploadFileToFal(file, "video", apiKey);
}
