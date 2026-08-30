/**
 * ElevenLabs Speech-to-Text Handler
 *
 * Provides transcription using FAL AI's ElevenLabs Scribe v2 model.
 * Features:
 * - Word-level timestamps
 * - Speaker diarization
 * - Audio event tagging (laughter, applause, etc.)
 * - 99 language support with auto-detection
 *
 * @see https://fal.ai/models/fal-ai/elevenlabs/speech-to-text/scribe-v2/api
 */

import { ipcMain, app, safeStorage } from "electron";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import {
	isProxyAvailable,
	proxyRequest,
	proxyUploadUrl,
} from "./native-pipeline/infra/proxy-client.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for ElevenLabs transcription request.
 */
export interface ElevenLabsTranscribeOptions {
	/** Path to the audio file to transcribe */
	audioPath: string;
	/** Language code (e.g., "eng", "spa"). Default: auto-detect */
	language?: string;
	/** Enable speaker diarization. Default: true */
	diarize?: boolean;
	/** Tag audio events (laughter, applause). Default: true */
	tagAudioEvents?: boolean;
	/** Words/phrases to bias transcription toward. +30% cost if used */
	keyterms?: string[];
}

/**
 * Word-level transcription item from ElevenLabs.
 */
export interface TranscriptionWord {
	/** The transcribed word or event text */
	text: string;
	/** Start time in seconds */
	start: number;
	/** End time in seconds */
	end: number;
	/** Type of element: word, spacing, audio_event, punctuation */
	type: "word" | "spacing" | "audio_event" | "punctuation";
	/** Speaker identifier (if diarization enabled) */
	speaker_id: string | null;
}

/**
 * Full transcription result from ElevenLabs Scribe v2.
 */
export interface ElevenLabsTranscribeResult {
	/** Full transcription text */
	text: string;
	/** Detected/specified language code */
	language_code: string;
	/** Confidence score for language detection */
	language_probability: number;
	/** Word-level transcription data */
	words: TranscriptionWord[];
}

/**
 * Logger interface for consistent logging.
 */
interface Logger {
	info(message?: unknown, ...args: unknown[]): void;
	warn(message?: unknown, ...args: unknown[]): void;
	error(message?: unknown, ...args: unknown[]): void;
	debug(message?: unknown, ...args: unknown[]): void;
}

// ============================================================================
// Logger Setup
// ============================================================================

let log: Logger;
try {
	log = require("electron-log");
} catch {
	const noop = (): void => {};
	log = { info: noop, warn: noop, error: noop, debug: noop };
}

// ============================================================================
// Constants
// ============================================================================

const FAL_STORAGE_INITIATE_URL =
	"https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";
const FAL_ELEVENLABS_ENDPOINT = "fal-ai/elevenlabs/speech-to-text/scribe-v2";
const FAL_ELEVENLABS_URL = `https://fal.run/${FAL_ELEVENLABS_ENDPOINT}`;
const LOG_PREFIX = "[ElevenLabs]";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Retrieves the FAL API key from secure storage.
 * Falls back to environment variable in development.
 *
 * @returns The FAL API key
 * @throws Error if no API key is found
 */
async function getFalApiKey(): Promise<string> {
	const userDataPath = app.getPath("userData");
	const apiKeysFilePath = path.join(userDataPath, "api-keys.json");

	log.info(`${LOG_PREFIX} Checking for FAL API key...`);

	// Try to load from secure storage
	if (fsSync.existsSync(apiKeysFilePath)) {
		try {
			const fileContent = fsSync.readFileSync(apiKeysFilePath, "utf8");
			const encryptedData = JSON.parse(fileContent);

			if (encryptedData.falApiKey) {
				if (safeStorage.isEncryptionAvailable()) {
					try {
						const decrypted = safeStorage.decryptString(
							Buffer.from(encryptedData.falApiKey, "base64")
						);
						log.info(`${LOG_PREFIX} FAL API key loaded from secure storage`);
						return decrypted;
					} catch {
						// Decryption failed, try plain text
						log.warn(`${LOG_PREFIX} Decryption failed, using plain text`);
						return encryptedData.falApiKey;
					}
				} else {
					// No encryption, use plain text
					return encryptedData.falApiKey;
				}
			}
		} catch (error) {
			log.warn(`${LOG_PREFIX} Failed to read API keys file:`, error);
		}
	}

	// Fallback to environment variable (development only)
	if (process.env.VITE_FAL_API_KEY) {
		log.info(`${LOG_PREFIX} Using FAL API key from environment variable`);
		return process.env.VITE_FAL_API_KEY;
	}

	throw new Error(
		"FAL API key not found. Please configure your API key in Settings → API Keys."
	);
}

function getContentTypeForFile({ fileName }: { fileName: string }): string {
	const ext = fileName.split(".").pop()?.toLowerCase();
	const contentTypeMap: Record<string, string> = {
		mp3: "audio/mpeg",
		wav: "audio/wav",
		m4a: "audio/mp4",
		aac: "audio/aac",
		ogg: "audio/ogg",
		flac: "audio/flac",
	};
	return contentTypeMap[ext ?? ""] ?? "audio/mpeg";
}

async function uploadWithSignedUrl({
	contentType,
	fileBuffer,
	uploadUrl,
}: {
	contentType: string;
	fileBuffer: Buffer;
	uploadUrl: string;
}): Promise<void> {
	const uploadResponse = await fetch(uploadUrl, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		body: new Uint8Array(fileBuffer),
	});

	if (!uploadResponse.ok) {
		const errorText = await uploadResponse.text();
		log.error(
			`${LOG_PREFIX} Upload failed: ${uploadResponse.status} - ${errorText}`
		);
		throw new Error(
			`FAL storage upload failed: ${uploadResponse.status} ${errorText}`
		);
	}
}

async function uploadToFalStorageViaProxy({
	contentType,
	fileBuffer,
	fileName,
	fileSize,
}: {
	contentType: string;
	fileBuffer: Buffer;
	fileName: string;
	fileSize: number;
}): Promise<string> {
	const signedUpload = await proxyUploadUrl({
		fileName,
		contentType,
		fileSize,
	});

	await uploadWithSignedUrl({
		contentType,
		fileBuffer,
		uploadUrl: signedUpload.uploadUrl,
	});

	return signedUpload.fileUrl;
}

async function uploadToFalStorageDirect({
	apiKey,
	contentType,
	fileBuffer,
	fileName,
}: {
	apiKey: string;
	contentType: string;
	fileBuffer: Buffer;
	fileName: string;
}): Promise<string> {
	log.info(`${LOG_PREFIX} Initiating direct FAL upload...`);

	const initResponse = await fetch(FAL_STORAGE_INITIATE_URL, {
		method: "POST",
		headers: {
			Authorization: `Key ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			file_name: fileName,
			content_type: contentType,
		}),
	});

	if (!initResponse.ok) {
		const errorText = await initResponse.text();
		log.error(
			`${LOG_PREFIX} Initiate failed: ${initResponse.status} - ${errorText}`
		);
		throw new Error(
			`FAL storage initiate failed: ${initResponse.status} ${errorText}`
		);
	}

	const initData = (await initResponse.json()) as {
		upload_url?: string;
		file_url?: string;
	};
	const { upload_url, file_url } = initData;

	if (!upload_url || !file_url) {
		log.error(`${LOG_PREFIX} Missing URLs in response:`, initData);
		throw new Error("FAL storage did not return upload URLs");
	}

	await uploadWithSignedUrl({
		contentType,
		fileBuffer,
		uploadUrl: upload_url,
	});

	log.info(`${LOG_PREFIX} File uploaded successfully: ${file_url}`);
	return file_url;
}

async function uploadToFalStorage(filePath: string): Promise<string> {
	log.info(`${LOG_PREFIX} Uploading file to FAL storage...`);

	const fileBuffer = await fs.readFile(filePath);
	const fileName = path.basename(filePath);
	const fileSize = fileBuffer.length;
	const contentType = getContentTypeForFile({ fileName });

	log.info(
		`${LOG_PREFIX} File: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
	);

	let proxyError: unknown = null;
	if (await isProxyAvailable()) {
		try {
			log.info(`${LOG_PREFIX} Uploading via QCut license-server proxy...`);
			return await uploadToFalStorageViaProxy({
				contentType,
				fileBuffer,
				fileName,
				fileSize,
			});
		} catch (error) {
			proxyError = error;
			log.warn(
				`${LOG_PREFIX} Proxy upload failed, trying BYOK fallback:`,
				error
			);
		}
	}

	try {
		const apiKey = await getFalApiKey();
		return await uploadToFalStorageDirect({
			apiKey,
			contentType,
			fileBuffer,
			fileName,
		});
	} catch (error) {
		if (proxyError) {
			throw new Error(
				`QCut cloud upload failed and no local FAL fallback succeeded: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		throw error;
	}
}

function buildElevenLabsRequestBody({
	audioUrl,
	options,
}: {
	audioUrl: string;
	options: ElevenLabsTranscribeOptions;
}): Record<string, unknown> {
	const requestBody: Record<string, unknown> = {
		audio_url: audioUrl,
		diarize: options.diarize ?? true,
		tag_audio_events: options.tagAudioEvents ?? true,
	};

	if (options.language) {
		requestBody.language_code = options.language;
	}

	if (options.keyterms && options.keyterms.length > 0) {
		requestBody.keyterms = options.keyterms;
	}

	return requestBody;
}

async function callElevenLabsApiViaProxy({
	audioUrl,
	options,
}: {
	audioUrl: string;
	options: ElevenLabsTranscribeOptions;
}): Promise<ElevenLabsTranscribeResult> {
	const response = await proxyRequest({
		provider: "fal",
		endpoint: FAL_ELEVENLABS_URL,
		method: "POST",
		body: buildElevenLabsRequestBody({ audioUrl, options }),
		timeoutMs: 120_000,
	});

	if (!response.ok) {
		const preview =
			typeof response.data === "string"
				? response.data.slice(0, 300)
				: JSON.stringify(response.data).slice(0, 300);
		throw new Error(
			`Proxy ElevenLabs API error: ${response.status} ${preview}`
		);
	}

	return response.data as ElevenLabsTranscribeResult;
}

async function callElevenLabsApiDirect({
	apiKey,
	audioUrl,
	options,
}: {
	apiKey: string;
	audioUrl: string;
	options: ElevenLabsTranscribeOptions;
}): Promise<ElevenLabsTranscribeResult> {
	if (options.language) {
		log.info(`${LOG_PREFIX} Language: ${options.language}`);
	}

	if (options.keyterms && options.keyterms.length > 0) {
		log.info(
			`${LOG_PREFIX} Keyterms: ${options.keyterms.length} terms (+30% cost)`
		);
	}

	const response = await fetch(FAL_ELEVENLABS_URL, {
		method: "POST",
		headers: {
			Authorization: `Key ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildElevenLabsRequestBody({ audioUrl, options })),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
	}

	return (await response.json()) as ElevenLabsTranscribeResult;
}

function logTranscriptionResult({
	result,
}: {
	result: ElevenLabsTranscribeResult;
}): void {
	log.info(`${LOG_PREFIX} Transcription complete`);
	log.info(
		`${LOG_PREFIX} Language: ${result.language_code} (confidence: ${(result.language_probability * 100).toFixed(1)}%)`
	);
	log.info(`${LOG_PREFIX} Words: ${result.words?.length || 0}`);
	log.info(`${LOG_PREFIX} Text length: ${result.text?.length || 0} characters`);
}

/**
 * Calls the ElevenLabs Scribe v2 API through QCut cloud, with BYOK fallback.
 *
 * @param audioUrl - URL of the audio file (from FAL storage)
 * @param options - Transcription options
 * @returns Transcription result
 */
async function callElevenLabsApi({
	audioUrl,
	options,
}: {
	audioUrl: string;
	options: ElevenLabsTranscribeOptions;
}): Promise<ElevenLabsTranscribeResult> {
	log.info(`${LOG_PREFIX} Calling ElevenLabs Scribe v2 API...`);
	log.info(
		`${LOG_PREFIX} Options: diarize=${options.diarize ?? true}, tagAudioEvents=${options.tagAudioEvents ?? true}`
	);

	let proxyError: unknown = null;
	if (await isProxyAvailable()) {
		try {
			log.info(`${LOG_PREFIX} Transcribing via QCut license-server proxy...`);
			const result = await callElevenLabsApiViaProxy({ audioUrl, options });
			logTranscriptionResult({ result });
			return result;
		} catch (error) {
			proxyError = error;
			log.warn(
				`${LOG_PREFIX} Proxy transcription failed, trying BYOK fallback:`,
				error
			);
		}
	}

	try {
		const apiKey = await getFalApiKey();
		const result = await callElevenLabsApiDirect({ apiKey, audioUrl, options });
		logTranscriptionResult({ result });
		return result;
	} catch (error) {
		if (proxyError) {
			throw new Error(
				`QCut cloud transcription failed and no local FAL fallback succeeded: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		throw error;
	}
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Registers ElevenLabs transcription IPC handlers.
 * Call this function during app initialization.
 */
export function registerElevenLabsTranscribeHandler(): void {
	log.info(`${LOG_PREFIX} registerElevenLabsTranscribeHandler() called`);

	/**
	 * Main transcription handler.
	 * Uploads audio to FAL storage, then calls ElevenLabs Scribe v2.
	 */
	ipcMain.handle(
		"transcribe:elevenlabs",
		async (
			_,
			options: ElevenLabsTranscribeOptions
		): Promise<ElevenLabsTranscribeResult> => {
			log.info(`${LOG_PREFIX} ========================================`);
			log.info(`${LOG_PREFIX} IPC handler "transcribe:elevenlabs" invoked`);
			log.info(
				`${LOG_PREFIX} Options received:`,
				JSON.stringify(options, null, 2)
			);
			log.info(`${LOG_PREFIX} ========================================`);
			log.info(`${LOG_PREFIX} Transcription request received`);
			log.info(`${LOG_PREFIX} Audio path: ${options.audioPath}`);

			try {
				// Validate input
				if (!options.audioPath) {
					log.error(`${LOG_PREFIX} ERROR: Audio path is required`);
					throw new Error("Audio path is required");
				}

				// Check file exists
				log.info(`${LOG_PREFIX} Checking if file exists: ${options.audioPath}`);
				try {
					await fs.access(options.audioPath);
					log.info(`${LOG_PREFIX} File exists ✓`);
				} catch {
					log.error(
						`${LOG_PREFIX} ERROR: File not found: ${options.audioPath}`
					);
					throw new Error(`Audio file not found: ${options.audioPath}`);
				}

				// Upload to FAL storage
				log.info(`${LOG_PREFIX} Uploading to FAL storage...`);
				const audioUrl = await uploadToFalStorage(options.audioPath);
				log.info(`${LOG_PREFIX} Uploaded! URL: ${audioUrl}`);

				// Call ElevenLabs API
				log.info(`${LOG_PREFIX} Calling ElevenLabs API...`);
				const result = await callElevenLabsApi({ audioUrl, options });
				log.info(`${LOG_PREFIX} API call complete!`);
				log.info(`${LOG_PREFIX} Result text length: ${result.text?.length}`);
				log.info(`${LOG_PREFIX} Result words count: ${result.words?.length}`);

				log.info(`${LOG_PREFIX} Transcription completed successfully`);
				log.info(`${LOG_PREFIX} ========================================`);
				log.info(`${LOG_PREFIX} ========================================`);

				return result;
			} catch (error) {
				log.error(`${LOG_PREFIX} Transcription FAILED:`, error);
				log.error(`${LOG_PREFIX} Transcription failed:`, error);
				throw error;
			}
		}
	);

	/**
	 * Upload file to FAL storage (standalone handler).
	 * Useful for uploading files separately from transcription.
	 */
	ipcMain.handle(
		"transcribe:upload-to-fal",
		async (_, filePath: string): Promise<{ url: string }> => {
			log.info(`${LOG_PREFIX} IPC handler "transcribe:upload-to-fal" invoked`);
			log.info(`${LOG_PREFIX} filePath: ${filePath}`);
			log.info(`${LOG_PREFIX} Upload request received: ${filePath}`);

			try {
				const url = await uploadToFalStorage(filePath);
				log.info(`${LOG_PREFIX} Upload complete! URL: ${url}`);
				return { url };
			} catch (error) {
				log.error(`${LOG_PREFIX} Upload FAILED:`, error);
				log.error(`${LOG_PREFIX} Upload failed:`, error);
				throw error;
			}
		}
	);

	log.info(`${LOG_PREFIX} IPC handlers registered successfully`);
	log.info(`${LOG_PREFIX} IPC handlers registered`);
}

// ============================================================================
// Module Exports
// ============================================================================

// CommonJS export for backward compatibility
try {
	module.exports = { registerElevenLabsTranscribeHandler };
} catch {
	// Vitest imports this module as ESM; production Electron still uses CJS.
}

// ES6 exports
export default { registerElevenLabsTranscribeHandler };
