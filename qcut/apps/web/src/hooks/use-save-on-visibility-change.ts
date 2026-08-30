/**
 * Hook to save timeline data when the page becomes hidden
 *
 * WHY this hook:
 * - beforeunload is unreliable for async saves (browsers abort async work)
 * - visibilitychange fires reliably when user switches tabs or closes app
 * - Ensures pending timeline changes are persisted before the page is unloaded
 *
 * @module useSaveOnVisibilityChange
 */

import { useEffect } from "react";
import { storageService } from "@/lib/storage/storage-service";

/**
 * Saves timeline and project data when the page becomes hidden.
 * This is more reliable than beforeunload for async operations.
 */
export function useSaveOnVisibilityChange() {
	useEffect(() => {
		const handleVisibilityChange = async () => {
			if (document.visibilityState === "hidden") {
				try {
					// Dynamically import stores to avoid circular dependencies
					const { useProjectStore } = await import("@/stores/project-store");
					const { useTimelineStore } = await import(
						"@/stores/timeline/timeline-store"
					);
					const activeProject = useProjectStore.getState().activeProject;
					const tracks = useTimelineStore.getState()._tracks;

					if (activeProject && tracks.length > 0) {
						// Save timeline immediately (no debounce)
						await storageService.saveProjectTimeline({
							projectId: activeProject.id,
							tracks,
							sceneId: activeProject.currentSceneId,
						});

						// Also save project metadata
						await storageService.saveProject({ project: activeProject });

						console.log(
							"[SaveOnVisibilityChange] Saved timeline on page hide",
							{
								projectId: activeProject.id,
								trackCount: tracks.length,
							}
						);
					}
				} catch (error) {
					// Log but don't throw - page is already hiding
					console.error(
						"[SaveOnVisibilityChange] Failed to save on visibility change:",
						error
					);
				}
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);
}
