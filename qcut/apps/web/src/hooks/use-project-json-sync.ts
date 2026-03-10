/**
 * Hook to auto-sync project.json whenever project state changes.
 *
 * Subscribes to projectStore, timelineStore, mediaStore, exportStore.
 * On any change: debounce 1s → call IPC to rebuild and write project.json.
 * Captures projectId at schedule time to handle project switches safely.
 *
 * @module hooks/use-project-json-sync
 */

import { platform } from "@qcut/platform-core";
import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";

/**
 * Synchronizes the active project's project.json to disk by debouncing store changes and writing through the platform API.
 *
 * Subscribes (via dynamic import) to project, timeline, media, and export stores, schedules a write with a 1-second debounce when any of them change, captures the active projectId when scheduling, and verifies the projectId still matches before calling platform().projectJson?.write(projectId). Clears the pending timer and unsubscribes from all stores on unmount.
 */
export function useProjectJsonSync() {
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;

		const debouncedWrite = () => {
			// Capture projectId now — if user switches projects before
			// the timer fires, we write for the project that changed.
			const projectId = useProjectStore.getState().activeProject?.id;
			if (!projectId) return;

			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				const current = useProjectStore.getState().activeProject?.id;
				// Guard: skip if project changed since scheduling
				if (current !== projectId) return;
				platform().projectJson?.write(projectId);
			}, 1000);
		};

		// Subscribe to all stores that affect project.json
		// Using dynamic imports to avoid circular dependencies
		const setupSubscriptions = async () => {
			const { useTimelineStore } = await import(
				"@/stores/timeline/timeline-store"
			);
			const { useMediaStore } = await import("@/stores/media/media-store");
			const { useExportStore } = await import("@/stores/export-store");

			const unsubs = [
				useProjectStore.subscribe(debouncedWrite),
				useTimelineStore.subscribe(debouncedWrite),
				useMediaStore.subscribe(debouncedWrite),
				useExportStore.subscribe(debouncedWrite),
			];

			return unsubs;
		};

		let unsubs: (() => void)[] = [];
		setupSubscriptions().then((subs) => {
			unsubs = subs;
		});

		return () => {
			if (timer) clearTimeout(timer);
			for (const unsub of unsubs) unsub();
		};
	}, []);
}
