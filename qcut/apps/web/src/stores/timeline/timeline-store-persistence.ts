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
import {
	captureTimelineHistorySnapshot,
	restoreTimelinePlayhead,
} from "./timeline-history";
import { getTimelineDuration } from "@/lib/timeline";

export interface PersistenceDeps {
	getProjectFps?: () => number;
	updateTracks: (tracks: TimelineTrack[]) => void;
	updateTracksAndSave: (tracks: TimelineTrack[]) => void;
}

/** Creates persistence operations (load, save, redo, thumbnail, clear) for the timeline store. */
export function createPersistenceOperations(
	get: StoreGet,
	set: StoreSet,
	deps: PersistenceDeps
) {
	const { getProjectFps, updateTracks, updateTracksAndSave } = deps;

	return {
		getTotalDuration: () => getTimelineDuration({ tracks: get()._tracks }),

		getProjectDuration: async (projectId) => {
			try {
				const project = await storageService.loadProject({ id: projectId });
				const sceneTracks = await Promise.all(
					(project?.scenes ?? []).map((scene) =>
						storageService.loadTimeline({
							projectId,
							sceneId: scene.id,
						})
					)
				);
				let total = sceneTracks.reduce(
					(duration, tracks) =>
						duration + (tracks ? getTimelineDuration({ tracks }) : 0),
					0
				);
				if (total === 0) {
					// Projects saved before scene timelines used one project-level key.
					const tracks = await storageService.loadTimeline({
						projectId,
					});
					if (tracks) total = getTimelineDuration({ tracks });
				}
				return total;
			} catch (error) {
				handleError(error, {
					operation: "Get Project Duration",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.LOW,
					showToast: false,
					metadata: { projectId },
				});
				return null;
			}
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
							.sort(
								(a, b) =>
									(b.file?.lastModified ?? 0) - (a.file?.lastModified ?? 0)
							)[0];
				const resolvedMediaItem = mediaItem ?? fallbackItem;
				if (!resolvedMediaItem) return null;

				if (resolvedMediaItem.type === "video" && resolvedMediaItem.file) {
					const { generateVideoThumbnail } = await import(
						"@/stores/media/media-store-loader"
					).then((m) => m.getMediaStoreUtils());
					const { thumbnailUrl } = await generateVideoThumbnail(
						resolvedMediaItem.file
					);
					return thumbnailUrl;
				}
				// Handle image with file but no url (non-Electron lazy blob creation)
				if (
					resolvedMediaItem.type === "image" &&
					resolvedMediaItem.file?.size > 0
				) {
					return (
						resolvedMediaItem.url || URL.createObjectURL(resolvedMediaItem.file)
					);
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
			const {
				redoStack,
				history,
				_tracks,
				selectedElements,
				selectedTransition,
			} = get();
			const next = redoStack[redoStack.length - 1];
			if (!next) return;
			// Symmetric with undo: the state being left is re-captured onto the
			// history stack, so undo→redo→undo round-trips (QTL-004).
			const current = captureTimelineHistorySnapshot({
				tracks: _tracks,
				selectedElements,
				selectedTransition,
			});
			updateTracksAndSave(next.tracks);
			set({
				redoStack: redoStack.slice(0, -1),
				history: [...history, current],
				selectedElements: next.selectedElements,
				selectedTransition: next.selectedTransition,
			});
			restoreTimelinePlayhead({ snapshot: next });
		},

		loadProjectTimeline: async ({ projectId, sceneId }) => {
			try {
				const tracks = await storageService.loadProjectTimeline({
					projectId,
					sceneId,
				});
				if (tracks) {
					// Resolve FPS from the project being loaded: activeProject may
					// still point at the previous project during a switch.
					const project = await storageService
						.loadProject({ id: projectId })
						.catch(() => null);
					updateTracks(
						normalizeLoadedTracks({
							tracks,
							fps: project?.fps ?? getProjectFps?.() ?? 30,
						})
					);
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
			set({
				history: [],
				redoStack: [],
				selectedElements: [],
				selectedTransition: null,
			});
		},

		restoreTracks: (tracks: TimelineTrack[]) => {
			debugLog(`[TimelineStore] Restoring ${tracks.length} tracks (rollback)`);
			updateTracks(tracks);
		},
	} satisfies Partial<TimelineStore>;
}
