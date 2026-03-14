/**
 * Claude Media API Handler
 * Provides media file management capabilities for Claude Code integration
 */

import { ipcMain } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import {
	getMediaPath,
	isValidSourcePath,
	getMediaType,
	generateId,
	sanitizeFilename,
} from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import type {
	MediaFile,
	BatchImportItem,
	BatchImportResult,
} from "../../types/claude-api";

const HANDLER_NAME = "Media";

/**
 * Generate a unique filename if file already exists
 * Appends numeric suffix: file.mp4 -> file_1.mp4 -> file_2.mp4
 */
async function getUniqueFilePath(
	dir: string,
	fileName: string
): Promise<string> {
	const ext = path.extname(fileName);
	const baseName = path.basename(fileName, ext);
	let destPath = path.join(dir, fileName);
	let counter = 1;

	while (true) {
		try {
			await fs.access(destPath);
			// File exists, try next suffix
			destPath = path.join(dir, `${baseName}_${counter}${ext}`);
			counter++;
		} catch {
			// File doesn't exist, use this path
			return destPath;
		}
	}
}

/**
 * Scan a single directory for media files and append to the results array.
 * For symlinks, resolves the original filename for name-based matching.
 */
async function scanMediaDirectory(
	dirPath: string,
	files: MediaFile[]
): Promise<void> {
	let dirEntries: import("fs").Dirent[];
	try {
		dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return; // Directory doesn't exist or isn't readable
	}

	for (const entry of dirEntries) {
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const entryName = String(entry.name);
		const filePath = path.join(dirPath, entryName);

		// Validate symlink targets — skip broken symlinks
		if (entry.isSymbolicLink()) {
			try {
				await fs.stat(filePath); // follows symlinks, throws if target missing
			} catch {
				claudeLog.warn(HANDLER_NAME, `Skipping broken symlink: ${entryName}`);
				continue;
			}
		}

		let stat: import("fs").Stats;
		try {
			stat = await fs.stat(filePath);
		} catch {
			continue; // Inaccessible file — skip without aborting scan
		}

		// For symlinks, resolve the original filename for better name-based matching.
		// Files in media/imported/ are named by mediaId, but the symlink target
		// has the original filename that matches timeline element sourceName.
		let displayName = entryName;
		let resolvedExt = path.extname(entryName);
		if (entry.isSymbolicLink()) {
			try {
				const target = await fs.readlink(filePath);
				const targetBasename = path.basename(String(target));
				if (targetBasename) {
					displayName = targetBasename;
					// Use target extension when entry name is extensionless (e.g. ID-named symlinks)
					if (!resolvedExt) {
						resolvedExt = path.extname(targetBasename);
					}
				}
			} catch {
				// Keep entryName as fallback
			}
		}

		const type = getMediaType(resolvedExt);
		if (!type) continue;

		const deterministicId = `media_${Buffer.from(entryName).toString("base64url")}`;
		files.push({
			id: deterministicId,
			name: displayName,
			type,
			path: filePath,
			size: stat.size,
			createdAt: stat.birthtimeMs,
			modifiedAt: stat.mtimeMs,
		});
	}
}

/**
 * List media files in a project — shared between IPC and HTTP handlers.
 * Scans both the top-level media/ directory and media/imported/ subdirectory,
 * since the UI's media import handler stores files in the latter.
 */
export async function listMediaFiles(projectId: string): Promise<MediaFile[]> {
	const mediaPath = getMediaPath(projectId);
	const files: MediaFile[] = [];

	try {
		// Check if base media directory exists
		try {
			await fs.access(mediaPath);
		} catch {
			claudeLog.info(
				HANDLER_NAME,
				"Media directory does not exist, returning empty array"
			);
			return [];
		}

		// Scan top-level media directory
		await scanMediaDirectory(mediaPath, files);

		// Also scan media/imported/ — where the UI's media-import-handler stores files
		const importedPath = path.join(mediaPath, "imported");
		await scanMediaDirectory(importedPath, files);

		claudeLog.info(HANDLER_NAME, `Found ${files.length} media files`);
		return files;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to list media:", error);
		return [];
	}
}

/**
 * Get info for a specific media file by ID
 */
export async function getMediaInfo(
	projectId: string,
	mediaId: string
): Promise<MediaFile | null> {
	claudeLog.info(
		HANDLER_NAME,
		`Getting info for media in project ${projectId}`
	);

	try {
		const normalizedMediaId = mediaId.trim();
		if (!normalizedMediaId) {
			return null;
		}

		const allMedia = await listMediaFiles(projectId);
		for (const media of allMedia) {
			if (media.id === normalizedMediaId) {
				return media;
			}
		}

		for (const media of allMedia) {
			try {
				const fileName = path.basename(media.path);
				const fileStem = path.basename(fileName, path.extname(fileName));
				if (
					fileStem === normalizedMediaId ||
					fileName === normalizedMediaId ||
					media.name === normalizedMediaId
				) {
					claudeLog.info(
						HANDLER_NAME,
						`Resolved mediaId ${normalizedMediaId} via filename fallback (${fileName})`
					);
					return media;
				}
			} catch {
				// Skip malformed file paths and continue matching.
			}
		}

		return null;
	} catch (error) {
		claudeLog.error(
			HANDLER_NAME,
			`Failed to resolve media info for ${mediaId}:`,
			error
		);
		return null;
	}
}

/**
 * Import a media file from a source path into the project
 */
export async function importMediaFile(
	projectId: string,
	source: string
): Promise<MediaFile | null> {
	claudeLog.info(HANDLER_NAME, `Importing media from: ${source}`);

	if (!isValidSourcePath(source)) {
		claudeLog.error(HANDLER_NAME, "Source path failed security validation");
		return null;
	}

	const mediaPath = getMediaPath(projectId);

	try {
		const sourceStat = await fs.stat(source);
		if (!sourceStat.isFile()) {
			claudeLog.error(HANDLER_NAME, "Source is not a file");
			return null;
		}

		await fs.mkdir(mediaPath, { recursive: true });

		const fileName = sanitizeFilename(path.basename(source));
		if (!fileName) {
			claudeLog.error(HANDLER_NAME, "Invalid filename");
			return null;
		}

		const ext = path.extname(fileName);
		const type = getMediaType(ext);
		if (!type) {
			claudeLog.error(HANDLER_NAME, `Unsupported media type: ${ext}`);
			return null;
		}

		const destPath = await getUniqueFilePath(mediaPath, fileName);
		const actualFileName = path.basename(destPath);

		await fs.copyFile(source, destPath);
		const stat = await fs.stat(destPath);

		const mediaFile: MediaFile = {
			id: `media_${Buffer.from(actualFileName).toString("base64url")}`,
			name: actualFileName,
			type,
			path: destPath,
			size: stat.size,
			createdAt: stat.birthtimeMs,
			modifiedAt: stat.mtimeMs,
		};

		claudeLog.info(HANDLER_NAME, `Successfully imported: ${fileName}`);
		return mediaFile;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to import media:", error);
		return null;
	}
}

/**
 * Delete a media file by ID
 */
export async function deleteMediaFile(
	projectId: string,
	mediaId: string
): Promise<boolean> {
	claudeLog.info(HANDLER_NAME, `Deleting media: ${mediaId}`);

	try {
		const allMedia = await listMediaFiles(projectId);
		const mediaFile = allMedia.find((m) => m.id === mediaId);

		if (!mediaFile) {
			claudeLog.warn(HANDLER_NAME, `Media not found: ${mediaId}`);
			return false;
		}

		await fs.unlink(mediaFile.path);
		claudeLog.info(HANDLER_NAME, `Successfully deleted: ${mediaFile.name}`);
		return true;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to delete media:", error);
		return false;
	}
}

/**
 * Rename a media file by ID
 */
export async function renameMediaFile(
	projectId: string,
	mediaId: string,
	newName: string
): Promise<boolean> {
	claudeLog.info(HANDLER_NAME, `Renaming media ${mediaId} to: ${newName}`);

	const sanitizedName = sanitizeFilename(newName);
	if (!sanitizedName) {
		claudeLog.error(HANDLER_NAME, "Invalid new filename");
		return false;
	}

	try {
		const allMedia = await listMediaFiles(projectId);
		const mediaFile = allMedia.find((m) => m.id === mediaId);

		if (!mediaFile) {
			claudeLog.warn(HANDLER_NAME, `Media not found: ${mediaId}`);
			return false;
		}

		const originalExt = path.extname(mediaFile.name);
		const newNameWithExt = sanitizedName.includes(".")
			? sanitizedName
			: sanitizedName + originalExt;

		const mediaPath = getMediaPath(projectId);
		const newPath = await getUniqueFilePath(mediaPath, newNameWithExt);

		await fs.rename(mediaFile.path, newPath);
		claudeLog.info(
			HANDLER_NAME,
			`Successfully renamed: ${mediaFile.name} -> ${path.basename(newPath)}`
		);
		return true;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to rename media:", error);
		return false;
	}
}

// ============================================================================
// URL Import
// ============================================================================

const MAX_DOWNLOAD_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Validate URL is safe for download (http/https only, no private IPs)
 */
function validateDownloadUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("Invalid URL format");
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(
			`Unsupported URL scheme: ${parsed.protocol} (only http/https allowed)`
		);
	}

	// Block private/loopback IPs (basic SSRF prevention)
	const host = parsed.hostname.toLowerCase();
	const blocked = [
		"localhost",
		"127.0.0.1",
		"0.0.0.0",
		"::1",
		"[::1]",
		"169.254.",
	];
	if (blocked.some((b) => host === b || host.startsWith(b))) {
		throw new Error(
			"Downloads from private/loopback addresses are not allowed"
		);
	}

	return parsed;
}

/**
 * Extract a filename from Content-Disposition header or URL path
 */
function extractFilename(
	url: URL,
	headers: Headers,
	fallbackFilename?: string
): string {
	// Try Content-Disposition header first
	const disposition = headers.get("content-disposition");
	if (disposition) {
		const match = disposition.match(
			/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i
		);
		if (match?.[1]) {
			const decoded = decodeURIComponent(match[1].trim());
			const sanitized = sanitizeFilename(decoded);
			if (sanitized) return sanitized;
		}
	}

	// Fall back to URL path
	const urlPath = url.pathname;
	const basename = path.basename(urlPath);
	if (basename && basename !== "/" && path.extname(basename)) {
		const sanitized = sanitizeFilename(basename);
		if (sanitized) return sanitized;
	}

	// Fall back to provided name or generate one
	if (fallbackFilename) {
		const sanitized = sanitizeFilename(fallbackFilename);
		if (sanitized) return sanitized;
	}

	return `download_${Date.now()}.mp4`;
}

/**
 * Import a media file from a URL into the project.
 * Downloads via Node.js fetch with streaming to avoid memory spikes.
 */
export async function importMediaFromUrl(
	projectId: string,
	url: string,
	filename?: string
): Promise<MediaFile> {
	claudeLog.info(HANDLER_NAME, `Importing media from URL: ${url}`);

	const parsedUrl = validateDownloadUrl(url);
	const mediaPath = getMediaPath(projectId);
	await fs.mkdir(mediaPath, { recursive: true });

	// Start download with timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(parsedUrl.href, {
			signal: controller.signal,
			redirect: "follow",
			headers: { "User-Agent": "QCut-Desktop/1.0" },
		});
	} catch (error: unknown) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("Download timed out after 5 minutes");
		}
		throw new Error(
			`Download failed: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}

	if (!response.ok) {
		clearTimeout(timeoutId);
		throw new Error(
			`Download failed: HTTP ${response.status} ${response.statusText}`
		);
	}

	// Check content-length if available
	const contentLength = response.headers.get("content-length");
	if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
		clearTimeout(timeoutId);
		throw new Error(
			`File too large: ${parseInt(contentLength, 10)} bytes exceeds 5GB limit`
		);
	}

	const resolvedFilename = extractFilename(
		parsedUrl,
		response.headers,
		filename
	);
	const ext = path.extname(resolvedFilename);
	const type = getMediaType(ext);
	if (!type) {
		clearTimeout(timeoutId);
		throw new Error(`Unsupported media type: ${ext}`);
	}

	const destPath = await getUniqueFilePath(mediaPath, resolvedFilename);
	const actualFileName = path.basename(destPath);

	// Stream to disk
	try {
		if (!response.body) {
			throw new Error("Response has no body");
		}
		const writeStream = createWriteStream(destPath);
		await pipeline(response.body, writeStream);
	} catch (error: unknown) {
		clearTimeout(timeoutId);
		// Clean up partial file
		try {
			await fs.unlink(destPath);
		} catch {
			// Ignore cleanup errors
		}
		throw new Error(
			`Failed to save file: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	} finally {
		clearTimeout(timeoutId);
	}

	const stat = await fs.stat(destPath);
	if (stat.size === 0) {
		await fs.unlink(destPath);
		throw new Error("Downloaded file is empty");
	}

	const mediaFile: MediaFile = {
		id: `media_${Buffer.from(actualFileName).toString("base64url")}`,
		name: actualFileName,
		type,
		path: destPath,
		size: stat.size,
		createdAt: stat.birthtimeMs,
		modifiedAt: stat.mtimeMs,
	};

	claudeLog.info(
		HANDLER_NAME,
		`Successfully imported from URL: ${actualFileName} (${stat.size} bytes)`
	);
	return mediaFile;
}

// ============================================================================
// Batch Import
// ============================================================================

const MAX_BATCH_SIZE = 20;

/**
 * Import multiple media files from local paths and/or URLs in one call.
 * Items are processed sequentially to avoid I/O contention.
 */
export async function batchImportMedia(
	projectId: string,
	items: BatchImportItem[]
): Promise<BatchImportResult[]> {
	if (!Array.isArray(items) || items.length === 0) {
		throw new Error("Items array is required and must not be empty");
	}
	if (items.length > MAX_BATCH_SIZE) {
		throw new Error(
			`Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`
		);
	}

	claudeLog.info(HANDLER_NAME, `Batch importing ${items.length} items`);

	const results: BatchImportResult[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		try {
			let mediaFile: MediaFile | null = null;

			if (item.url) {
				mediaFile = await importMediaFromUrl(
					projectId,
					item.url,
					item.filename
				);
			} else if (item.path) {
				mediaFile = await importMediaFile(projectId, item.path);
			} else {
				throw new Error("Each item must have either 'url' or 'path'");
			}

			if (!mediaFile) {
				throw new Error("Import returned null");
			}

			results.push({ index: i, success: true, mediaFile });
		} catch (error: unknown) {
			results.push({
				index: i,
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	}

	const successCount = results.filter((r) => r.success).length;
	claudeLog.info(
		HANDLER_NAME,
		`Batch import complete: ${successCount}/${items.length} succeeded`
	);
	return results;
}

// ============================================================================
// Frame Extraction
// ============================================================================

/**
 * Extract a single frame from a video file at a given timestamp.
 * Uses FFmpeg via child_process (avoids IPC roundtrip).
 */
export async function extractFrame(
	projectId: string,
	mediaId: string,
	timestamp: number,
	format: "png" | "jpg" = "png"
): Promise<{ path: string; timestamp: number; format: string }> {
	claudeLog.info(
		HANDLER_NAME,
		`Extracting frame at ${timestamp}s from ${mediaId}`
	);

	const mediaFile = await getMediaInfo(projectId, mediaId);
	if (!mediaFile) {
		throw new Error(`Media not found: ${mediaId}`);
	}

	if (mediaFile.type !== "video") {
		throw new Error("Frame extraction is only supported for video files");
	}

	if (timestamp < 0) {
		throw new Error("Timestamp must be non-negative");
	}

	// Build output path in temp directory
	const os = await import("node:os");
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFile);

	const outputDir = os.tmpdir();
	const ext = format === "jpg" ? "jpg" : "png";
	const outputFilename = `qcut_frame_${mediaId}_${Math.round(timestamp * 1000)}.${ext}`;
	const outputPath = path.join(outputDir, outputFilename);

	// Find FFmpeg path
	let ffmpegPath: string;
	try {
		const ffmpegUtils = await import("../../ffmpeg/utils.js");
		ffmpegPath = ffmpegUtils.getFFmpegPath();
	} catch {
		ffmpegPath = "ffmpeg";
	}

	const args = [
		"-ss",
		String(timestamp),
		"-i",
		mediaFile.path,
		"-frames:v",
		"1",
		"-q:v",
		"2",
		"-y",
		outputPath,
	];

	try {
		await execFileAsync(ffmpegPath, args, { timeout: 30_000 });
	} catch (error: unknown) {
		throw new Error(
			`FFmpeg frame extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}

	// Verify output exists
	try {
		const stat = await fs.stat(outputPath);
		if (stat.size === 0) {
			throw new Error("Extracted frame is empty");
		}
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			"code" in error &&
			(error as NodeJS.ErrnoException).code === "ENOENT"
		) {
			throw new Error(
				"Frame extraction produced no output — timestamp may be beyond video duration"
			);
		}
		throw error;
	}

	claudeLog.info(HANDLER_NAME, `Frame extracted: ${outputPath}`);
	return { path: outputPath, timestamp, format: ext };
}

/** Register Claude media IPC handlers for listing, importing, deleting, and renaming media. */
export function setupClaudeMediaIPC(): void {
	claudeLog.info(HANDLER_NAME, "Setting up Media IPC handlers...");

	ipcMain.handle("claude:media:list", async (_event, projectId: string) =>
		listMediaFiles(projectId)
	);

	ipcMain.handle(
		"claude:media:info",
		async (_event, projectId: string, mediaId: string) =>
			getMediaInfo(projectId, mediaId)
	);

	ipcMain.handle(
		"claude:media:import",
		async (_event, projectId: string, source: string) =>
			importMediaFile(projectId, source)
	);

	ipcMain.handle(
		"claude:media:delete",
		async (_event, projectId: string, mediaId: string) =>
			deleteMediaFile(projectId, mediaId)
	);

	ipcMain.handle(
		"claude:media:rename",
		async (_event, projectId: string, mediaId: string, newName: string) =>
			renameMediaFile(projectId, mediaId, newName)
	);

	ipcMain.handle(
		"claude:media:importFromUrl",
		async (_event, projectId: string, url: string, filename?: string) =>
			importMediaFromUrl(projectId, url, filename)
	);

	ipcMain.handle(
		"claude:media:batchImport",
		async (_event, projectId: string, items: BatchImportItem[]) =>
			batchImportMedia(projectId, items)
	);

	ipcMain.handle(
		"claude:media:extractFrame",
		async (
			_event,
			projectId: string,
			mediaId: string,
			timestamp: number,
			format?: "png" | "jpg"
		) => extractFrame(projectId, mediaId, timestamp, format)
	);

	ipcMain.handle(
		"claude:search:transcriptions",
		async (_event, projectId: string) => {
			try {
				const { loadProjectTranscriptions } = await import(
					"../http/claude-http-search-routes.js"
				);
				return loadProjectTranscriptions(projectId);
			} catch (err) {
				claudeLog.warn(
					HANDLER_NAME,
					`Failed to load transcriptions for search: ${err}`
				);
				return [];
			}
		}
	);

	claudeLog.info(HANDLER_NAME, "Media IPC handlers registered");
}

// CommonJS export for main.ts compatibility
module.exports = {
	setupClaudeMediaIPC,
	listMediaFiles,
	getMediaInfo,
	importMediaFile,
	deleteMediaFile,
	renameMediaFile,
	importMediaFromUrl,
	batchImportMedia,
	extractFrame,
};
