import { ipcMain, app, safeStorage, IpcMainInvokeEvent } from "electron";
import https from "https";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "node:url";
import {
	buildFreesoundSearchFilters,
	type FreesoundSearchType,
} from "./sounds/freesound-search";

// Try to load electron-log, fallback to no-op if not available
interface Logger {
	info(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	debug(message?: any, ...optionalParams: any[]): void;
}

let log: Logger;
try {
	log = require("electron-log");
} catch (error) {
	// Create a no-op logger to avoid console usage (per project guidelines)
	const noop = (): void => {};
	log = {
		info: noop,
		warn: noop,
		error: noop,
		debug: noop,
	};
}

interface ApiKeysConfig {
	freesoundApiKey?: string;
}

interface DefaultKeys {
	FREESOUND_API_KEY?: string;
}

interface SearchParams {
	q?: string;
	type?: FreesoundSearchType;
	page?: number;
	page_size?: number;
	sort?: string;
	min_rating?: number;
	commercial_only?: boolean;
}

interface FreesoundResult {
	id: number;
	name: string;
	description: string;
	url: string;
	previews?: {
		"preview-hq-mp3"?: string;
		"preview-lq-mp3"?: string;
	};
	download: string;
	duration: number;
	filesize: number;
	type: string;
	channels: number;
	bitrate: number;
	bitdepth: number;
	samplerate: number;
	username: string;
	tags: string[];
	license: string;
	created: string;
	num_downloads?: number;
	avg_rating?: number;
	num_ratings?: number;
}

interface TransformedResult {
	id: number;
	name: string;
	description: string;
	url: string;
	previewUrl?: string;
	downloadUrl: string;
	duration: number;
	filesize: number;
	type: string;
	channels: number;
	bitrate: number;
	bitdepth: number;
	samplerate: number;
	username: string;
	tags: string[];
	license: string;
	created: string;
	downloads: number;
	rating: number;
	ratingCount: number;
}

interface SearchResponse {
	success: boolean;
	error?: string;
	status?: number;
	count?: number;
	next?: string | null;
	previous?: string | null;
	results?: TransformedResult[];
	query?: string;
	type?: string;
	page?: number;
	pageSize?: number;
	sort?: string;
	minRating?: number;
	message?: string;
}

interface DownloadResponse {
	success: boolean;
	path?: string;
	error?: string;
}

interface TestKeyResponse {
	success: boolean;
	message: string;
}

interface HttpResponse {
	statusCode?: number;
	body: string;
	ok?: boolean;
}

/**
 * Get Freesound API key with fallback priority:
 * 1. User-configured key from settings (highest priority)
 * 2. Default embedded key
 * 3. Environment variable (development)
 */
async function getFreesoundApiKey(): Promise<string | null> {
	log.info("=== GET API KEY DEBUG ===");

	// Priority 1: Try user-configured key first
	try {
		const userDataPath: string = app.getPath("userData");
		const apiKeysFilePath: string = path.join(userDataPath, "api-keys.json");
		log.info("[API Key] Checking user config at:", apiKeysFilePath);

		if (fs.existsSync(apiKeysFilePath)) {
			log.info("[API Key] User config file exists");
			const encryptedData: ApiKeysConfig = JSON.parse(
				fs.readFileSync(apiKeysFilePath, "utf8")
			);
			if (encryptedData.freesoundApiKey) {
				log.info("[API Key] Found freesoundApiKey in user config");
				// Decrypt if possible
				if (safeStorage.isEncryptionAvailable()) {
					try {
						const decrypted: string = safeStorage.decryptString(
							Buffer.from(encryptedData.freesoundApiKey, "base64")
						);
						if (decrypted) {
							log.info("[API Key] Successfully decrypted user key");
							log.info("[Sound Handler] Using user-configured API key");
							return decrypted;
						}
					} catch (e: any) {
						log.info(
							"[API Key] Decryption failed, trying plain text:",
							e.message
						);
						// Plain text fallback
						if (encryptedData.freesoundApiKey) {
							log.info("[API Key] Using plain text user key");
							log.info("[Sound Handler] Using user-configured API key (plain)");
							return encryptedData.freesoundApiKey;
						}
					}
				} else if (encryptedData.freesoundApiKey) {
					log.info("[API Key] Encryption not available, using plain text");
					log.info(
						"[Sound Handler] Using user-configured API key (no encryption)"
					);
					return encryptedData.freesoundApiKey;
				}
			} else {
				log.info("[API Key] No freesoundApiKey in user config");
			}
		} else {
			log.info("[API Key] User config file does not exist");
		}
	} catch (error: any) {
		log.error("[API Key] Error reading user config:", error);
		log.warn("[Sound Handler] Error reading stored API key:", error.message);
	}

	// Priority 2: Try default embedded key
	try {
		log.info(
			"[API Key] Trying to load default keys from ./config/default-keys"
		);
		const defaultKeys: DefaultKeys = require("../dist/electron/config/default-keys");
		log.info("[API Key] Default keys loaded:", !!defaultKeys);
		if (defaultKeys.FREESOUND_API_KEY) {
			log.info("[API Key] Found default FREESOUND_API_KEY");
			log.info("[Sound Handler] Using default embedded API key");
			return defaultKeys.FREESOUND_API_KEY;
		}
		log.info("[API Key] No FREESOUND_API_KEY in default config");
	} catch (error: any) {
		log.error("[API Key] Failed to load default keys:", error);
		log.warn("[Sound Handler] No default keys available:", error.message);

		// Fallback: Load from build-time environment or configuration
		const EMBEDDED_DEFAULT_KEY: string =
			process.env.DEFAULT_FREESOUND_KEY || "";
		if (!EMBEDDED_DEFAULT_KEY) {
			log.warn("[API Key] No embedded default key available");
			return null;
		}
		log.info("[API Key] Using embedded default key from environment");
		log.info("[Sound Handler] Using embedded API key from configuration");
		return EMBEDDED_DEFAULT_KEY;
	}

	// Priority 3: Fall back to environment variable (development)
	if (process.env.FREESOUND_API_KEY) {
		log.info("[Sound Handler] Using environment variable API key");
		return process.env.FREESOUND_API_KEY;
	}

	// Priority 4: Try loading from .env.local files (legacy support)
	try {
		const dotenv = require("dotenv");
		const envPaths: string[] = [
			path.join(__dirname, "../apps/web/.env.local"),
			path.join(__dirname, "../.env.local"),
			path.join(__dirname, "../../apps/web/.env.local"),
		];

		for (const envPath of envPaths) {
			const result = dotenv.config({ path: envPath });
			if (!result.error && process.env.FREESOUND_API_KEY) {
				log.info(`[Sound Handler] Loaded API key from: ${envPath}`);
				return process.env.FREESOUND_API_KEY;
			}
		}
	} catch (error: any) {
		log.warn("[Sound Handler] dotenv not available:", error.message);
	}

	return null;
}

/**
 * Setup sound search IPC handlers
 * Handles Freesound API integration for sound search functionality
 */
export function setupSoundIPC(): void {
	// Handle sound search requests - ENHANCED to match Next.js API exactly
	ipcMain.handle(
		"sounds:search",
		async (
			event: IpcMainInvokeEvent,
			searchParams: SearchParams
		): Promise<SearchResponse> => {
			log.info("=== SOUND SEARCH DEBUG START ===");
			log.info(
				"[Sound Handler] Search request received:",
				JSON.stringify(searchParams)
			);

			try {
				// Validate input parameters (same validation as Next.js API)
				const {
					q: query,
					type = "effects",
					page = 1,
					page_size: pageSize = 20,
					sort = "downloads",
					min_rating = 3,
					commercial_only = true,
				} = searchParams;

				log.info("[Sound Handler] Getting API key...");
				const FREESOUND_API_KEY: string | null = await getFreesoundApiKey();
				log.info(
					"[Sound Handler] API key available:",
					Boolean(FREESOUND_API_KEY)
				);

				if (!FREESOUND_API_KEY) {
					log.error("[Sound Handler] No API key found!");
					return {
						success: false,
						error: "Freesound API key not configured",
					};
				}

				const baseUrl: string = "https://freesound.org/apiv2/search/text/";

				// Use score sorting for search queries, downloads for top sounds (same as Next.js)
				const sortParam: string = query
					? sort === "score"
						? "score"
						: `${sort}_desc`
					: `${sort}_desc`;

				// Build query parameters (enhanced to match Next.js exactly)
				const params = new URLSearchParams({
					query: query || "",
					token: FREESOUND_API_KEY,
					page: page.toString(),
					page_size: pageSize.toString(),
					sort: sortParam,
					fields:
						"id,name,description,url,previews,download,duration,filesize,type,channels,bitrate,bitdepth,samplerate,username,tags,license,created,num_downloads,avg_rating,num_ratings",
				});

				for (const filter of buildFreesoundSearchFilters({
					type,
					minRating: min_rating,
					commercialOnly: commercial_only,
				})) {
					params.append("filter", filter);
				}

				const finalUrl: string = `${baseUrl}?${params.toString()}`;
				log.info(
					"[Sound Handler] Final URL (masked):",
					finalUrl.replace(FREESOUND_API_KEY, "***")
				);
				log.info(
					"[Sound Handler] Making request to:",
					finalUrl.replace(FREESOUND_API_KEY, "***")
				);

				// Make HTTPS request
				log.info("[Sound Handler] Starting HTTPS request...");
				const response: HttpResponse = await new Promise((resolve, reject) => {
					const req = https.get(finalUrl, (res) => {
						log.info("[Sound Handler] Response status code:", res.statusCode);
						let data = "";
						res.on("data", (chunk) => {
							data += chunk;
						});
						res.on("end", () => {
							log.info("[Sound Handler] Response data length:", data.length);
							if (res.statusCode !== 200) {
								log.error(
									"[Sound Handler] Response body:",
									data.substring(0, 500)
								);
							}
							resolve({
								statusCode: res.statusCode,
								body: data,
								ok: res.statusCode! >= 200 && res.statusCode! < 300,
							});
						});
					});

					req.on("error", (error: Error) => {
						log.error("[Sound Handler] Request error:", error);
						reject(error);
					});
					req.setTimeout(30_000, () => {
						log.error("[Sound Handler] Request timeout!");
						req.destroy();
						reject(new Error("Request timeout"));
					});
				});

				if (!response.ok) {
					log.error("[Sound Handler] API request failed!");
					log.error("[Sound Handler] Status:", response.statusCode);
					log.error("[Sound Handler] Body:", response.body.substring(0, 500));
					log.error(
						"[Sound Handler] API request failed:",
						response.statusCode,
						response.body
					);

					let errorMessage = "Failed to search sounds";
					if (response.statusCode === 401) {
						errorMessage =
							"Invalid API key. Please check your API key in Settings → API Keys";
					} else if (response.statusCode === 403) {
						errorMessage =
							"API key rate limit exceeded. Please try again later";
					} else if (response.statusCode === 404) {
						errorMessage = "API endpoint not found";
					} else if (response.statusCode! >= 500) {
						errorMessage = "Freesound server error. Please try again later";
					}

					return {
						success: false,
						error: `${errorMessage} (Status: ${response.statusCode})`,
						status: response.statusCode,
					};
				}

				log.info("[Sound Handler] API request successful, parsing response...");

				const rawData: {
					count: number;
					next: string | null;
					previous: string | null;
					results: FreesoundResult[];
				} = JSON.parse(response.body);

				// Transform results to match frontend expectations
				const transformedResults: TransformedResult[] = rawData.results.map(
					(result: FreesoundResult) => ({
						id: result.id,
						name: result.name,
						description: result.description,
						url: result.url,
						previewUrl:
							result.previews?.["preview-hq-mp3"] ||
							result.previews?.["preview-lq-mp3"],
						downloadUrl: result.download,
						duration: result.duration,
						filesize: result.filesize,
						type: result.type,
						channels: result.channels,
						bitrate: result.bitrate,
						bitdepth: result.bitdepth,
						samplerate: result.samplerate,
						username: result.username,
						tags: result.tags,
						license: result.license,
						created: result.created,
						downloads: result.num_downloads || 0,
						rating: result.avg_rating || 0,
						ratingCount: result.num_ratings || 0,
					})
				);

				const responseData = {
					count: rawData.count,
					next: rawData.next,
					previous: rawData.previous,
					results: transformedResults,
					query: query || "",
					type: type || "effects",
					page,
					pageSize,
					sort,
					minRating: min_rating,
				};

				log.info(
					"[Sound Handler] Returning",
					transformedResults.length,
					"results"
				);
				log.info("=== SOUND SEARCH DEBUG END (SUCCESS) ===");

				// Return format that matches Next.js API exactly
				return {
					success: true,
					...responseData, // Spread response data directly (matches Next.js format)
				};
			} catch (error: any) {
				log.error("=== SOUND SEARCH ERROR ===");
				log.error("[Sound Handler] Error type:", error.constructor.name);
				log.error("[Sound Handler] Error message:", error.message);
				log.error("[Sound Handler] Error stack:", error.stack);
				log.error("[Sound Handler] Full error:", error);
				log.error("[Sound Handler] Error occurred:", error);

				// Provide more specific error messages
				let errorMessage: string = error.message || "Unknown error occurred";
				if (error.code === "ENOTFOUND") {
					errorMessage =
						"Cannot connect to Freesound. Check your internet connection";
				} else if (error.code === "ETIMEDOUT") {
					errorMessage = "Request timed out. Check your internet connection";
				} else if (error.message.includes("Request timeout")) {
					errorMessage = "Request timed out after 30 seconds";
				}

				return {
					success: false,
					error: `Sound search failed: ${errorMessage}`,
				};
			}
		}
	);

	// Download and cache audio preview
	ipcMain.handle(
		"sounds:download-preview",
		async (
			event: IpcMainInvokeEvent,
			{ url, id }: { url: string; id: string | number }
		): Promise<DownloadResponse> => {
			log.info("[Sound Handler] Downloading preview for sound:", id);
			try {
				const tempDir: string = path.join(app.getPath("temp"), "qcut-previews");

				// Create temp directory if it doesn't exist
				if (!fs.existsSync(tempDir)) {
					fs.mkdirSync(tempDir, { recursive: true });
				}

				// Sanitize the ID to prevent path traversal
				const safeId: string = String(id).replace(/[^a-z0-9_-]/gi, "_");
				const fileName: string = `preview-${safeId}.mp3`;
				const filePath: string = path.join(tempDir, fileName);

				// Check if already cached
				if (fs.existsSync(filePath)) {
					log.info("[Sound Handler] Preview already cached:", filePath);
					return { success: true, path: pathToFileURL(filePath).href };
				}

				// Download the file
				return new Promise((resolve) => {
					// Validate URL for security
					let target: URL;
					try {
						target = new URL(url);
					} catch {
						return resolve({ success: false, error: "Invalid URL" });
					}

					// Allow only HTTPS and specific Freesound domains
					const allowedHosts: string[] = ["freesound.org", "cdn.freesound.org"];
					const isAllowedHost: boolean = allowedHosts.some(
						(h) => target.hostname === h || target.hostname.endsWith(`.${h}`)
					);

					if (target.protocol !== "https:" || !isAllowedHost) {
						log.error("[Sound Handler] Blocked URL:", url);
						return resolve({
							success: false,
							error: "URL not allowed - must be HTTPS Freesound domain",
						});
					}

					const file = fs.createWriteStream(filePath);

					https
						.get(target, (response) => {
							if (response.statusCode !== 200) {
								log.error(
									"[Sound Handler] Preview download failed:",
									response.statusCode
								);
								resolve({
									success: false,
									error: `Download failed: ${response.statusCode}`,
								});
								return;
							}

							response.pipe(file);

							file.on("finish", () => {
								file.close();
								log.info("[Sound Handler] Preview downloaded:", filePath);
								resolve({
									success: true,
									path: pathToFileURL(filePath).href,
								});
							});

							file.on("error", (err: Error) => {
								fs.unlink(filePath, () => {}); // Delete partial file
								log.error("[Sound Handler] File write error:", err);
								resolve({
									success: false,
									error: err.message,
								});
							});
						})
						.on("error", (err: Error) => {
							log.error("[Sound Handler] Download error:", err);
							resolve({
								success: false,
								error: err.message,
							});
						});
				});
			} catch (error: any) {
				log.error("[Sound Handler] Preview download error:", error);
				return {
					success: false,
					error: error.message,
				};
			}
		}
	);

	// Test API key validity
	ipcMain.handle(
		"sounds:test-key",
		async (
			event: IpcMainInvokeEvent,
			apiKey: string
		): Promise<TestKeyResponse> => {
			log.info("[Sound Handler] Testing API key validity");
			try {
				if (!apiKey) {
					return {
						success: false,
						message: "No API key provided",
					};
				}

				const testUrl: string = `https://freesound.org/apiv2/search/text/?query=test&token=${apiKey}&page_size=1`;

				const response: HttpResponse = await new Promise((resolve, reject) => {
					const req = https.get(testUrl, (res) => {
						let data = "";
						res.on("data", (chunk) => {
							data += chunk;
						});
						res.on("end", () => {
							resolve({
								statusCode: res.statusCode,
								body: data,
							});
						});
					});

					req.on("error", reject);
					req.setTimeout(10_000, () => {
						req.destroy();
						reject(new Error("Request timeout"));
					});
				});

				if (response.statusCode === 200) {
					log.info("[Sound Handler] API key is valid");
					return {
						success: true,
						message: "API key is valid",
					};
				}
				if (response.statusCode === 401) {
					log.warn("[Sound Handler] Invalid API key");
					return {
						success: false,
						message: "Invalid API key",
					};
				}
				log.warn("[Sound Handler] Unexpected response:", response.statusCode);
				return {
					success: false,
					message: `Unexpected response: ${response.statusCode}`,
				};
			} catch (error: any) {
				log.error("[Sound Handler] Test key error:", error);
				return {
					success: false,
					message: error.message || "Test failed",
				};
			}
		}
	);
}

// CommonJS export for backward compatibility with main.js
module.exports = { setupSoundIPC };

// ES6 export for TypeScript files
export default { setupSoundIPC };
export type {
	Logger,
	ApiKeysConfig,
	DefaultKeys,
	SearchParams,
	FreesoundResult,
	TransformedResult,
	SearchResponse,
	DownloadResponse,
	TestKeyResponse,
	HttpResponse,
};
