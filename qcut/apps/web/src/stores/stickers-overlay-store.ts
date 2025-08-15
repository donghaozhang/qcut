/**
 * Stickers Overlay Store
 *
 * Manages overlay stickers that appear on top of the video preview.
 * Separate from timeline to maintain simplicity and independence.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { debugLog } from "@/lib/debug-config";
import type {
  StickerOverlayStore,
  OverlaySticker,
  ValidatedStickerUpdate,
} from "@/types/sticker-overlay";
import { Z_INDEX } from "@/types/sticker-overlay";
// Dynamic imports to break circular dependencies
// import { useTimelineStore } from "./timeline-store";
// import { useProjectStore } from "./project-store";

// Import constants
const DEFAULTS = {
  position: { x: 50, y: 50 },
  size: { width: 8, height: 8 }, // Changed from 20, 20 to 8, 8 (much smaller default)
  rotation: 0,
  opacity: 1,
  maintainAspectRatio: true,
};

/**
 * Generate unique ID for stickers
 */
const generateStickerId = (): string => {
  return `sticker-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Calculate next z-index for new stickers
 */
const getNextZIndex = (stickers: Map<string, OverlaySticker>): number => {
  if (stickers.size === 0) return Z_INDEX.MIN;
  const maxZ = Math.max(...Array.from(stickers.values()).map((s) => s.zIndex));
  return Math.min(maxZ + Z_INDEX.INCREMENT, Z_INDEX.MAX);
};

/**
 * Validate a single sticker object
 */
const isValidSticker = (item: any): item is OverlaySticker => {
  return (
    item &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.mediaItemId === "string" &&
    item.position &&
    typeof item.position.x === "number" &&
    typeof item.position.y === "number" &&
    item.size &&
    typeof item.size.width === "number" &&
    typeof item.size.height === "number" &&
    typeof item.zIndex === "number"
  );
};

/**
 * Validate and convert sticker data to Map
 */
const validateAndLoadStickers = (data: any): Map<string, OverlaySticker> => {
  // Validate data structure
  if (!Array.isArray(data)) {
    debugLog(
      `[StickerStore] ⚠️ INVALID DATA: Expected array, got ${typeof data}`
    );
    return new Map();
  }

  // Validate each sticker object
  const validStickers = data.filter((item: any): item is OverlaySticker => {
    const isValid = isValidSticker(item);

    if (!isValid) {
      debugLog(
        "[StickerStore] ⚠️ INVALID STICKER: Skipping malformed sticker object:",
        item
      );
    }

    return isValid;
  });

  const filteredCount = data.length - validStickers.length;
  if (filteredCount > 0) {
    debugLog(
      `[StickerStore] 🧹 VALIDATION: Filtered out ${filteredCount} invalid sticker objects`
    );
  }

  return new Map(validStickers.map((s) => [s.id, s]));
};

/**
 * Main overlay store with all state and actions
 */
export const useStickersOverlayStore = create<StickerOverlayStore>()(
  devtools(
    (set, get) => ({
      // State
      overlayStickers: new Map(),
      selectedStickerId: null,
      isDragging: false,
      isResizing: false,
      isRotating: false,
      history: {
        past: [],
        future: [],
      },

      // Add sticker with smart defaults
      addOverlaySticker: (mediaItemId: string, options = {}) => {
        debugLog(
          `[StickerStore] 🎯 addOverlaySticker called with mediaItemId: ${mediaItemId}, options:`,
          options
        );
        const id = generateStickerId();
        const state = get();

        const newSticker: OverlaySticker = {
          id,
          mediaItemId,
          position: options.position || { ...DEFAULTS.position },
          size: options.size || { ...DEFAULTS.size },
          rotation: options.rotation ?? DEFAULTS.rotation,
          opacity: options.opacity ?? DEFAULTS.opacity,
          zIndex: options.zIndex || getNextZIndex(state.overlayStickers),
          maintainAspectRatio:
            options.maintainAspectRatio ?? DEFAULTS.maintainAspectRatio,
          timing: options.timing,
          metadata: {
            addedAt: Date.now(),
            lastModified: Date.now(),
            source: options.metadata?.source || "library",
          },
        };

        set((state) => {
          const newStickers = new Map(state.overlayStickers);
          newStickers.set(id, newSticker);

          // Add to history for undo
          const newHistory = {
            past: [
              ...state.history.past,
              Array.from(state.overlayStickers.values()),
            ],
            future: [], // Clear redo stack on new action
          };

          // Limit history size to prevent memory issues
          if (newHistory.past.length > 50) {
            newHistory.past.shift();
          }

          debugLog(
            `[StickerStore] Added sticker: ${id} (total: ${newStickers.size})`
          );

          return {
            overlayStickers: newStickers,
            selectedStickerId: id, // Auto-select new sticker
            history: newHistory,
          };
        });

        // Add to timeline if timing is specified (async)
        const addToTimelinePromise = get().addStickerToTimeline(newSticker);
        addToTimelinePromise.catch((error: unknown) => {
          debugLog("[StickerStore] ❌ Failed to add sticker to timeline:", error);
        });

        // Auto-save with a small delay to ensure state is updated
        setTimeout(() => {
          get().autoSaveSticker(id);
        }, 100);

        return id;
      },

      // Remove sticker with history tracking
      removeOverlaySticker: (id: string) => {
        set((state) => {
          const newStickers = new Map(state.overlayStickers);
          if (!newStickers.has(id)) return state;

          newStickers.delete(id);

          const newHistory = {
            past: [
              ...state.history.past,
              Array.from(state.overlayStickers.values()),
            ],
            future: [],
          };

          return {
            overlayStickers: newStickers,
            selectedStickerId:
              state.selectedStickerId === id ? null : state.selectedStickerId,
            history: newHistory,
          };
        });
      },

      // Update sticker with validation
      updateOverlaySticker: (id: string, updates: ValidatedStickerUpdate) => {
        set((state) => {
          const sticker = state.overlayStickers.get(id);
          if (!sticker) return state;

          const newStickers = new Map(state.overlayStickers);
          const updatedSticker: OverlaySticker = {
            ...sticker,
            ...updates,
            metadata: {
              ...sticker.metadata,
              addedAt: sticker.metadata?.addedAt || Date.now(),
              lastModified: Date.now(),
              source: sticker.metadata?.source,
            },
          };

          // Validate position bounds
          if (updatedSticker.position) {
            updatedSticker.position.x = Math.max(
              0,
              Math.min(100, updatedSticker.position.x)
            );
            updatedSticker.position.y = Math.max(
              0,
              Math.min(100, updatedSticker.position.y)
            );
          }

          // Validate size bounds
          if (updatedSticker.size) {
            updatedSticker.size.width = Math.max(
              5,
              Math.min(100, updatedSticker.size.width)
            );
            updatedSticker.size.height = Math.max(
              5,
              Math.min(100, updatedSticker.size.height)
            );
          }

          // Validate opacity
          if (typeof updatedSticker.opacity === "number") {
            updatedSticker.opacity = Math.max(
              0,
              Math.min(1, updatedSticker.opacity)
            );
          }

          newStickers.set(id, updatedSticker);

          return {
            overlayStickers: newStickers,
          };
        });
      },

      // Clear all stickers
      clearAllStickers: () => {
        set((state) => ({
          overlayStickers: new Map(),
          selectedStickerId: null,
          history: {
            past: [
              ...state.history.past,
              Array.from(state.overlayStickers.values()),
            ],
            future: [],
          },
        }));
      },

      // Selection management
      selectSticker: (id: string | null) => {
        set({ selectedStickerId: id });
      },

      // Layer management with proper z-index calculation
      bringToFront: (id: string) => {
        set((state) => {
          const sticker = state.overlayStickers.get(id);
          if (!sticker) return state;

          const maxZ = Math.max(
            ...Array.from(state.overlayStickers.values()).map((s) => s.zIndex)
          );

          const newStickers = new Map(state.overlayStickers);
          newStickers.set(id, {
            ...sticker,
            zIndex: Math.min(maxZ + Z_INDEX.INCREMENT, Z_INDEX.MAX),
          });

          return { overlayStickers: newStickers };
        });
      },

      sendToBack: (id: string) => {
        set((state) => {
          const sticker = state.overlayStickers.get(id);
          if (!sticker) return state;

          const minZ = Math.min(
            ...Array.from(state.overlayStickers.values()).map((s) => s.zIndex)
          );

          const newStickers = new Map(state.overlayStickers);
          newStickers.set(id, {
            ...sticker,
            zIndex: Math.max(Z_INDEX.MIN, minZ - Z_INDEX.INCREMENT),
          });

          return { overlayStickers: newStickers };
        });
      },

      bringForward: (id: string) => {
        set((state) => {
          const sticker = state.overlayStickers.get(id);
          if (!sticker) return state;

          const higherStickers = Array.from(state.overlayStickers.values())
            .filter((s) => s.zIndex > sticker.zIndex)
            .sort((a, b) => a.zIndex - b.zIndex);

          if (higherStickers.length > 0) {
            const newStickers = new Map(state.overlayStickers);
            newStickers.set(id, {
              ...sticker,
              zIndex: higherStickers[0].zIndex + Z_INDEX.INCREMENT,
            });

            return { overlayStickers: newStickers };
          }

          return state;
        });
      },

      sendBackward: (id: string) => {
        set((state) => {
          const sticker = state.overlayStickers.get(id);
          if (!sticker) return state;

          const lowerStickers = Array.from(state.overlayStickers.values())
            .filter((s) => s.zIndex < sticker.zIndex)
            .sort((a, b) => b.zIndex - a.zIndex);

          if (lowerStickers.length > 0) {
            const newStickers = new Map(state.overlayStickers);
            newStickers.set(id, {
              ...sticker,
              zIndex: Math.max(
                Z_INDEX.MIN,
                lowerStickers[0].zIndex - Z_INDEX.INCREMENT
              ),
            });

            return { overlayStickers: newStickers };
          }

          return state;
        });
      },

      // UI State management
      setIsDragging: (isDragging: boolean) => set({ isDragging }),
      setIsResizing: (isResizing: boolean) => set({ isResizing }),
      setIsRotating: (isRotating: boolean) => set({ isRotating }),

      // Undo/Redo functionality
      undo: () => {
        set((state) => {
          if (state.history.past.length === 0) return state;

          const newPast = [...state.history.past];
          const previousState = newPast.pop()!;
          const currentState = Array.from(state.overlayStickers.values());

          return {
            overlayStickers: new Map(previousState.map((s) => [s.id, s])),
            history: {
              past: newPast,
              future: [currentState, ...state.history.future],
            },
          };
        });
      },

      redo: () => {
        set((state) => {
          if (state.history.future.length === 0) return state;

          const newFuture = [...state.history.future];
          const nextState = newFuture.shift()!;
          const currentState = Array.from(state.overlayStickers.values());

          return {
            overlayStickers: new Map(nextState.map((s) => [s.id, s])),
            history: {
              past: [...state.history.past, currentState],
              future: newFuture,
            },
          };
        });
      },

      // Clean up stickers with missing media items
      cleanupInvalidStickers: (availableMediaIds: string[]) => {
        const state = get();
        const validStickers = new Map();
        let removedCount = 0;

        for (const [id, sticker] of state.overlayStickers) {
          if (availableMediaIds.includes(sticker.mediaItemId)) {
            validStickers.set(id, sticker);
          } else {
            removedCount++;
            debugLog(
              `[StickerStore] Removing sticker ${id} with missing media`
            );
          }
        }

        if (removedCount > 0) {
          debugLog(
            `[StickerStore] Removed ${removedCount} stickers with missing media`
          );
          set({
            overlayStickers: validStickers,
            selectedStickerId: validStickers.has(state.selectedStickerId)
              ? state.selectedStickerId
              : null,
          });
        }
      },

      // Persistence using existing storage patterns
      saveToProject: async (projectId: string) => {
        const state = get();
        const data = Array.from(state.overlayStickers.values());
        const key = `overlay-stickers-${projectId}`;


        debugLog(
          `[StickerStore] Saving ${data.length} stickers for project ${projectId}`
        );

        try {
          // Use Electron IPC if available, otherwise localStorage
          if (window.electronAPI?.storage) {
            debugLog(`[StickerStore] Saving via Electron IPC: ${key}`);
            await window.electronAPI.storage.save(key, data);
            debugLog(`[StickerStore] Saved ${data.length} stickers`);
          } else {
            debugLog(`[StickerStore] Saving via localStorage: ${key}`);
            localStorage.setItem(key, JSON.stringify(data));
            debugLog(`[StickerStore] Saved ${data.length} stickers`);

            // Verify save by immediately reading back
            const verification = localStorage.getItem(key);
            const parsedVerification = verification
              ? JSON.parse(verification)
              : [];
            // Verification removed for production
          }
        } catch (error) {
          debugLog(
            `[StickerStore] ❌ SAVE FAILED for project ${projectId}:`,
            error
          );
          // Try fallback to localStorage if Electron IPC fails
          if (window.electronAPI?.storage) {
            try {
              localStorage.setItem(key, JSON.stringify(data));
              debugLog(
                `[StickerStore] Fallback save via localStorage: ${data.length} stickers`
              );
            } catch (fallbackError) {
              debugLog(
                "[StickerStore] ❌ FALLBACK SAVE FAILED:",
                fallbackError
              );
            }
          }
        }
      },

      loadFromProject: async (projectId: string) => {
        const key = `overlay-stickers-${projectId}`;
        let data: OverlaySticker[] = [];

        debugLog(`[StickerStore] Loading stickers for project ${projectId}`);

        try {
          if (window.electronAPI?.storage) {
            data = (await window.electronAPI.storage.load(key)) || [];
            debugLog(
              `[StickerStore] Loaded via Electron IPC: ${data.length} stickers`
            );
          } else {
            const stored = localStorage.getItem(key);
            if (stored) {
              data = JSON.parse(stored);
              debugLog(
                `[StickerStore] Loaded via localStorage: ${data.length} stickers`
              );
            } else {
            }
          }

          // Validate and convert sticker data to Map
          const stickersMap = validateAndLoadStickers(data);
          set({
            overlayStickers: stickersMap,
            selectedStickerId: null,
            history: { past: [], future: [] },
          });

          debugLog(`[StickerStore] Loaded ${stickersMap.size} stickers`);
        } catch (error) {
          debugLog(
            `[StickerStore] ❌ LOAD FAILED for project ${projectId}:`,
            error
          );
          // Try fallback to localStorage if Electron IPC fails
          if (window.electronAPI?.storage) {
            try {
              const stored = localStorage.getItem(key);
              if (stored) {
                const fallbackData = JSON.parse(stored);
                const stickersMap = validateAndLoadStickers(fallbackData);
                set({
                  overlayStickers: stickersMap,
                  selectedStickerId: null,
                  history: { past: [], future: [] },
                });
                debugLog(
                  `[StickerStore] Fallback load: ${stickersMap.size} stickers`
                );
              }
            } catch (fallbackError) {
              debugLog(
                "[StickerStore] ❌ FALLBACK LOAD FAILED:",
                fallbackError
              );
              // Ensure clean state on total failure
              set({
                overlayStickers: new Map(),
                selectedStickerId: null,
                history: { past: [], future: [] },
              });
            }
          }
        }
      },

      // Export helpers
      getStickersForExport: () => {
        const state = get();
        return Array.from(state.overlayStickers.values()).sort(
          (a, b) => a.zIndex - b.zIndex
        );
      },

      getVisibleStickersAtTime: (time: number) => {
        const state = get();
        return Array.from(state.overlayStickers.values())
          .filter((sticker) => {
            if (!sticker.timing) return true;
            const { startTime = 0, endTime = Infinity } = sticker.timing;
            return time >= startTime && time <= endTime;
          })
          .sort((a, b) => a.zIndex - b.zIndex);
      },

      // Helper: Add sticker to timeline
      addStickerToTimeline: async (sticker: OverlaySticker) => {
        try {
          const { useTimelineStore } = await import("./timeline-store");
          const timelineStore = useTimelineStore.getState();
          debugLog(
            "[StickerStore] Timeline integration - checking timing:",
            sticker.timing
          );

          let stickerTrack = timelineStore.tracks.find(
            (track) => track.type === "sticker"
          );

          if (stickerTrack) {
            debugLog(
              `[StickerStore] Found existing sticker track: ${stickerTrack.id}`
            );
          } else {
            debugLog("[StickerStore] Creating new sticker timeline track");
            const trackId = timelineStore.addTrack("sticker");
            stickerTrack = timelineStore.tracks.find(
              (track) => track.id === trackId
            );
            debugLog(`[StickerStore] Created sticker track with ID: ${trackId}`);
          }

          debugLog(
            `[StickerStore] Checking conditions - stickerTrack: ${!!stickerTrack}, timing: ${!!sticker.timing}, startTime: ${sticker.timing?.startTime}, endTime: ${sticker.timing?.endTime}`
          );

          if (
            stickerTrack &&
            sticker.timing?.startTime !== undefined &&
            sticker.timing?.endTime !== undefined
          ) {
            const duration = sticker.timing.endTime - sticker.timing.startTime;
            debugLog(
              `[StickerStore] Adding sticker to timeline with duration: ${duration}s`
            );

            timelineStore.addElementToTrack(stickerTrack.id, {
              type: "sticker",
              stickerId: sticker.id,
              mediaId: sticker.mediaItemId,
              name: `Sticker ${get().overlayStickers.size}`,
              duration,
              startTime: sticker.timing.startTime,
              trimStart: 0,
              trimEnd: 0,
            });
            debugLog(
              `[StickerStore] ✅ Added sticker to timeline track: ${duration}s duration`
            );
          } else {
            debugLog(
              "[StickerStore] ❌ Failed to add sticker to timeline - missing requirements"
            );
          }
        } catch (error) {
          debugLog("[StickerStore] ❌ Timeline integration failed:", error);
        }
      },

      // Helper: Auto-save sticker to project
      autoSaveSticker: async (stickerId: string) => {
        try {
          const { useProjectStore } = await import("./project-store");
          const currentProject = useProjectStore.getState().activeProject;
          if (currentProject?.id) {
            debugLog(
              `[StickerStore] Auto-saving sticker to project: ${currentProject.id}`
            );
            try {
              await get().saveToProject(currentProject.id);
              debugLog(
                `[StickerStore] ✅ Auto-save completed for sticker ${stickerId}`
              );
            } catch (error) {
              debugLog("[StickerStore] ❌ Auto-save failed:", error);
            }
          }
        } catch (error) {
          debugLog("[StickerStore] ❌ Project store access failed:", error);
        }
      },
    }),
    {
      name: "stickers-overlay-store",
    }
  )
);
