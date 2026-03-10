/**
 * Bulk Import Utility
 *
 * Provides functions for importing multiple files from project folder
 * with progress tracking and error handling.
 *
 * @module lib/bulk-import
 */

import { platform } from "@qcut/platform-core";
import type { ProjectFolderFileInfo } from "@/types/electron";

/**
 * Progress information during bulk import.
 */
export interface BulkImportProgress {
	/** Total number of files to import */
	total: number;
	/** Number of files processed so far */
	completed: number;
	/** Currently processing file name */
	current: string;
	/** List of error messages */
	errors: string[];
}

/**
 * Result of a bulk import operation.
 */
export interface BulkImportResult {
	/** Number of successfully imported files */
	imported: number;
	/** Number of failed imports */
	failed: number;
	/** Error messages for failed imports */
	errors: string[];
}

/**
 * Options for bulk import operation.
 */
export interface BulkImportOptions {
	/** Automatically assign to virtual folders based on type */
	autoOrganize?: boolean;
	/** Specific target folder ID */
	targetFolderId?: string;
	/** Callback for progress updates */
	onProgress?: (progress: BulkImportProgress) => void;
}

/**
 * Import multiple files from project folder into media store.
 *
 * @param projectId - Project ID to import into
 * @param files - Array of file information from project folder scan
 * @param options - Import options
 * @returns Import result with success/failure counts
 */
export async function bulkImportFiles(
	projectId: string,
	files: ProjectFolderFileInfo[],
	options: BulkImportOptions = {}
): Promise<BulkImportResult> {
	const errors: string[] = [];
	let imported = 0;

	const progress: BulkImportProgress = {
		total: files.length,
		completed: 0,
		current: "",
		errors: [],
	};

	// Filter out directories and unknown types
	const mediaFiles = files.filter(
		(f) => !f.isDirectory && f.type !== "unknown"
	);

	if (mediaFiles.length === 0) {
		return { imported: 0, failed: 0, errors: [] };
	}

	progress.total = mediaFiles.length;

	for (const file of mediaFiles) {
		progress.current = file.name;
		options.onProgress?.(progress);

		try {
			// Generate unique ID for media item
			const mediaId = crypto.randomUUID();

			// Import file via Electron IPC (symlink/copy)
			const importResult = await platform().mediaImport?.import({
				sourcePath: file.path,
				projectId,
				mediaId,
				preferSymlink: true,
			});

			if (!importResult?.success) {
				throw new Error(importResult?.error || "Import failed");
			}

			imported++;
		} catch (err) {
			const errorMsg = `${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`;
			errors.push(errorMsg);
			progress.errors.push(errorMsg);
		}

		progress.completed++;
		options.onProgress?.(progress);
	}

	return { imported, failed: errors.length, errors };
}

/**
 * Get MIME type from file name and type.
 */
export function getMimeType(
	filename: string,
	type: ProjectFolderFileInfo["type"]
): string {
	const ext = filename.split(".").pop()?.toLowerCase() || "";

	const mimeTypes: Record<string, string> = {
		// Video
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		avi: "video/x-msvideo",
		mkv: "video/x-matroska",
		m4v: "video/x-m4v",
		// Audio
		mp3: "audio/mpeg",
		wav: "audio/wav",
		ogg: "audio/ogg",
		m4a: "audio/mp4",
		flac: "audio/flac",
		aac: "audio/aac",
		// Image
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		bmp: "image/bmp",
	};

	if (mimeTypes[ext]) {
		return mimeTypes[ext];
	}

	// Fallback to category-based defaults
	switch (type) {
		case "video":
			return "video/mp4";
		case "audio":
			return "audio/mpeg";
		case "image":
			return "image/jpeg";
		default:
			return "application/octet-stream";
	}
}

/**
 * Format file size in human-readable format.
 */
export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
