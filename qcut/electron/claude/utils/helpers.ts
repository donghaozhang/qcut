/**
 * Claude API Helper Utilities
 * Shared utility functions for all Claude handlers
 */

import { app } from "electron";
import * as os from "os";
import * as path from "path";

/**
 * Sanitize a projectId to prevent path traversal attacks.
 * Strips path separators and parent directory references.
 */
export function sanitizeProjectId(projectId: string): string {
	return projectId.replace(/[/\\]/g, "").replace(/\.\./g, "");
}

function getDocumentsPath(): string {
	try {
		return app.getPath("documents");
	} catch {
		// Utility process does not expose Electron app path helpers.
		return path.join(os.homedir(), "Documents");
	}
}

/**
 * Get project folder path
 */
export function getProjectPath(projectId: string): string {
	const documentsPath = getDocumentsPath();
	return path.join(
		documentsPath,
		"QCut",
		"Projects",
		sanitizeProjectId(projectId)
	);
}

/**
 * Get the parent Projects folder path (contains all project subfolders).
 */
export function getProjectsRootPath(): string {
	return path.join(getDocumentsPath(), "QCut", "Projects");
}

/**
 * Get media folder path for a project
 */
export function getMediaPath(projectId: string): string {
	return path.join(getProjectPath(projectId), "media");
}

/**
 * Get timeline file path for a project
 */
export function getTimelinePath(projectId: string): string {
	return path.join(getProjectPath(projectId), "timeline.json");
}

/**
 * Get project settings file path
 */
export function getProjectSettingsPath(projectId: string): string {
	return path.join(getProjectPath(projectId), "project.qcut");
}

/**
 * Format time (ms -> "H:MM:SS")
 */
export function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const seconds = totalSeconds % 60;
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const hours = Math.floor(totalSeconds / 3600);
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Format time from seconds (s -> "H:MM:SS")
 */
export function formatTimeFromSeconds(seconds: number): string {
	return formatTime(seconds * 1000);
}

/**
 * Parse time ("H:MM:SS" or "M:SS" -> seconds)
 */
export function parseTime(time: string): number {
	const rawParts = time.split(":");
	if (!rawParts.every((part) => /^\d+$/.test(part.trim()))) {
		throw new Error(`Invalid time format: ${time}`);
	}
	const parts = rawParts.map(Number);
	if (parts.length === 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2];
	}
	if (parts.length === 2) {
		return parts[0] * 60 + parts[1];
	}
	return parts[0];
}

/**
 * Validate path is within allowed base directory (security)
 */
export function isPathSafe(targetPath: string, basePath: string): boolean {
	const resolvedTarget = path.resolve(targetPath);
	const resolvedBase = path.resolve(basePath);
	return (
		resolvedTarget.startsWith(resolvedBase + path.sep) ||
		resolvedTarget === resolvedBase
	);
}

/**
 * Validate source path for import operations (basic security check)
 * Allows importing from anywhere but prevents malicious inputs
 */
export function isValidSourcePath(sourcePath: string): boolean {
	// Must be a non-empty string
	if (!sourcePath || typeof sourcePath !== "string") return false;
	// No null bytes (injection attack prevention)
	if (sourcePath.includes("\0")) return false;
	// Must be an absolute path
	return path.isAbsolute(sourcePath);
}

/**
 * Generate unique ID with prefix
 */
export function generateId(prefix = "id"): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get media type from file extension
 */
export function getMediaType(ext: string): "video" | "audio" | "image" | null {
	const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv"];
	const audioExts = [".mp3", ".wav", ".aac", ".ogg", ".m4a", ".flac", ".wma"];
	const imageExts = [
		".jpg",
		".jpeg",
		".png",
		".gif",
		".webp",
		".bmp",
		".svg",
		".tiff",
	];

	const lowerExt = ext.toLowerCase();
	if (videoExts.includes(lowerExt)) return "video";
	if (audioExts.includes(lowerExt)) return "audio";
	if (imageExts.includes(lowerExt)) return "image";
	return null;
}

/**
 * Sanitize filename for safe file operations
 */
export function sanitizeFilename(filename: string): string {
	// Remove path separators and null bytes
	return filename.replace(/[/\\]/g, "").replace(/\0/g, "").replace(/\.\./g, "");
}

// CommonJS export for compatibility
module.exports = {
	sanitizeProjectId,
	getProjectPath,
	getProjectsRootPath,
	getMediaPath,
	getTimelinePath,
	getProjectSettingsPath,
	formatTime,
	formatTimeFromSeconds,
	parseTime,
	isPathSafe,
	isValidSourcePath,
	generateId,
	getMediaType,
	sanitizeFilename,
};
