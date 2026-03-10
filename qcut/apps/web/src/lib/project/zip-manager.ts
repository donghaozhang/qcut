import JSZip from "jszip";
import type { MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";

// Debug flag - set to true to enable console logging
const DEBUG_ZIP_MANAGER = import.meta.env.DEV && false;
const logDebug = (...args: Parameters<typeof console.log>) => {
	if (DEBUG_ZIP_MANAGER) console.log(...args);
};

export interface ZipExportOptions {
	filename?: string;
	compression?: "DEFLATE" | "STORE";
	compressionLevel?: number;
	includeMetadata?: boolean;
}

export class ZipManager {
	private zip: JSZip;
	private readonly defaultOptions: ZipExportOptions = {
		filename: "media-export.zip",
		compression: "DEFLATE",
		compressionLevel: 6,
		includeMetadata: true,
	};

	constructor() {
		this.zip = new JSZip();
	}

	/**
	 * Add media items to the ZIP, preferring more reliable sources (localPath for AI videos)
	 * and optionally reporting progress.
	 */
	async addMediaItems(
		items: MediaItem[],
		onProgress?: (progress: number) => void
	): Promise<void> {
		const total = items.length;
		let completed = 0;

		logDebug("step 9: zip-manager starting addMediaItems", {
			totalItems: total,
			itemsWithFile: items.filter((item) => !!item.file).length,
			itemsWithLocalPath: items.filter((item) => !!item.localPath).length,
			itemsWithUrl: items.filter((item) => !!item.url).length,
			electronAPIAvailable: true,
			readFileAvailable: true,
		});

		logDebug("?? ZIP-MANAGER: Starting to add media items", {
			totalItems: total,
			generatedImages: items.filter(
				(item) => item.metadata?.source === "text2image"
			).length,
		});

		for (const item of items) {
			let addedToZip = false;
			logDebug("step 9a: processing item", {
				index: completed,
				name: item.name,
				hasFile: !!item.file,
				hasLocalPath: !!item.localPath,
				localPath: item.localPath,
				hasUrl: !!item.url,
				url: item.url?.substring(0, 50),
				type: item.type,
			});
			try {
				// Get the filename
				let filename = item.name;

				// Fix missing extensions for generated images
				if (
					item.metadata?.source === "text2image" &&
					item.file &&
					!this.hasValidExtension(filename)
				) {
					const mimeType = item.file.type || "image/png";
					const extension = mimeType.split("/")[1] || "png";
					filename = `${filename}.${extension}`;
					if (DEBUG_ZIP_MANAGER)
						logDebug(
							"?? ZIP-MANAGER: Fixed missing extension for generated image:",
							"originalName:",
							item.name,
							"fixedName:",
							filename,
							"mimeType:",
							mimeType
						);
				}
				// Fix missing extensions for videos (AI or not)
				if (item.type === "video" && !this.hasValidExtension(filename)) {
					// Prefer extension from localPath, then MIME type, then default mp4
					const pathExtMatch = item.localPath?.match(/\.([a-zA-Z0-9]+)$/);
					const mimeType = item.file?.type;
					const extFromMime = mimeType?.split("/")[1];
					const videoExtension = pathExtMatch?.[1] || extFromMime || "mp4";
					filename = `${filename}.${videoExtension}`;
					logDebug("step 9a-extension-fix", {
						originalName: item.name,
						addedExtension: videoExtension,
						hadValidExtension: this.hasValidExtension(item.name),
						localPath: item.localPath,
						mimeType,
					});
				}

				// Resolve filename conflicts
				const resolvedFilename = this.resolveFilename(filename);
				logDebug("step 9a-filename", {
					originalName: item.name,
					initialName: filename,
					resolvedFilename,
				});
				filename = resolvedFilename;

				if (DEBUG_ZIP_MANAGER)
					logDebug(
						"?? ZIP-MANAGER: Processing item:",
						"name:",
						item.name,
						"finalFilename:",
						filename,
						"hasFile:",
						!!item.file,
						"type:",
						item.type,
						"isGenerated:",
						item.metadata?.source === "text2image"
					);

				// PRIORITY 1: AI-generated videos with localPath - read from disk for reliability
				const isAIGenerated = this.isAIGeneratedVideo(item);

				logDebug("step 9a-ai-check: AI detection", {
					name: item.name,
					metadata: item.metadata,
					isAIGenerated,
					hasLocalPath: !!item.localPath,
					localPath: item.localPath,
				});

				// If has BOTH file and localPath, prefer localPath for videos (likely AI generated)
				// ALWAYS prefer localPath for videos as it's more reliable than File objects
				const shouldUseLocalPath =
					isAIGenerated || (item.type === "video" && item.localPath);

				if (
					shouldUseLocalPath &&
					item.localPath
				) {
					logDebug(
						"step 9b-ai: AI video detected, prioritizing localPath read",
						{
							filename,
							localPath: item.localPath,
							metadataSource: item.metadata?.source,
							name: item.name,
						}
					);

					try {
						const fileBuffer = await platform().files.readFile(
							item.localPath
						);
						logDebug("step 9b-ai-read: readFile returned for AI video", {
							bufferExists: !!fileBuffer,
							bufferLength: fileBuffer ? fileBuffer.length : 0,
						});

						if (fileBuffer) {
							const uint8Array = this.normalizeToUint8Array(
								fileBuffer,
								"step 9b-ai-buffer",
								item.name,
								filename
							);

							if (uint8Array) {
								this.zip.file(filename, uint8Array, { binary: true });
								addedToZip = true;
								logDebug("step 9b-ai-success: AI video added from localPath", {
									fileName: filename,
									fileSize: uint8Array.length,
									localPath: item.localPath,
								});
							}
						} else {
							console.error(
								"step 9b-ai-fail: Failed to read AI video from localPath",
								{
									name: item.name,
									localPath: item.localPath,
								}
							);
							// Fall through to try File object as backup
						}
					} catch (error) {
						console.error(
							"step 9b-ai-error: Error reading AI video from localPath",
							{
								name: item.name,
								localPath: item.localPath,
								error: error instanceof Error ? error.message : String(error),
							}
						);
						// Fall through to try File object as backup
					}
				}
				// PRIORITY 2: Regular files with File object (user uploads, etc)
				if (!addedToZip && item.file) {
					logDebug("step 9b: adding file directly to ZIP", {
						filename,
						fileSize: item.file.size,
						fileType: item.file.type,
						isAIGenerated: false,
					});
					this.zip.file(filename, item.file);
					logDebug("step 9c: file added successfully via File object");
					addedToZip = true;
					if (DEBUG_ZIP_MANAGER)
						logDebug(
							"? ZIP-MANAGER: Added to ZIP:",
							"filename:",
							filename,
							"size:",
							item.file.size
						);
				}
				// PRIORITY 3: Non-AI files with localPath
				if (!addedToZip && item.localPath) {
					// Handle local file path for Electron (AI videos saved to disk)
					logDebug("step 9d: attempting to read local file", {
						localPath: item.localPath,
						electronAPIAvailable: true,
						readFileAvailable: true,
					});
					try {
						const fileBuffer = await platform().files.readFile(
							item.localPath
						);
						logDebug("step 9e: readFile returned", {
							bufferExists: !!fileBuffer,
							bufferType: fileBuffer
								? Object.prototype.toString.call(fileBuffer)
								: "null",
							bufferLength: fileBuffer ? fileBuffer.length : 0,
							isArrayBuffer: fileBuffer
								? fileBuffer instanceof ArrayBuffer
								: false,
						});
						if (fileBuffer) {
							const uint8Array = this.normalizeToUint8Array(
								fileBuffer,
								"step 9f",
								item.name,
								filename
							);

							if (uint8Array) {
								this.zip.file(filename, uint8Array, { binary: true });
								addedToZip = true;
								logDebug("step 9j: local file added successfully to ZIP");
							}
							if (DEBUG_ZIP_MANAGER)
								logDebug(
									"? ZIP-MANAGER: Added local file to ZIP:",
									"filename:",
									filename,
									"localPath:",
									item.localPath,
									"size:",
									fileBuffer.length
								);
						} else {
							console.warn("step 9k: readFile returned null/undefined", {
								name: item.name,
								localPath: item.localPath,
							});
						}
					} catch (error) {
						console.error("step 9l: error reading local file", {
							name: item.name,
							localPath: item.localPath,
							error: error instanceof Error ? error.message : String(error),
							errorStack: error instanceof Error ? error.stack : undefined,
						});
					}
				} else {
					const originalUrl = (item as any).originalUrl as string | undefined;
					const urlToFetch =
						(originalUrl && typeof originalUrl === "string" && originalUrl) ||
						item.url;

					if (
						!addedToZip &&
						urlToFetch &&
						(urlToFetch.startsWith("http") || urlToFetch.startsWith("blob:"))
					) {
						const controller = new AbortController();
						const timeoutId = window.setTimeout(
							() => controller.abort(),
							120_000
						);
						try {
							const resp = await fetch(urlToFetch, {
								signal: controller.signal,
							});
							if (!resp.ok) {
								throw new Error(`HTTP ${resp.status}`);
							}
							const blob = await resp.blob();
							const inferredType =
								blob.type ||
								(item.type === "video"
									? "video/mp4"
									: item.type === "audio"
										? "audio/mpeg"
										: "application/octet-stream");

							const hasExtension = filename.includes(".");
							let finalFilename = filename;
							if (!hasExtension) {
								const extensionFromType = inferredType.split("/")[1] || "bin";
								finalFilename = `${filename}.${extensionFromType}`;
							}

							const fetchedFile = new File([blob], finalFilename, {
								type: inferredType,
							});
							this.zip.file(finalFilename, fetchedFile);
							addedToZip = true;
							if (DEBUG_ZIP_MANAGER)
								logDebug("? ZIP-MANAGER: Fetched URL-only item into ZIP", {
									filename: finalFilename,
									size: fetchedFile.size,
									type: inferredType,
									url: urlToFetch,
								});
						} catch (fetchError) {
							console.warn("step 8: export-all zip fetch failed", {
								name: item.name,
								url: urlToFetch,
								error:
									fetchError instanceof Error
										? fetchError.message
										: String(fetchError),
							});
						} finally {
							window.clearTimeout(timeoutId);
						}
					} else if (!addedToZip) {
						console.warn(
							"step 8: export-all zip skipped item (no file or fetchable url)",
							{
								name: item.name,
								hasFile: !!item.file,
								url: item.url,
								originalUrl,
							}
						);
					}
				}

				completed++;
				onProgress?.(completed / total);
				logDebug("step 9m: item processing complete", {
					itemName: item.name,
					completed,
					total,
					progress: `${completed}/${total}`,
				});
			} catch (error) {
				console.error(`step 9n: Failed to add ${item.name} to ZIP:`, error);
				// Continue with other files
			}
		}

		logDebug("step 9o: all items processed", {
			totalProcessed: completed,
			totalItems: total,
			zipFiles: Object.keys(this.zip.files).length,
			zipFileNames: Object.keys(this.zip.files),
		});
	}

	/**
	 * Generate a ZIP blob with the accumulated entries.
	 */
	async generateZip(options: Partial<ZipExportOptions> = {}): Promise<Blob> {
		const opts = { ...this.defaultOptions, ...options };

		logDebug("step 10: generating ZIP blob", {
			filesInZip: Object.keys(this.zip.files).length,
			compression: opts.compression,
			compressionLevel: opts.compressionLevel,
		});

		const blob = await this.zip.generateAsync({
			type: "blob",
			compression: opts.compression,
			compressionOptions: {
				level: opts.compressionLevel ?? 6,
			},
			// Ensure proper Unicode handling
			platform: "UNIX", // Better Unicode support than DOS
			comment: "Created by QCut",
		});

		logDebug("step 10a: ZIP blob generated", {
			blobSize: blob.size,
			blobType: blob.type,
			sizeKB: (blob.size / 1024).toFixed(2),
			sizeMB: (blob.size / 1024 / 1024).toFixed(2),
		});

		return blob;
	}

	private resolveFilename(originalName: string): string {
		const files = Object.keys(this.zip.files);
		let filename = this.sanitizeFilenameForWindows(originalName);
		let counter = 1;

		while (files.includes(filename)) {
			const ext = originalName.split(".").pop();
			const base = originalName.replace(`.${ext}`, "");
			filename = `${this.sanitizeFilenameForWindows(base)} (${counter}).${ext}`;
			counter++;
		}

		return filename;
	}

	private sanitizeFilenameForWindows(filename: string): string {
		// Windows reserved characters (excluding control characters for simplicity)
		const reservedChars = /[<>:"|?*]/g;

		// Windows reserved names
		const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

		let sanitized = filename.replace(reservedChars, "_");

		// Trim trailing spaces or dots that Windows Explorer cannot create
		sanitized = sanitized.trim().replace(/[. ]+$/, "");

		// Handle reserved names
		if (reservedNames.test(sanitized)) {
			sanitized = `file_${sanitized}`;
		}

		// Ensure Unicode characters are properly encoded
		sanitized = sanitized.normalize("NFC");

		// Fallback if name collapses to empty
		if (!sanitized) sanitized = "file";

		return sanitized;
	}

	private hasValidExtension(name: string): boolean {
		const trimmed = name.trim();
		// Accept a dot followed by 2-6 alphanumeric chars at the end (e.g., .mp4, .webm)
		return /\.[A-Za-z0-9]{2,6}$/.test(trimmed);
	}

	/** Reset the underlying JSZip instance for a fresh export. */
	reset(): void {
		this.zip = new JSZip();
	}

	// Detect AI-generated videos: prefer metadata, fall back to ai-videos folder heuristic.
	private isAIGeneratedVideo(item: MediaItem): boolean {
		if (
			item.metadata?.source === "text2video" ||
			item.metadata?.source === "ai-generated"
		) {
			return true;
		}

		if (
			item.type === "video" &&
			item.localPath?.toLowerCase().includes("ai-videos")
		) {
			return true;
		}

		return false;
	}

	/**
	 * Normalize various buffer-like inputs into a Uint8Array, logging details for debugging.
	 */
	private normalizeToUint8Array(
		fileBuffer: unknown,
		logLabel: string,
		itemName: string,
		filename: string
	): Uint8Array | null {
		const typeTag = Object.prototype.toString.call(fileBuffer);
		try {
			const bufferAsAny = fileBuffer as any;
			let uint8Array: Uint8Array | null = null;

			if (bufferAsAny instanceof Uint8Array) {
				uint8Array = bufferAsAny;
			} else if (bufferAsAny instanceof ArrayBuffer) {
				uint8Array = new Uint8Array(bufferAsAny);
			} else if (bufferAsAny?.data && Array.isArray(bufferAsAny.data)) {
				uint8Array = new Uint8Array(bufferAsAny.data);
			} else if (bufferAsAny?.type === "Buffer" && bufferAsAny?.data) {
				uint8Array = new Uint8Array(bufferAsAny.data);
			} else if (bufferAsAny != null) {
				try {
					uint8Array = new Uint8Array(bufferAsAny as any);
				} catch {
					console.warn(`${logLabel}: unable to coerce buffer to Uint8Array`, {
						itemName,
						originalType: typeTag,
					});
				}
			}

			logDebug(`${logLabel}: normalized buffer`, {
				itemName,
				filename,
				originalType: typeTag,
				hasDataProp: !!bufferAsAny?.data,
				length: uint8Array?.length ?? 0,
				firstBytes: uint8Array
					? Array.from(uint8Array.slice(0, 20))
							.map((b) => b.toString(16).padStart(2, "0"))
							.join(" ")
					: "n/a",
			});

			if (!uint8Array || uint8Array.length === 0) {
				console.error(`${logLabel}-empty`, {
					itemName,
					filename,
					originalType: typeTag,
				});
				return null;
			}

			return uint8Array;
		} catch (error) {
			console.error(`${logLabel}-error`, {
				itemName,
				filename,
				originalType: typeTag,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}
}

// Safe download utility to replace the problematic one
export async function downloadZipSafely(
	blob: Blob,
	filename: string
): Promise<void> {
	logDebug("step 11: downloadZipSafely called", {
		blobSize: blob.size,
		blobType: blob.type,
		filename,
		electronAPIAvailable: true,
		saveBlobAvailable: true,
	});

	// Try platform save
	try {
		logDebug("step 11a: converting blob to array buffer");
		// Convert blob to array buffer for Electron
		const arrayBuffer = await blob.arrayBuffer();
		logDebug("step 11b: arrayBuffer created", {
			byteLength: arrayBuffer.byteLength,
		});

		const uint8Array = new Uint8Array(arrayBuffer);
		logDebug("step 11c: calling platform().files.saveBlob", {
			uint8ArrayLength: uint8Array.length,
			uint8ArrayByteLength: uint8Array.byteLength,
			filename,
		});

		const result = await platform().files.saveBlob(uint8Array, filename);
		logDebug("step 11d: saveBlob returned", {
			success: result.success,
			filePath: result.filePath,
			canceled: result.canceled,
			error: result.error,
		});

		if (result.success) {
			logDebug("ZIP saved successfully via platform:", result.filePath);
			return;
		}
		if (result.canceled) {
			logDebug("ZIP save canceled by user");
			return;
		}
		console.error("Failed to save ZIP via platform:", result.error);
	} catch (error) {
		console.error("step 11e: Platform save failed", {
			error: error instanceof Error ? error.message : String(error),
			errorStack: error instanceof Error ? error.stack : undefined,
		});
		// Fall through to browser methods
	}

	// Use modern File System Access API if available (browser)
	if ("showSaveFilePicker" in window) {
		try {
			const fileHandle = await (window as any).showSaveFilePicker({
				suggestedName: filename,
				types: [
					{
						description: "ZIP files",
						accept: { "application/zip": [".zip"] },
					},
				],
			});

			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();
			return;
		} catch (error) {
			// Fall back to traditional download if user cancels or API unavailable
		}
	}

	// Traditional download with navigation bug prevention (browser fallback)
	const url = URL.createObjectURL(blob);

	// Create download in a way that prevents navigation
	const iframe = document.createElement("iframe");
	iframe.style.display = "none";
	document.body.appendChild(iframe);

	const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
	if (iframeDoc) {
		const link = iframeDoc.createElement("a");
		link.href = url;
		link.download = filename;
		iframeDoc.body.appendChild(link);
		link.click();
		iframeDoc.body.removeChild(link);
	}

	// Cleanup
	setTimeout(() => {
		document.body.removeChild(iframe);
		URL.revokeObjectURL(url);
	}, 100);
}
