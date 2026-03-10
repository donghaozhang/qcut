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

import { type TimelineStore } from "./index";
import { createTimelineOperations } from "./timeline-store-operations";
import { createAutoSaveHelpers } from "./timeline-store-autosave";
import { createCrudOperations } from "./timeline-store-crud";
import { createPersistenceOperations } from "./timeline-store-persistence";

export const useTimelineStore = create<TimelineStore>((set, get) => {
	// Create auto-save helpers (closure-level functions)
	const { updateTracks, autoSaveTimeline, updateTracksAndSave } =
		createAutoSaveHelpers(get, set);

	// Initialize with proper track ordering
	const initialTracks = ensureMainTrack([]);
	const sortedInitialTracks = sortTracksByOrder(initialTracks);

	return {
		_tracks: initialTracks,
		tracks: sortedInitialTracks,
		history: [],
		redoStack: [],
		autoSaveStatus: "Auto-save idle",
		isAutoSaving: false,
		lastAutoSaveAt: null,
		selectedElements: [],
		rippleEditingEnabled: false,

		// Snapping settings defaults
		snappingEnabled: true,

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
			const { _tracks, history } = get();
			set({
				history: [...history, JSON.parse(JSON.stringify(_tracks))],
				redoStack: [],
			});
		},

		undo: () => {
			const { history, redoStack, _tracks } = get();
			if (history.length === 0) return;
			const prev = history[history.length - 1];
			updateTracksAndSave(prev);
			set({
				history: history.slice(0, -1),
				redoStack: [...redoStack, JSON.parse(JSON.stringify(_tracks))],
			});
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
							}
						: {
								selectedElements: [
									...state.selectedElements,
									{ trackId, elementId },
								],
							};
				}
				return { selectedElements: [{ trackId, elementId }] };
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
			set({ selectedElements: [] });
		},

		setSelectedElements: (elements) => set({ selectedElements: elements }),

		// Snapping actions
		toggleSnapping: () => {
			set((state) => ({ snappingEnabled: !state.snappingEnabled }));
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
					element.duration -
					element.trimStart -
					element.trimEnd;

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

		findOrCreateTrack: (trackType) => {
			// Always create new text/markdown tracks to keep overlays independent.
			if (trackType === "text" || trackType === "markdown") {
				return get().insertTrackAt(trackType, 0);
			}

			const existingTrack = get()._tracks.find((t) => t.type === trackType);
			if (existingTrack) {
				return existingTrack.id;
			}

			return get().addTrack(trackType);
		},

		// CRUD operations (add/remove/move/update tracks and elements)
		...createCrudOperations(get, set, { updateTracksAndSave }),

		// Persistence operations (load/save/query/thumbnail)
		...createPersistenceOperations(get, set, {
			updateTracks,
			updateTracksAndSave,
		}),

		// Operations (ripple, split, audio/media, drag, add-at-time, effects)
		...createTimelineOperations({
			get,
			set,
			deps: { updateTracks, updateTracksAndSave, autoSaveTimeline },
		}),
	};
});

// Expose for iPad CLI debugging (qcut://eval)
(window as any).__timelineStore = useTimelineStore;
