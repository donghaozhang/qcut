/**
 * Timeline Store Auto-save Helpers
 *
 * Debounced auto-save infrastructure with cross-project guards.
 * Uses dependency injection for store access.
 *
 * @module stores/timeline-store-autosave
 */

import type { TimelineTrack } from "@/types/timeline";
import {
	sortTracksByOrder,
	ensureMainTrack,
	reconcileTimelineTransitions,
} from "@/types/timeline";
import { storageService } from "@/lib/storage/storage-service";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { debugLog } from "@/lib/debug/debug-config";
import type { StoreGet, StoreSet } from "./timeline-store-operations";
import { getTimelineElementDuration } from "@/lib/timeline";

// Module-level timer for debounced auto-save
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Returns the auto-save timer reference for external cancellation (e.g., saveImmediate).
 */
export function getAutoSaveTimer(): ReturnType<typeof setTimeout> | null {
	return autoSaveTimer;
}

/** Cancels any pending debounced auto-save timer. */
export function clearAutoSaveTimer(): void {
	if (autoSaveTimer) {
		clearTimeout(autoSaveTimer);
		autoSaveTimer = null;
	}
}

/**
 * Creates auto-save closure helpers for the timeline store.
 */
export function createAutoSaveHelpers(get: StoreGet, set: StoreSet) {
	const updateTracks = (newTracks: TimelineTrack[]) => {
		const reconciledTracks = reconcileTimelineTransitions({
			tracks: newTracks,
			getElementDuration: ({ element }) =>
				getTimelineElementDuration({ element }),
		});
		const tracksWithMain = ensureMainTrack(reconciledTracks);
		const sortedTracks = sortTracksByOrder(tracksWithMain);
		const selectedTransition = get().selectedTransition;
		const transitionStillExists = selectedTransition
			? sortedTracks.some(
					(track) =>
						track.id === selectedTransition.trackId &&
						track.transitions?.some(
							(transition) => transition.id === selectedTransition.transitionId
						)
				)
			: false;
		set({
			_tracks: sortedTracks,
			tracks: sortedTracks,
			selectedTransition: transitionStillExists ? selectedTransition : null,
		});
	};

	const autoSaveTimelineGuarded = async (scheduledProjectId: string) => {
		try {
			const { useProjectStore } = await import("../project-store");
			const activeProject = useProjectStore.getState().activeProject;

			// Guard: Skip save if project changed since scheduling
			if (!activeProject || activeProject.id !== scheduledProjectId) {
				debugLog(
					`[TimelineStore] Skipping auto-save: project changed (scheduled: ${scheduledProjectId}, current: ${activeProject?.id})`
				);
				set({
					isAutoSaving: false,
					autoSaveStatus: "Auto-save idle",
				});
				return;
			}

			try {
				// Include current scene ID to avoid desync
				const { useSceneStore } = await import("./scene-store");
				const sceneId =
					useSceneStore.getState().currentScene?.id ??
					activeProject.currentSceneId;
				await storageService.saveProjectTimeline({
					projectId: activeProject.id,
					tracks: get()._tracks,
					sceneId,
				});
				set({
					isAutoSaving: false,
					autoSaveStatus: "Auto-saved",
					lastAutoSaveAt: Date.now(),
				});
			} catch (error) {
				set({
					isAutoSaving: false,
					autoSaveStatus: "Auto-save failed",
				});
				handleError(error, {
					operation: "Auto-save Timeline",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.LOW,
					showToast: false,
					metadata: {
						projectId: activeProject.id,
						trackCount: get()._tracks.length,
					},
				});
			}
		} catch (error) {
			set({
				isAutoSaving: false,
				autoSaveStatus: "Auto-save failed",
			});
			handleError(error, {
				operation: "Access Project Store",
				category: ErrorCategory.STORAGE,
				severity: ErrorSeverity.LOW,
				showToast: false,
				metadata: {
					operation: "timeline-autosave",
				},
			});
		}
	};

	const autoSaveTimeline = async () => {
		const { useProjectStore } = await import("../project-store");
		const projectId = useProjectStore.getState().activeProject?.id;
		if (projectId) {
			await autoSaveTimelineGuarded(projectId);
		}
	};

	const updateTracksAndSave = async (newTracks: TimelineTrack[]) => {
		updateTracks(newTracks);

		// Capture projectId at schedule time (not at save time)
		const { useProjectStore } = await import("../project-store");
		const scheduledProjectId = useProjectStore.getState().activeProject?.id;

		if (!scheduledProjectId) {
			// No active project, skip auto-save
			return;
		}

		// Auto-save in background with debouncing
		set({
			isAutoSaving: true,
			autoSaveStatus: "Auto-saving...",
		});

		// Cancel previous timer to prevent race conditions and stale saves
		if (autoSaveTimer) {
			clearTimeout(autoSaveTimer);
		}
		autoSaveTimer = setTimeout(
			() => autoSaveTimelineGuarded(scheduledProjectId),
			50
		);
	};

	return { updateTracks, autoSaveTimeline, updateTracksAndSave };
}
