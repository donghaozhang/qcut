/**
 * AI Video Save Handler
 *
 * Persists AI-generated videos under the user's project tree at
 * `Documents/QCut/Projects/<projectId>/media/generated/videos/`.
 *
 * Reliability contract:
 *   1. Project tree is ensured via the shared `ensureProjectStructure` so this
 *      writer agrees byte-for-byte with `project-folder:ensure-structure`.
 *   2. A `stat` guard runs immediately before `writeFile` to handle cloud-sync
 *      placeholder directories (OneDrive / iCloud) that report present-but-not-
 *      hydrated.
 *   3. A single `ENOENT` retry covers the TOCTOU race where the directory
 *      disappears between `stat` and `writeFile`.
 *
 * Path-redaction policy: every log message that would contain an absolute
 * filesystem path — both `console.error` for failures and the `console.log`
 * breadcrumbs from getAIVideoDir, save, and migration — is funneled through
 * `redactPath()`. In packaged builds (`!app.isPackaged`) the absolute
 * Documents path is replaced with `<project>` before reaching stdout/log
 * capture; in dev (`bun run electron:dev`) or with `QCUT_DEBUG_PATHS=1` the
 * full path is preserved for debugging.
 */

import * as path from "path";
import * as fs from "fs";
import { app, ipcMain } from "electron";
import { randomBytes } from "crypto";
import {
	ensureProjectStructure,
	getProjectRoot,
	getProjectsBasePath,
	isExistingDirectory,
	sanitizePathComponent,
} from "./lib/project-structure";

const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5GB limit for AI videos

/**
 * When true, error strings keep absolute paths (developer debugging).
 * When false (packaged production builds), absolute paths are replaced with
 * `<project>` so we don't leak local filesystem layout to UI/logs.
 */
function isPathDebugEnabled(): boolean {
	if (process.env.QCUT_DEBUG_PATHS === "1") return true;
	try {
		return !app.isPackaged;
	} catch {
		// `app.isPackaged` may not be available in test/mock contexts.
		return false;
	}
}

/**
 * Replace any occurrence of the projects base path in a message with
 * `<project>` unless debug mode is enabled.
 *
 * Exported for unit tests.
 */
export function redactPath(message: string): string {
	if (isPathDebugEnabled()) return message;
	let base: string;
	try {
		base = getProjectsBasePath();
	} catch {
		return message;
	}
	return message.split(base).join("<project>");
}

/**
 * Sanitize filename to prevent path traversal attacks.
 * Used for the FILENAME portion only — for project IDs, use
 * `sanitizePathComponent` from `./lib/project-structure`.
 */
export function sanitizeFilename(filename: string): string {
	return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Get the Documents-based AI video directory for a project.
 * Path: Documents/QCut/Projects/{projectId}/media/generated/videos/
 */
export function getAIVideoDir(projectId: string): string {
	const sanitized = sanitizePathComponent(projectId);
	const dir = path.join(
		getProjectsBasePath(),
		sanitized,
		"media",
		"generated",
		"videos"
	);
	console.log(
		redactPath(
			`[AI Video Path] getAIVideoDir("${projectId}") → ${dir} (sanitized="${sanitized}")`
		)
	);
	return dir;
}

/**
 * Get the legacy AppData-based AI video directory for migration.
 * Path: AppData/qcut/projects/{projectId}/ai-videos/
 */
export function getLegacyAIVideoDir(projectId: string): string {
	return path.join(
		app.getPath("userData"),
		"projects",
		sanitizeFilename(projectId),
		"ai-videos"
	);
}

/**
 * Generate a unique identifier to prevent filename collisions
 */
function generateUniqueId(): string {
	return randomBytes(8).toString("hex");
}

/**
 * Write a file with a pre-write `stat` guard plus a single ENOENT retry.
 *
 * Step A: confirms `projectDir` exists AND is a directory; if not, calls
 *         `ensureProjectStructure(projectId)` first. This catches OneDrive
 *         placeholder directories before the first write attempt.
 * Step B: on `ENOENT` from `writeFile`, re-ensures the structure and retries
 *         exactly once. Any other error propagates without retry.
 *
 * Exported for unit tests.
 */
export async function writeFileWithStatGuard(
	filePath: string,
	projectDir: string,
	buffer: Buffer,
	projectId: string
): Promise<void> {
	const dirOk = await isExistingDirectory(projectDir);
	if (!dirOk) {
		await ensureProjectStructure(projectId);
	}

	try {
		await fs.promises.writeFile(filePath, buffer, { mode: 0o644 });
		return;
	} catch (err: any) {
		if (err?.code !== "ENOENT") throw err;
		await ensureProjectStructure(projectId);
		await fs.promises.writeFile(filePath, buffer, { mode: 0o644 });
	}
}

interface SaveAIVideoOptions {
	fileName: string;
	fileData: ArrayBuffer | Uint8Array | Buffer;
	projectId: string;
	modelId?: string;
	metadata?: {
		width?: number;
		height?: number;
		duration?: number;
		fps?: number;
	};
}

interface SaveAIVideoResult {
	success: boolean;
	localPath?: string;
	fileName?: string;
	fileSize?: number;
	error?: string;
}

/**
 * Report a save failure: log redacted to console.error and return a
 * redacted-error result. The unredacted version goes nowhere unless
 * debug mode is enabled.
 */
function fail(error: string): SaveAIVideoResult {
	const redacted = redactPath(error);
	console.error("AI Video Save Error:", redacted);
	return { success: false, error: redacted };
}

/**
 * Save AI-generated video to permanent project storage
 * This is MANDATORY - if save fails, the entire operation must fail
 *
 * @param options - Save options including file data and project info
 * @returns Result object with local path or error
 */
export async function saveAIVideoToDisk(
	options: SaveAIVideoOptions
): Promise<SaveAIVideoResult> {
	try {
		const { fileName, fileData, projectId, modelId, metadata } = options;

		// Convert to Buffer
		let buffer: Buffer;
		if (Buffer.isBuffer(fileData)) {
			buffer = fileData;
		} else if (fileData instanceof ArrayBuffer) {
			buffer = Buffer.from(fileData);
		} else if (fileData instanceof Uint8Array) {
			buffer = Buffer.from(fileData);
		} else {
			return fail(
				"Invalid file data type - must be Buffer, ArrayBuffer, or Uint8Array"
			);
		}

		// Validate file size
		if (buffer.length > MAX_VIDEO_SIZE) {
			const sizeInMB = (buffer.length / 1024 / 1024).toFixed(2);
			return fail(
				`Video file too large: ${sizeInMB}MB exceeds ${MAX_VIDEO_SIZE / 1024 / 1024 / 1024}GB limit`
			);
		}

		// Validate buffer is not empty
		if (buffer.length === 0) {
			return fail("Video file is empty - cannot save");
		}

		// Resolve target directory.
		const projectDir = getAIVideoDir(projectId);
		console.log(
			redactPath(
				`[AI Video Save] Saving to projectDir: ${projectDir} (projectId="${projectId}")`
			)
		);

		// Ensure the FULL project tree exists (not just the leaf videos folder).
		// This funnels through the same code path as `project-folder:ensure-structure`
		// so a future required folder added there is automatically created here too.
		try {
			await ensureProjectStructure(projectId);
		} catch (ensureError: any) {
			return fail(
				`Failed to ensure project directory: ${ensureError?.message ?? String(ensureError)}`
			);
		}

		// Generate unique filename with metadata
		const timestamp = Date.now();
		const uniqueId = generateUniqueId();
		const sanitizedName = sanitizeFilename(fileName);
		const extension = path.extname(sanitizedName) || ".mp4";
		const baseName = path.basename(sanitizedName, extension);

		// Include model ID in filename for better organization
		const finalFileName = modelId
			? `${baseName}-${modelId}-${timestamp}-${uniqueId}${extension}`
			: `${baseName}-${timestamp}-${uniqueId}${extension}`;

		const filePath = path.join(projectDir, finalFileName);

		// Check disk space before saving (Windows/Mac/Linux compatible)
		try {
			const stats = await fs.promises.statfs(projectDir);
			const availableSpace = stats.bavail * stats.bsize;
			const requiredSpace = buffer.length * 1.1; // 10% buffer for safety

			if (availableSpace < requiredSpace) {
				const availableMB = (availableSpace / 1024 / 1024).toFixed(2);
				const requiredMB = (requiredSpace / 1024 / 1024).toFixed(2);
				return fail(
					`Insufficient disk space: ${availableMB}MB available, ${requiredMB}MB required`
				);
			}
		} catch {
			// statfs might not be available on all systems, continue anyway
			console.warn("Could not check disk space, proceeding with save");
		}

		// Write file to disk via the stat-guard + ENOENT-retry helper.
		try {
			await writeFileWithStatGuard(filePath, projectDir, buffer, projectId);
		} catch (writeError: any) {
			return fail(
				`Failed to write video file to disk: ${writeError?.message ?? String(writeError)}`
			);
		}

		// Verify the file was written correctly
		try {
			const stats = await fs.promises.stat(filePath);
			if (stats.size !== buffer.length) {
				// File size mismatch - delete corrupted file
				await fs.promises.unlink(filePath).catch(() => {});
				return fail(
					`File verification failed: size mismatch (expected ${buffer.length}, got ${stats.size})`
				);
			}
		} catch (verifyError: any) {
			return fail(
				`Failed to verify saved file: ${verifyError?.message ?? String(verifyError)}`
			);
		}

		// Save metadata file alongside video (optional, non-critical)
		if (metadata && Object.keys(metadata).length > 0) {
			const metadataPath = filePath.replace(extension, ".meta.json");
			const metadataContent = {
				...metadata,
				originalFileName: fileName,
				modelId,
				projectId,
				savedAt: new Date().toISOString(),
				fileSize: buffer.length,
			};

			try {
				await fs.promises.writeFile(
					metadataPath,
					JSON.stringify(metadataContent, null, 2)
				);
			} catch (metaError) {
				// Metadata save failure is non-critical
				console.warn("Failed to save metadata file:", metaError);
			}
		}

		console.log(
			redactPath(
				`✅ AI Video saved successfully to disk: ${filePath} (${(buffer.length / 1024 / 1024).toFixed(2)}MB)`
			)
		);

		return {
			success: true,
			localPath: filePath,
			fileName: finalFileName,
			fileSize: buffer.length,
		};
	} catch (unexpectedError: any) {
		return fail(
			`Unexpected error saving AI video: ${unexpectedError?.message ?? String(unexpectedError)}`
		);
	}
}

/**
 * Check if a saved AI video file exists and is valid
 */
export async function verifyAIVideoFile(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.promises.stat(filePath);
		return stats.isFile() && stats.size > 0;
	} catch {
		return false;
	}
}

/**
 * Delete AI video file and its metadata
 */
export async function deleteAIVideoFile(filePath: string): Promise<boolean> {
	try {
		// Delete main file
		await fs.promises.unlink(filePath);

		// Try to delete metadata file if it exists
		const metadataPath = filePath.replace(/\.[^.]+$/, ".meta.json");
		await fs.promises.unlink(metadataPath).catch(() => {});

		return true;
	} catch (error) {
		console.error("Failed to delete AI video file:", error);
		return false;
	}
}

/**
 * Register IPC handlers for AI video save operations
 */
export function registerAIVideoHandlers(): void {
	// Main save handler - MANDATORY SUCCESS REQUIRED
	ipcMain.handle(
		"ai-video:save-to-disk",
		async (event, options: SaveAIVideoOptions): Promise<SaveAIVideoResult> => {
			console.log("IPC: ai-video:save-to-disk called", {
				fileName: options.fileName,
				projectId: options.projectId,
				dataSize: options.fileData
					? (options.fileData as any).byteLength ||
						(options.fileData as Buffer).length
					: 0,
			});

			const result = await saveAIVideoToDisk(options);

			// If save failed, this is CRITICAL - the operation must not continue
			if (!result.success) {
				console.error(
					"🚨 CRITICAL: AI Video save to disk FAILED - Operation must be aborted",
					result.error
				);
			}

			return result;
		}
	);

	// Verify file exists
	ipcMain.handle(
		"ai-video:verify-file",
		async (event, filePath: string): Promise<boolean> => {
			return await verifyAIVideoFile(filePath);
		}
	);

	// Delete file (for cleanup or user request)
	ipcMain.handle(
		"ai-video:delete-file",
		async (event, filePath: string): Promise<boolean> => {
			return await deleteAIVideoFile(filePath);
		}
	);

	// Get project videos directory
	ipcMain.handle(
		"ai-video:get-project-dir",
		async (event, projectId: string): Promise<string> => {
			const dir = getAIVideoDir(projectId);
			console.log(
				redactPath(`[AI Video IPC] get-project-dir("${projectId}") → ${dir}`)
			);
			return dir;
		}
	);

	console.log("✅ AI Video save handlers registered (Documents-based paths)");
}

// --- Migration ---

interface MigrationResult {
	copied: number;
	skipped: number;
	projectsProcessed: number;
	errors: string[];
}

/**
 * One-time migration: copy AI videos from AppData to Documents.
 * - Copies files, does NOT delete originals (existing localPath refs still work)
 * - Skips files that already exist at the destination (idempotent)
 * - Non-blocking: errors are collected, not thrown
 */
export async function migrateAIVideosToDocuments(): Promise<MigrationResult> {
	const result: MigrationResult = {
		copied: 0,
		skipped: 0,
		projectsProcessed: 0,
		errors: [],
	};

	const legacyRoot = path.join(app.getPath("userData"), "projects");
	console.log(redactPath(`[AI Video Migration] Legacy root: ${legacyRoot}`));
	console.log(
		redactPath(
			`[AI Video Migration] Documents base: ${app.getPath("documents")}`
		)
	);

	// Early return if no legacy directory
	try {
		await fs.promises.access(legacyRoot);
		console.log("[AI Video Migration] Legacy root exists, scanning...");
	} catch {
		console.log("[AI Video Migration] No legacy root found, skipping.");
		return result;
	}

	// Enumerate project directories
	let projectDirs: string[];
	try {
		const entries = await fs.promises.readdir(legacyRoot, {
			withFileTypes: true,
		});
		projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
	} catch (err) {
		result.errors.push(`Failed to read legacy projects dir: ${err}`);
		return result;
	}

	for (const projectName of projectDirs) {
		const legacyVideoDir = path.join(legacyRoot, projectName, "ai-videos");

		// Skip projects without ai-videos folder
		try {
			await fs.promises.access(legacyVideoDir);
		} catch {
			continue;
		}

		result.projectsProcessed++;
		const destDir = getAIVideoDir(projectName);

		// Ensure destination exists
		try {
			await fs.promises.mkdir(destDir, { recursive: true, mode: 0o755 });
		} catch (err) {
			result.errors.push(
				`Failed to create dest dir for ${projectName}: ${err}`
			);
			continue;
		}

		// Copy files
		let files: string[];
		try {
			files = await fs.promises.readdir(legacyVideoDir);
		} catch (err) {
			result.errors.push(
				`Failed to read legacy dir for ${projectName}: ${err}`
			);
			continue;
		}

		for (const file of files) {
			const srcPath = path.join(legacyVideoDir, file);
			const destPath = path.join(destDir, file);

			// Skip directories
			try {
				const stat = await fs.promises.stat(srcPath);
				if (!stat.isFile()) continue;
			} catch (err) {
				result.errors.push(`Failed to stat source file ${srcPath}: ${err}`);
				continue;
			}

			// Skip if destination already exists
			try {
				await fs.promises.access(destPath);
				result.skipped++;
				continue;
			} catch {
				// File doesn't exist at destination — proceed with copy
			}

			try {
				await fs.promises.copyFile(srcPath, destPath);
				result.copied++;
			} catch (err) {
				result.errors.push(`Failed to copy ${file} in ${projectName}: ${err}`);
			}
		}
	}

	return result;
}
