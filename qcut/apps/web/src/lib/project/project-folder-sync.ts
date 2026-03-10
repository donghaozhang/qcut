/**
 * Project Folder Auto-Sync
 *
 * Scans the project's media directory on disk and imports any untracked files
 * into the media store. Detects duplicates by localPath, originalPath, or
 * name+size to avoid re-importing existing items.
 *
 * @module lib/project-folder-sync
 */

import { platform } from "@qcut/platform-core";
import {
	DEFAULT_FOLDER_IDS,
	type MediaItem,
} from "@/stores/media/media-store-types";
import type {
	ProjectFolderFileInfo,
	ProjectFolderScanResult,
} from "@/types/electron.d";
import { getMimeType } from "@/lib/media/bulk-import";
import { getOrCreateObjectURL } from "@/lib/media/blob-manager";
import { debugLog, debugError } from "@/lib/debug/debug-config";

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
	/** Number of files successfully imported */
	imported: number;
	/** Number of files skipped (already in store) */
	skipped: number;
	/** Error messages for files that failed to import */
	errors: string[];
	/** Time taken for the full sync in milliseconds */
	scanTime: number;
	/** Total media files found on disk */
	totalDiskFiles: number;
}

// ============================================================================
// Pure helper functions (exported for testing)
// ============================================================================

/**
 * Determines which virtual folder IDs a file should be assigned to
 * based on its media type and disk location.
 */
export function determineFolderIds(file: ProjectFolderFileInfo): string[] {
	const folderIds: string[] = [];

	// Type-based assignment
	switch (file.type) {
		case "video":
			folderIds.push(DEFAULT_FOLDER_IDS.VIDEOS);
			break;
		case "audio":
			folderIds.push(DEFAULT_FOLDER_IDS.AUDIO);
			break;
		case "image":
			folderIds.push(DEFAULT_FOLDER_IDS.IMAGES);
			break;
	}

	// Path-based: files under media/generated/ also get AI_GENERATED
	const normalizedPath = file.relativePath.replace(/\\/g, "/");
	if (normalizedPath.startsWith("media/generated")) {
		folderIds.push(DEFAULT_FOLDER_IDS.AI_GENERATED);
	}

	return folderIds;
}

/**
 * Filters disk files to only those not already tracked in the media store.
 * Matches by localPath, importMetadata.originalPath, or name+size.
 */
export function findUntrackedFiles(
	diskFiles: ProjectFolderFileInfo[],
	mediaItems: MediaItem[]
): ProjectFolderFileInfo[] {
	// Build lookup sets from existing media items
	const localPaths = new Set<string>();
	const originalPaths = new Set<string>();
	const nameSizeKeys = new Set<string>();

	for (const item of mediaItems) {
		if (item.localPath) {
			localPaths.add(normalizePath(item.localPath));
		}
		if (item.importMetadata?.originalPath) {
			originalPaths.add(normalizePath(item.importMetadata.originalPath));
		}
		// name+size as fallback for files that may have been moved
		if (item.file?.size) {
			nameSizeKeys.add(`${item.name}:${item.file.size}`);
		}
	}

	return diskFiles.filter((file) => {
		// Skip directories and unknown types
		if (file.isDirectory || file.type === "unknown") {
			return false;
		}

		const normalizedFilePath = normalizePath(file.path);
		const nameSizeKey = `${file.name}:${file.size}`;

		// Check all three match strategies
		if (localPaths.has(normalizedFilePath)) return false;
		if (originalPaths.has(normalizedFilePath)) return false;
		if (nameSizeKeys.has(nameSizeKey)) return false;

		return true;
	});
}

/** Normalize path separators for consistent comparison */
function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").toLowerCase();
}

function encodeDeterministicMediaId({
	fileName,
}: {
	fileName: string;
}): string | null {
	try {
		const bytes = new TextEncoder().encode(fileName);
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		const base64 = window.btoa(binary);
		const base64Url = base64
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/u, "");
		return `media_${base64Url}`;
	} catch (error) {
		debugError("[ProjectFolderSync] Failed to encode deterministic media ID:", {
			fileName,
			error,
		});
		return null;
	}
}

// ============================================================================
// Main sync function
// ============================================================================

/**
 * Scan the project's media folder on disk and import any untracked media files into the media store with appropriate virtual folder assignments.
 *
 * @param projectId - The identifier of the project whose folder should be synchronized
 * @returns A SyncResult object containing import statistics:
 * - `imported`: number of files imported
 * - `skipped`: number of files already tracked and skipped
 * - `errors`: array of error messages encountered during import
 * - `scanTime`: elapsed time of the sync in milliseconds
 * - `totalDiskFiles`: total number of media files discovered on disk
 */
export async function syncProjectFolder(
	projectId: string
): Promise<SyncResult> {
	const startTime = Date.now();
	const result: SyncResult = {
		imported: 0,
		skipped: 0,
		errors: [],
		scanTime: 0,
		totalDiskFiles: 0,
	};

	try {
		// Ensure project directory structure exists
		await platform().projectFolder.ensureStructure(projectId);

		// Scan for all media files recursively
		const scanResult: ProjectFolderScanResult =
			await platform().projectFolder.scan(projectId, "media", {
				recursive: true,
				mediaOnly: true,
			});

		result.totalDiskFiles = scanResult.files.length;
		debugLog(
			`[ProjectFolderSync] Found ${scanResult.files.length} media files on disk (${scanResult.scanTime}ms)`
		);

		// Dynamically import media store to avoid circular dependencies
		const { useMediaStore } = await import("@/stores/media/media-store");
		const store = useMediaStore.getState();
		const currentItems = store.mediaItems;

		// Find files not yet in the store
		const untrackedFiles = findUntrackedFiles(scanResult.files, currentItems);
		result.skipped = result.totalDiskFiles - untrackedFiles.length;

		if (untrackedFiles.length === 0) {
			debugLog(
				"[ProjectFolderSync] All files already tracked, nothing to import"
			);
			result.scanTime = Date.now() - startTime;
			return result;
		}

		debugLog(
			`[ProjectFolderSync] Importing ${untrackedFiles.length} untracked files`
		);

		// Import each untracked file
		for (const file of untrackedFiles) {
			try {
				// Read file bytes from disk
				const buffer = await platform().files.readFile(file.path);
				if (!buffer) {
					throw new Error("readFile returned null");
				}

				// Create File object (convert Buffer to Uint8Array for Blob compatibility)
				const mimeType = getMimeType(file.name, file.type);
				const uint8 = new Uint8Array(buffer);
				const blob = new Blob([uint8], { type: mimeType });
				const fileObj = new File([blob], file.name, { type: mimeType });

				// Determine folder assignments
				const folderIds = determineFolderIds(file);

				// Detect if this is AI-generated content for metadata
				const normalizedRelPath = file.relativePath.replace(/\\/g, "/");
				const isGenerated = normalizedRelPath.startsWith("media/generated");

				// Create blob URL for display so timeline elements can render the media
				const displayUrl = getOrCreateObjectURL(fileObj, "project-folder-sync");
				const deterministicId = encodeDeterministicMediaId({
					fileName: file.name,
				});

				// Add to media store
				await store.addMediaItem(projectId, {
					id: deterministicId ?? undefined,
					name: file.name,
					type: file.type as "video" | "audio" | "image",
					file: fileObj,
					url: displayUrl,
					localPath: file.path,
					isLocalFile: true,
					folderIds,
					metadata: isGenerated
						? { source: "project-folder-sync-generated" }
						: { source: "project-folder-sync" },
				});

				result.imported++;
			} catch (err) {
				const msg = `${file.name}: ${err instanceof Error ? err.message : "Unknown error"}`;
				result.errors.push(msg);
				debugError(`[ProjectFolderSync] Failed to import ${file.name}:`, err);
			}
		}

		debugLog(
			`[ProjectFolderSync] Sync complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} errors`
		);
	} catch (err) {
		debugError("[ProjectFolderSync] Sync failed:", err);
		result.errors.push(
			`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`
		);
	}

	result.scanTime = Date.now() - startTime;
	return result;
}
