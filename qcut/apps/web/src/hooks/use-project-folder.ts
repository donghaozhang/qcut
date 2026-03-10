/**
 * Project Folder Hook
 *
 * React hook for browsing and managing project folder contents.
 * Provides navigation, file listing, and scanning capabilities.
 *
 * @module hooks/use-project-folder
 */

import { useState, useCallback, useEffect } from "react";
import { platform } from "@qcut/platform-core";
import { useProjectStore } from "@/stores/project-store";
import type {
	ProjectFolderFileInfo,
	ProjectFolderScanResult,
} from "@/types/electron";

/**
 * Hook for managing project folder navigation and operations.
 */
export function useProjectFolder() {
	const { activeProject } = useProjectStore();
	const [isScanning, setIsScanning] = useState(false);
	const [currentPath, setCurrentPath] = useState("");
	const [entries, setEntries] = useState<ProjectFolderFileInfo[]>([]);
	const [scanResult, setScanResult] = useState<ProjectFolderScanResult | null>(
		null
	);
	const [error, setError] = useState<string | null>(null);

	const projectId = activeProject?.id;

	/**
	 * List directory contents (non-recursive).
	 */
	const listDirectory = useCallback(
		async (subPath = "") => {
			if (!projectId) {
				return;
			}

			setIsScanning(true);
			setError(null);

			try {
				const result = await platform().projectFolder.list(
					projectId,
					subPath
				);
				setEntries(result);
				setCurrentPath(subPath);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to list directory";
				setError(message);
			} finally {
				setIsScanning(false);
			}
		},
		[projectId]
	);

	/**
	 * Scan for all media files (recursive).
	 */
	const scanForMedia = useCallback(
		async (subPath = "media") => {
			if (!projectId) {
				return null;
			}

			setIsScanning(true);
			setError(null);

			try {
				const result = await platform().projectFolder.scan(
					projectId,
					subPath,
					{
						recursive: true,
						mediaOnly: true,
					}
				);
				setScanResult(result);
				return result;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to scan directory";
				setError(message);
				return null;
			} finally {
				setIsScanning(false);
			}
		},
		[projectId]
	);

	/**
	 * Ensure project folder structure exists.
	 */
	const ensureStructure = useCallback(async () => {
		if (!projectId) {
			return null;
		}

		try {
			const result =
				await platform().projectFolder.ensureStructure(projectId);
			return result;
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to ensure structure";
			setError(message);
			return null;
		}
	}, [projectId]);

	/**
	 * Navigate to a subdirectory.
	 */
	const navigateTo = useCallback(
		(subPath: string) => {
			listDirectory(subPath);
		},
		[listDirectory]
	);

	/**
	 * Navigate up one level.
	 */
	const navigateUp = useCallback(() => {
		if (!currentPath) return;
		const parts = currentPath.split(/[/\\]/);
		parts.pop();
		const parentPath = parts.join("/");
		listDirectory(parentPath);
	}, [currentPath, listDirectory]);

	/**
	 * Refresh current directory listing.
	 */
	const refresh = useCallback(() => {
		listDirectory(currentPath);
	}, [currentPath, listDirectory]);

	/**
	 * Get breadcrumb path segments.
	 */
	const getBreadcrumbs = useCallback(() => {
		if (!currentPath) return [{ name: "Project Root", path: "" }];

		const parts = currentPath.split(/[/\\]/);
		const breadcrumbs = [{ name: "Project Root", path: "" }];

		let accumulatedPath = "";
		for (const part of parts) {
			if (part) {
				accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;
				breadcrumbs.push({ name: part, path: accumulatedPath });
			}
		}

		return breadcrumbs;
	}, [currentPath]);

	// Initialize on project change
	useEffect(() => {
		if (projectId) {
			ensureStructure();
			listDirectory("media");
		}
	}, [projectId, ensureStructure, listDirectory]);

	return {
		// State
		projectId,
		currentPath,
		entries,
		scanResult,
		isScanning,
		error,

		// Navigation
		listDirectory,
		navigateTo,
		navigateUp,
		refresh,
		getBreadcrumbs,

		// Operations
		scanForMedia,
		ensureStructure,
	};
}
