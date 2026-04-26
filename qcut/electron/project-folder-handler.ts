/**
 * Project Folder Handler
 *
 * Provides IPC handlers for scanning and managing project directory contents.
 * Enables browsing project folder structure and bulk file operations.
 *
 * @module electron/project-folder-handler
 */

import { ipcMain } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import {
	ensureProjectStructure,
	getProjectsBasePath,
	sanitizePathComponent,
	validatePathWithinBase,
} from "./lib/project-structure";

// ============================================================================
// Types
// ============================================================================

/**
 * Information about a file or directory entry.
 */
interface FileInfo {
	/** File or folder name */
	name: string;
	/** Absolute path to the file */
	path: string;
	/** Path relative to project root */
	relativePath: string;
	/** Media type classification */
	type: "video" | "audio" | "image" | "unknown";
	/** File size in bytes (0 for directories) */
	size: number;
	/** Last modified timestamp in milliseconds */
	modifiedAt: number;
	/** Whether this entry is a directory */
	isDirectory: boolean;
}

/**
 * Result of a directory scan operation.
 */
interface ScanResult {
	/** List of files found */
	files: FileInfo[];
	/** List of folder relative paths */
	folders: string[];
	/** Total size of all files in bytes */
	totalSize: number;
	/** Time taken to scan in milliseconds */
	scanTime: number;
}

/**
 * Options for scan operation.
 */
interface ScanOptions {
	/** Scan subdirectories recursively */
	recursive?: boolean;
	/** Only include media files (video, audio, image) */
	mediaOnly?: boolean;
}

/**
 * Result of ensure-structure operation.
 */
interface EnsureStructureResult {
	/** Folders that were created */
	created: string[];
	/** Folders that already existed */
	existing: string[];
}

/**
 * Logger interface compatible with electron-log.
 */
interface Logger {
	info(message?: unknown, ...optionalParams: unknown[]): void;
	warn(message?: unknown, ...optionalParams: unknown[]): void;
	error(message?: unknown, ...optionalParams: unknown[]): void;
	debug(message?: unknown, ...optionalParams: unknown[]): void;
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

const LOG_PREFIX = "[ProjectFolder]";

// ============================================================================
// Constants
// ============================================================================

/** Supported media file extensions by type */
const MEDIA_EXTENSIONS: Record<string, string[]> = {
	video: [".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"],
	audio: [".mp3", ".wav", ".aac", ".m4a", ".flac", ".ogg"],
	image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"],
};

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Determine media type from file extension.
 */
function getMediaType(ext: string): FileInfo["type"] {
	const lower = ext.toLowerCase();
	if (MEDIA_EXTENSIONS.video.includes(lower)) return "video";
	if (MEDIA_EXTENSIONS.audio.includes(lower)) return "audio";
	if (MEDIA_EXTENSIONS.image.includes(lower)) return "image";
	return "unknown";
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Recursively scan a directory for files.
 */
async function scanDirectory(
	dirPath: string,
	relativeBase: string,
	options: ScanOptions,
	result: { files: FileInfo[]; folders: string[]; totalSize: number }
): Promise<void> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);
			const relativePath = relativeBase
				? path.join(relativeBase, entry.name)
				: entry.name;

			if (entry.isDirectory()) {
				result.folders.push(relativePath);
				if (options.recursive) {
					await scanDirectory(fullPath, relativePath, options, result);
				}
			} else {
				const ext = path.extname(entry.name);
				const mediaType = getMediaType(ext);

				// Skip non-media files if mediaOnly is set
				if (options.mediaOnly && mediaType === "unknown") {
					continue;
				}

				try {
					const stats = await fs.stat(fullPath);
					result.totalSize += stats.size;

					result.files.push({
						name: entry.name,
						path: fullPath,
						relativePath,
						type: mediaType,
						size: stats.size,
						modifiedAt: stats.mtimeMs,
						isDirectory: false,
					});
				} catch (statError) {
					log.warn(`${LOG_PREFIX} Failed to stat file ${fullPath}:`, statError);
				}
			}
		}
	} catch (error) {
		log.error(`${LOG_PREFIX} Error scanning ${dirPath}:`, error);
	}
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Register project folder IPC handlers.
 * Call this function during app initialization.
 */
export function setupProjectFolderIPC(): void {
	log.info(`${LOG_PREFIX} Registering IPC handlers`);

	// -------------------------------------------------------------------------
	// Get project root path
	// -------------------------------------------------------------------------
	ipcMain.handle(
		"project-folder:get-root",
		async (_, projectId: string): Promise<string> => {
			const sanitizedProjectId = sanitizePathComponent(projectId);
			const basePath = getProjectsBasePath();
			const projectPath = path.join(basePath, sanitizedProjectId);

			validatePathWithinBase(projectPath, basePath);

			log.info(`${LOG_PREFIX} Get root for project: ${sanitizedProjectId}`);
			return projectPath;
		}
	);

	// -------------------------------------------------------------------------
	// Scan directory for media files
	// -------------------------------------------------------------------------
	ipcMain.handle(
		"project-folder:scan",
		async (
			_,
			projectId: string,
			subPath = "",
			options: ScanOptions = {}
		): Promise<ScanResult> => {
			const startTime = Date.now();
			const sanitizedProjectId = sanitizePathComponent(projectId);
			const basePath = getProjectsBasePath();
			const projectRoot = path.join(basePath, sanitizedProjectId);

			validatePathWithinBase(projectRoot, basePath);

			// Sanitize subPath and validate final target path
			const sanitizedSubPath = subPath
				.split(/[/\\]/)
				.map(sanitizePathComponent)
				.join(path.sep);
			const targetPath = path.join(projectRoot, sanitizedSubPath);

			validatePathWithinBase(targetPath, projectRoot);

			log.info(
				`${LOG_PREFIX} Scanning: ${sanitizedProjectId}/${sanitizedSubPath}`
			);

			const result = {
				files: [] as FileInfo[],
				folders: [] as string[],
				totalSize: 0,
			};

			await scanDirectory(targetPath, sanitizedSubPath, options, result);

			const scanTime = Date.now() - startTime;
			log.info(
				`${LOG_PREFIX} Scan complete: ${result.files.length} files, ${result.folders.length} folders in ${scanTime}ms`
			);

			return {
				...result,
				scanTime,
			};
		}
	);

	// -------------------------------------------------------------------------
	// List immediate children of a directory (non-recursive)
	// -------------------------------------------------------------------------
	ipcMain.handle(
		"project-folder:list",
		async (_, projectId: string, subPath = ""): Promise<FileInfo[]> => {
			const sanitizedProjectId = sanitizePathComponent(projectId);
			const basePath = getProjectsBasePath();
			const projectRoot = path.join(basePath, sanitizedProjectId);

			validatePathWithinBase(projectRoot, basePath);

			const sanitizedSubPath = subPath
				.split(/[/\\]/)
				.map(sanitizePathComponent)
				.join(path.sep);
			const targetPath = path.join(projectRoot, sanitizedSubPath);

			validatePathWithinBase(targetPath, projectRoot);

			log.info(
				`${LOG_PREFIX} Listing: ${sanitizedProjectId}/${sanitizedSubPath}`
			);

			const entries: FileInfo[] = [];

			try {
				const dirEntries = await fs.readdir(targetPath, {
					withFileTypes: true,
				});

				for (const entry of dirEntries) {
					const fullPath = path.join(targetPath, entry.name);

					try {
						const stats = await fs.stat(fullPath);
						const ext = path.extname(entry.name);

						entries.push({
							name: entry.name,
							path: fullPath,
							relativePath: sanitizedSubPath
								? path.join(sanitizedSubPath, entry.name)
								: entry.name,
							type: entry.isDirectory() ? "unknown" : getMediaType(ext),
							size: stats.size,
							modifiedAt: stats.mtimeMs,
							isDirectory: entry.isDirectory(),
						});
					} catch (statError) {
						log.warn(`${LOG_PREFIX} Failed to stat ${fullPath}:`, statError);
					}
				}
			} catch (error) {
				log.error(`${LOG_PREFIX} Error listing ${targetPath}:`, error);
			}

			log.info(`${LOG_PREFIX} Listed ${entries.length} entries`);
			return entries;
		}
	);

	// -------------------------------------------------------------------------
	// Ensure project folder structure exists.
	// Delegates to the shared `ensureProjectStructure` so the AI video save
	// path and any future writers agree on REQUIRED_PROJECT_FOLDERS.
	// -------------------------------------------------------------------------
	ipcMain.handle(
		"project-folder:ensure-structure",
		async (_, projectId: string): Promise<EnsureStructureResult> => {
			log.info(`${LOG_PREFIX} Ensuring structure for: ${projectId}`);
			const ensured = await ensureProjectStructure(projectId);
			log.info(
				`${LOG_PREFIX} Structure ensured: ${ensured.created.length} created, ${ensured.existing.length} existing`
			);
			return { created: ensured.created, existing: ensured.existing };
		}
	);

	log.info(`${LOG_PREFIX} IPC handlers registered`);
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = { setupProjectFolderIPC };
export default { setupProjectFolderIPC };
