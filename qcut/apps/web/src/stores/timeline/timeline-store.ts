/**
 * Timeline Store
 *
 * Core state management for the video timeline. Handles tracks, elements,
 * drag operations, selection, and timeline persistence.
 *
 * Composes sub-modules for auto-save, CRUD, and persistence operations.
 *
 * @see timeline-store-autosave.ts - Auto-save helpers and debounce logic
 * @see timeline-store-crud.ts - Element add/remove/move/update operations
 * @see timeline-store-persistence.ts - Load/save/query operations
 * @see timeline-store-normalization.ts - Element normalization functions
 * @see timeline-store-operations.ts - Ripple, split, audio, drag, add-at-time, effects
 *
 * @module stores/timeline-store
 */

import { create } from "zustand";
import { sortTracksByOrder, ensureMainTrack } from "@/types/timeline";
import { DEFAULT_PROJECT_TIMELINE_SETTINGS } from "@/types/project";
import { findOccupyingElement } from "@/lib/timeline-occupancy";

import { type TimelineStore } from "./index";
import {
	captureTimelineHistorySnapshot,
	restoreTimelinePlayhead,
} from "./timeline-history";
import { createTimelineOperations } from "./timeline-store-operations";
import { createAutoSaveHelpers } from "./timeline-store-autosave";
import { createCrudOperations } from "./timeline-store-crud";
import { createPersistenceOperations } from "./timeline-store-persistence";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { useProjectStore } from "../project-store";

export const useTimelineStore = create<TimelineStore>((set, get) => {
	// Create auto-save helpers (closure-level functions)
	const { updateTracks, autoSaveTimeline, updateTracksAndSave } =
		createAutoSaveHelpers(get, set);

	// Initialize with proper track ordering
	const initialTracks = ensureMainTrack([]);
	const sortedInitialTracks = sortTracksByOrder(initialTracks);

	// Persist the behavior toggles onto the active project (QTL-005).
	const persistTimelineSettings = () => {
		const {
			snappingEnabled,
			mainTrackMagnetEnabled,
			linkedRippleEnabled,
			overlayStacking,
		} = get();
		useProjectStore
			.getState()
			.updateProjectTimelineSettings({
				snappingEnabled,
				mainTrackMagnetEnabled,
				linkedRippleEnabled,
				overlayStacking,
			})
			.catch(() => {
				// No active project (or storage failure already reported).
			});
	};

	return {
		_tracks: sortedInitialTracks,
		tracks: sortedInitialTracks,
		history: [],
		redoStack: [],
		autoSaveStatus: "Auto-save idle",
		isAutoSaving: false,
		lastAutoSaveAt: null,
		selectedElements: [],
		selectedTransition: null,
		rippleEditingEnabled: false,

		// Timeline behavior toggles (QTL-005) — persisted per project; these
		// are the deterministic defaults for legacy projects.
		snappingEnabled: DEFAULT_PROJECT_TIMELINE_SETTINGS.snappingEnabled,
		mainTrackMagnetEnabled:
			DEFAULT_PROJECT_TIMELINE_SETTINGS.mainTrackMagnetEnabled,
		linkedRippleEnabled: DEFAULT_PROJECT_TIMELINE_SETTINGS.linkedRippleEnabled,
		overlayStacking: DEFAULT_PROJECT_TIMELINE_SETTINGS.overlayStacking,

		// Effects track visibility - load from localStorage, default to false
		showEffectsTrack:
			typeof window !== "undefined"
				? localStorage.getItem("timeline-showEffectsTrack") === "true"
				: false,

		getSortedTracks: () => {
			const { _tracks } = get();
			const tracksWithMain = ensureMainTrack(_tracks);
			return sortTracksByOrder(tracksWithMain);
		},

		pushHistory: () => {
			const { _tracks, history, selectedElements, selectedTransition } = get();
			set({
				history: [
					...history,
					captureTimelineHistorySnapshot({
						tracks: _tracks,
						selectedElements,
						selectedTransition,
					}),
				],
				redoStack: [],
			});
		},

		undo: () => {
			const {
				history,
				redoStack,
				_tracks,
				selectedElements,
				selectedTransition,
			} = get();
			const previous = history[history.length - 1];
			if (!previous) return;
			const current = captureTimelineHistorySnapshot({
				tracks: _tracks,
				selectedElements,
				selectedTransition,
			});
			updateTracksAndSave(previous.tracks);
			set({
				history: history.slice(0, -1),
				redoStack: [...redoStack, current],
				selectedElements: previous.selectedElements,
				selectedTransition: previous.selectedTransition,
			});
			restoreTimelinePlayhead({ snapshot: previous });
		},

		selectElement: (trackId, elementId, multi = false) => {
			set((state) => {
				const exists = state.selectedElements.some(
					(c) => c.trackId === trackId && c.elementId === elementId
				);
				if (multi) {
					return exists
						? {
								selectedElements: state.selectedElements.filter(
									(c) => !(c.trackId === trackId && c.elementId === elementId)
								),
								selectedTransition: null,
							}
						: {
								selectedElements: [
									...state.selectedElements,
									{ trackId, elementId },
								],
								selectedTransition: null,
							};
				}
				const selectedElement = state._tracks
					.find((track) => track.id === trackId)
					?.elements.find((element) => element.id === elementId);
				if (selectedElement?.groupId) {
					return {
						selectedElements: state._tracks.flatMap((track) =>
							track.elements
								.filter(
									(element) => element.groupId === selectedElement.groupId
								)
								.map((element) => ({
									trackId: track.id,
									elementId: element.id,
								}))
						),
						selectedTransition: null,
					};
				}
				return {
					selectedElements: [{ trackId, elementId }],
					selectedTransition: null,
				};
			});
		},

		deselectElement: (trackId, elementId) => {
			set((state) => ({
				selectedElements: state.selectedElements.filter(
					(c) => !(c.trackId === trackId && c.elementId === elementId)
				),
			}));
		},

		clearSelectedElements: () => {
			set({ selectedElements: [], selectedTransition: null });
		},

		setSelectedElements: (elements) =>
			set({ selectedElements: elements, selectedTransition: null }),

		// Snapping actions
		toggleSnapping: () => {
			set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			persistTimelineSettings();
		},

		toggleMainTrackMagnet: () => {
			set((state) => ({
				mainTrackMagnetEnabled: !state.mainTrackMagnetEnabled,
			}));
			persistTimelineSettings();
		},

		toggleLinkedRipple: () => {
			set((state) => ({ linkedRippleEnabled: !state.linkedRippleEnabled }));
			persistTimelineSettings();
		},

		toggleOverlayStacking: () => {
			set((state) => ({
				overlayStacking:
					state.overlayStacking === "byArrival" ? "byType" : "byArrival",
			}));
			persistTimelineSettings();
		},

		applyProjectTimelineSettings: ({ settings }) => {
			set({
				snappingEnabled: settings.snappingEnabled,
				mainTrackMagnetEnabled: settings.mainTrackMagnetEnabled,
				linkedRippleEnabled: settings.linkedRippleEnabled,
				overlayStacking: settings.overlayStacking,
			});
		},

		// Ripple editing functions
		toggleRippleEditing: () => {
			set((state) => ({
				rippleEditingEnabled: !state.rippleEditingEnabled,
			}));
		},

		// Effects track visibility functions
		toggleEffectsTrack: () => {
			const { showEffectsTrack } = get();
			const newValue = !showEffectsTrack;
			set({ showEffectsTrack: newValue });

			// Persist to localStorage
			if (typeof window !== "undefined") {
				localStorage.setItem("timeline-showEffectsTrack", String(newValue));
			}
		},

		autoShowEffectsTrack: () => {
			const { showEffectsTrack } = get();
			if (!showEffectsTrack) {
				set({ showEffectsTrack: true });

				// Persist to localStorage
				if (typeof window !== "undefined") {
					localStorage.setItem("timeline-showEffectsTrack", "true");
				}
			}
		},

		checkElementOverlap: (trackId, startTime, duration, excludeElementId) => {
			const track = get()._tracks.find((t) => t.id === trackId);
			if (!track) return false;

			const overlap = track.elements.some((element) => {
				const elementEnd =
					element.startTime +
					(element.type === "media"
						? getMediaTimelineDuration(element)
						: element.duration - element.trimStart - element.trimEnd);

				if (element.id === excludeElementId) {
					return false;
				}

				return (
					(startTime >= element.startTime && startTime < elementEnd) ||
					(startTime + duration > element.startTime &&
						startTime + duration <= elementEnd) ||
					(startTime < element.startTime && startTime + duration > elementEnd)
				);
			});
			return overlap;
		},

		findOrCreateTrack: (trackType, span) => {
			// Always create new text/markdown tracks to keep overlays independent.
			if (trackType === "text" || trackType === "markdown") {
				return get().insertTrackAt(trackType, 0);
			}
			// Jianying-style arrival stacking (T6): a NEW overlay lane of any
			// type goes straight to the top instead of its type group. Reuse of
			// an existing free lane below is unchanged in both modes.
			const overlayCreatesOnTop =
				get().overlayStacking === "byArrival" &&
				(trackType === "captions" ||
					trackType === "sticker" ||
					trackType === "adjustment" ||
					trackType === "effect");

			const existingTrack = get()._tracks.find((track) => {
				if (track.type !== trackType || track.locked) return false;
				if (!span) return true;
				return (
					findOccupyingElement({
						track,
						startTime: span.startTime,
						duration: span.duration,
						fps: useProjectStore.getState().activeProject?.fps ?? 30,
					}) === null
				);
			});
			if (existingTrack) {
				return existingTrack.id;
			}

			return overlayCreatesOnTop
				? get().insertTrackAt(trackType, 0)
				: get().addTrack(trackType);
		},

		// CRUD operations (add/remove/move/update tracks and elements)
		...createCrudOperations(get, set, {
			updateTracksAndSave,
			getProjectFps: () => useProjectStore.getState().activeProject?.fps ?? 30,
		}),

		// Persistence operations (load/save/query/thumbnail)
		...createPersistenceOperations(get, set, {
			getProjectFps: () => useProjectStore.getState().activeProject?.fps ?? 30,
			updateTracks,
			updateTracksAndSave,
		}),

		// Operations (ripple, split, audio/media, drag, add-at-time, effects)
		...createTimelineOperations({
			get,
			set,
			deps: {
				updateTracks,
				updateTracksAndSave,
				autoSaveTimeline,
				getProjectFps: () =>
					useProjectStore.getState().activeProject?.fps ?? 30,
			},
		}),
	};
});

// Expose for iPad CLI debugging (qcut://eval)
(window as any).__timelineStore = useTimelineStore;
