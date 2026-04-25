/**
 * Project Structure
 *
 * Shared helpers for resolving and ensuring the QCut project folder layout
 * under the user's Documents directory.
 *
 * Owned by this module so that every code path that writes into a project
 * (project-folder-handler, ai-video-save-handler, future image/audio writers)
 * agrees on the same structure and the same sanitization rules. If you add a
 * new required folder, add it here only — every consumer picks it up
 * automatically.
 *
 * @module electron/lib/project-structure
 */

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Constants
// ============================================================================

/**
 * Folders that must exist under every project root for QCut to function.
 * Order matters only for log readability — `mkdir({ recursive: true })` will
 * create any intermediate parents.
 */
export const REQUIRED_PROJECT_FOLDERS = [
	"media",
	"media/imported",
	"media/generated",
	"media/generated/images",
	"media/generated/videos",
	"media/generated/audio",
	"media/temp",
	"output",
	"cache",
] as const;

// ============================================================================
// Types
// ============================================================================

export interface EnsureStructureResult {
	/** Folders that were just created by this call. */
	created: string[];
	/** Folders that already existed. */
	existing: string[];
	/** Absolute path to the project root that was ensured. */
	projectRoot: string;
}

// ============================================================================
// Path utilities
// ============================================================================

/**
 * Resolve the QCut projects base path: Documents/QCut/Projects.
 */
export function getProjectsBasePath(): string {
	const documentsPath = app.getPath("documents");
	return path.join(documentsPath, "QCut", "Projects");
}

/**
 * Sanitize a single path component to prevent path traversal.
 * Strips path separators and parent-directory references.
 */
export function sanitizePathComponent(component: string): string {
	return component.replace(/[/\\]/g, "").replace(/\.\./g, "");
}

/**
 * Validate that a resolved path stays within the allowed base directory.
 * @throws Error if path traversal is detected.
 */
export function validatePathWithinBase(
	resolvedPath: string,
	basePath: string
): void {
	const normalizedResolved = path.resolve(resolvedPath);
	const normalizedBase = path.resolve(basePath);

	if (
		!normalizedResolved.startsWith(normalizedBase + path.sep) &&
		normalizedResolved !== normalizedBase
	) {
		throw new Error("Path traversal attempt detected");
	}
}

/**
 * Resolve the absolute project root for a given project ID.
 * Validates against path traversal.
 */
export function getProjectRoot(projectId: string): string {
	const sanitizedProjectId = sanitizePathComponent(projectId);
	const basePath = getProjectsBasePath();
	const projectRoot = path.join(basePath, sanitizedProjectId);
	validatePathWithinBase(projectRoot, basePath);
	return projectRoot;
}

// ============================================================================
// Ensure structure
// ============================================================================

/**
 * Ensure the full QCut project folder tree exists under
 * `Documents/QCut/Projects/<sanitized projectId>/`.
 *
 * Idempotent and safe under concurrent calls (`mkdir({ recursive: true })`
 * tolerates `EEXIST`). Per-folder failures are collected, not thrown — the
 * function always resolves so callers can decide how to react.
 */
export async function ensureProjectStructure(
	projectId: string
): Promise<EnsureStructureResult> {
	const projectRoot = getProjectRoot(projectId);
	const created: string[] = [];
	const existing: string[] = [];

	for (const folder of REQUIRED_PROJECT_FOLDERS) {
		const folderPath = path.join(projectRoot, folder);
		try {
			await fs.promises.access(folderPath);
			existing.push(folder);
		} catch {
			try {
				await fs.promises.mkdir(folderPath, { recursive: true });
				created.push(folder);
			} catch {
				// Per-folder failure is collected by omission; caller can
				// re-stat the leaf they actually need (e.g. saveAIVideoToDisk)
				// to decide whether to continue.
			}
		}
	}

	return { created, existing, projectRoot };
}

/**
 * Return true iff the path exists AND is a directory. Never throws.
 *
 * Intended as a pre-write guard for cloud-synced (OneDrive/iCloud) Documents
 * folders, where a `mkdir` can succeed but the entry is a placeholder that
 * the next `writeFile` rejects with `ENOENT` until rehydration completes.
 */
export async function isExistingDirectory(p: string): Promise<boolean> {
	try {
		const stats = await fs.promises.stat(p);
		return stats.isDirectory();
	} catch {
		return false;
	}
}
