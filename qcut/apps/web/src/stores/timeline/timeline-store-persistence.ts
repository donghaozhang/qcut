/**
 * Timeline Store Persistence Operations
 *
 * Load/save/query operations for the timeline store including
 * project thumbnail generation and immediate save support.
 *
 * @module stores/timeline-store-persistence
 */

import type { TimelineTrack } from "@/types/timeline";
import { ensureMainTrack } from "@/types/timeline";
import { storageService } from "@/lib/storage/storage-service";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";
import { debugLog } from "@/lib/debug/debug-config";
import type { TimelineStore } from "./index";
import type { StoreGet, StoreSet } from "./timeline-store-operations";
import { normalizeLoadedTracks } from "./timeline-store-normalization";
import { clearAutoSaveTimer } from "./timeline-store-autosave";

export interface PersistenceDeps {
	updateTracks: (tracks: TimelineTrack[]) => void;
	updateTracksAndSave: (tracks: TimelineTrack[]) => void;
}

/** Creates persistence operations (load, save, redo, thumbnail, clear) for the timeline store. */
export function createPersistenceOperations(
	get: StoreGet,
	set: StoreSet,
	deps: PersistenceDeps
) {
	const { updateTracks, updateTracksAndSave } = deps;

	return {
		getTotalDuration: () => {
			const { _tracks } = get();
			if (_tracks.length === 0) return 0;

			const trackEndTimes = _tracks.map((track) =>
				track.elements.reduce((maxEnd, element) => {
					const elementEnd =
						element.startTime +
						element.duration -
						element.trimStart -
						element.trimEnd;
					return Math.max(maxEnd, elementEnd);
				}, 0)
			);

			return Math.max(...trackEndTimes, 0);
		},

		getProjectThumbnail: async (projectId) => {
			try {
				const tracks = await storageService.loadTimeline({ projectId });

				// Fast path: check persisted thumbnails in metadata only (no file blobs)
				const persisted = await storageService.findProjectThumbnail(
					projectId,
					tracks
				);
				if (persisted) return persisted;

				// Slow path: generate thumbnail from file blob
				const mediaItems = await storageService.loadAllMediaItems(projectId);
				if (!mediaItems.length) return null;

				const firstMediaElement = tracks
					? tracks
							.flatMap((track) => track.elements)
							.filter((element) => element.type === "media")
							.sort((a, b) => a.startTime - b.startTime)[0]
					: undefined;

				const mediaItem = firstMediaElement
					? mediaItems.find((item) => item.id === firstMediaElement.mediaId)
					: undefined;
				const fallbackItem = mediaItem
					? undefined
					: [...mediaItems]
							.filter((item) => item.type === "image" || item.type === "video")
							.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))[0];
				const resolvedMediaItem = mediaItem ?? fallbackItem;
				if (!resolvedMediaItem) return null;

				if (resolvedMediaItem.type === "video" && resolvedMediaItem.file) {
					const { generateVideoThumbnail } = await import(
						"@/stores/media/media-store-loader"
					).then((m) => m.getMediaStoreUtils());
					const { thumbnailUrl } = await generateVideoThumbnail(mediaItem.file);
					return thumbnailUrl;
				}
				// Handle image with file but no url (non-Electron lazy blob creation)
				if (resolvedMediaItem.type === "image" && resolvedMediaItem.file?.size > 0) {
					return resolvedMediaItem.url || URL.createObjectURL(resolvedMediaItem.file);
				}

				return null;
			} catch (error) {
				handleError(error, {
					operation: "Generate Project Thumbnail",
					category: ErrorCategory.MEDIA_PROCESSING,
					severity: ErrorSeverity.LOW,
					showToast: false,
					metadata: { operation: "thumbnail-generation" },
				});
				return null;
			}
		},

		redo: () => {
			const { redoStack } = get();
			if (redoStack.length === 0) return;
			const next = redoStack[redoStack.length - 1];
			updateTracksAndSave(next);
			set({ redoStack: redoStack.slice(0, -1) });
		},

		loadProjectTimeline: async ({ projectId, sceneId }) => {
			try {
				const tracks = await storageService.loadProjectTimeline({
					projectId,
					sceneId,
				});
				if (tracks) {
					updateTracks(normalizeLoadedTracks({ tracks }));
				} else {
					// No timeline saved yet, initialize with default
					const defaultTracks = ensureMainTrack([]);
					updateTracks(defaultTracks);
				}
				// Clear history when loading a project
				set({ history: [], redoStack: [] });
			} catch (error) {
				handleError(error, {
					operation: "Load Timeline",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.HIGH,
					metadata: { projectId, sceneId },
				});
				// Initialize with default on error
				const defaultTracks = ensureMainTrack([]);
				updateTracks(defaultTracks);
				set({ history: [], redoStack: [] });
			}
		},

		saveProjectTimeline: async ({ projectId, sceneId }) => {
			try {
				await storageService.saveProjectTimeline({
					projectId,
					tracks: get()._tracks,
					sceneId,
				});
			} catch (error) {
				handleError(error, {
					operation: "Save Timeline",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.HIGH,
					metadata: {
						projectId,
						sceneId,
						trackCount: get()._tracks.length,
					},
				});
			}
		},

		saveImmediate: async () => {
			// Cancel any pending debounced save
			clearAutoSaveTimer();

			try {
				const { useProjectStore } = await import("../project-store");
				const activeProject = useProjectStore.getState().activeProject;
				if (activeProject) {
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
						autoSaveStatus: "Saved",
						lastAutoSaveAt: Date.now(),
					});
				}
			} catch (error) {
				handleError(error, {
					operation: "Immediate Save Timeline",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.HIGH,
					metadata: { trackCount: get()._tracks.length },
				});
			}
		},

		clearTimeline: () => {
			const defaultTracks = ensureMainTrack([]);
			updateTracks(defaultTracks);
			set({ history: [], redoStack: [], selectedElements: [] });
		},

		restoreTracks: (tracks: TimelineTrack[]) => {
			debugLog(`[TimelineStore] Restoring ${tracks.length} tracks (rollback)`);
			updateTracks(tracks);
		},
	} satisfies Partial<TimelineStore>;
}
