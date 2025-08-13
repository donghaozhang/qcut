/**
 * Stickers Overlay Store
 *
 * Manages overlay stickers that appear on top of the video preview.
 * Separate from timeline to maintain simplicity and independence.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  StickerOverlayStore,
  OverlaySticker,
  ValidatedStickerUpdate,
  STICKER_DEFAULTS,
  Z_INDEX,
} from "@/types/sticker-overlay";

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
  if (stickers.size === 0) return Z_INDEX.MIN * 10; // Start at a reasonable baseline
  const maxZ = Math.max(...Array.from(stickers.values()).map((s) => s.zIndex));
  return Math.min(maxZ + Z_INDEX.INCREMENT, Z_INDEX.MAX);
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

          console.log(
            "[StickerStore] ✅ SIZE FIX: Added sticker with new smaller default size:",
            {
              id,
              mediaItemId,
              defaultSize: { width: 8, height: 8 }, // Show the new smaller size
              position: newSticker.position,
              totalStickers: newStickers.size,
            }
          );

          console.log(
            "[StickerStore] 🔔 PERSISTENCE DEBUG: Sticker added, triggering auto-save for new sticker count:",
            newStickers.size
          );

          return {
            overlayStickers: newStickers,
            selectedStickerId: id, // Auto-select new sticker
            history: newHistory,
          };
        });

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
        const state = get();
        const sticker = state.overlayStickers.get(id);
        if (!sticker) return;

        const maxZ = Math.max(
          ...Array.from(state.overlayStickers.values()).map((s) => s.zIndex)
        );
        state.updateOverlaySticker(id, { zIndex: maxZ + 10 });
      },

      sendToBack: (id: string) => {
        const state = get();
        const sticker = state.overlayStickers.get(id);
        if (!sticker) return;

        const minZ = Math.min(
          ...Array.from(state.overlayStickers.values()).map((s) => s.zIndex)
        );
        state.updateOverlaySticker(id, { zIndex: Math.max(1, minZ - 10) });
      },

      bringForward: (id: string) => {
        const state = get();
        const sticker = state.overlayStickers.get(id);
        if (!sticker) return;

        const higherStickers = Array.from(state.overlayStickers.values())
          .filter((s) => s.zIndex > sticker.zIndex)
          .sort((a, b) => a.zIndex - b.zIndex);

        if (higherStickers.length > 0) {
          state.updateOverlaySticker(id, {
            zIndex: higherStickers[0].zIndex + 5,
          });
        }
      },

      sendBackward: (id: string) => {
        const state = get();
        const sticker = state.overlayStickers.get(id);
        if (!sticker) return;

        const lowerStickers = Array.from(state.overlayStickers.values())
          .filter((s) => s.zIndex < sticker.zIndex)
          .sort((a, b) => b.zIndex - a.zIndex);

        if (lowerStickers.length > 0) {
          state.updateOverlaySticker(id, {
            zIndex: Math.max(1, lowerStickers[0].zIndex - 5),
          });
        }
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
            console.log(
              `[StickerStore] 🧹 CLEANUP: Removing sticker ${id} with missing media ${sticker.mediaItemId}`
            );
          }
        }

        if (removedCount > 0) {
          console.log(
            `[StickerStore] ✅ CLEANUP: Removed ${removedCount} stickers with missing media`
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

        console.log(
          `[StickerStore] 💾 SAVING: ${data.length} stickers for project ${projectId}`
        );
        console.log(
          `[StickerStore] 📦 SAVE DATA PREVIEW:`,
          data.map((s) => ({
            id: s.id,
            mediaId: s.mediaItemId,
            size: s.size,
          }))
        );

        try {
          // Use Electron IPC if available, otherwise localStorage
          if (window.electronAPI?.storage) {
            console.log(
              `[StickerStore] 📞 CALLING Electron IPC save with key: ${key}`
            );
            await window.electronAPI.storage.save(key, data);
            console.log(
              `[StickerStore] ✅ SAVED via Electron IPC: ${data.length} stickers`
            );

            // Verify save by immediately reading back
            const verification = await window.electronAPI.storage.load(key);
            console.log(
              `[StickerStore] 🔍 SAVE VERIFICATION: Read back ${verification?.length || 0} stickers`
            );
          } else {
            console.log(
              `[StickerStore] 📞 CALLING localStorage.setItem with key: ${key}`
            );
            localStorage.setItem(key, JSON.stringify(data));
            console.log(
              `[StickerStore] ✅ SAVED via localStorage: ${data.length} stickers`
            );

            // Verify save by immediately reading back
            const verification = localStorage.getItem(key);
            const parsedVerification = verification
              ? JSON.parse(verification)
              : [];
            console.log(
              `[StickerStore] 🔍 SAVE VERIFICATION: Read back ${parsedVerification.length} stickers`
            );
          }
        } catch (error) {
          console.error(
            `[StickerStore] ❌ SAVE FAILED for project ${projectId}:`,
            error
          );
          // Try fallback to localStorage if Electron IPC fails
          if (window.electronAPI?.storage) {
            try {
              localStorage.setItem(key, JSON.stringify(data));
              console.log(
                `[StickerStore] ✅ FALLBACK SAVE via localStorage: ${data.length} stickers`
              );
            } catch (fallbackError) {
              console.error(
                `[StickerStore] ❌ FALLBACK SAVE FAILED:`,
                fallbackError
              );
            }
          }
        }
      },

      loadFromProject: async (projectId: string) => {
        const key = `overlay-stickers-${projectId}`;
        let data: OverlaySticker[] = [];

        console.log(
          `[StickerStore] 📂 LOADING: stickers for project ${projectId}`
        );

        try {
          if (window.electronAPI?.storage) {
            console.log(
              `[StickerStore] 📞 CALLING Electron IPC load for key: ${key}`
            );
            const rawData = await window.electronAPI.storage.load(key);
            console.log(
              `[StickerStore] 📦 RAW DATA from Electron IPC:`,
              rawData
            );
            data = rawData || [];
            console.log(
              `[StickerStore] ✅ LOADED via Electron IPC: ${data.length} stickers`
            );
          } else {
            console.log(
              `[StickerStore] 📞 CALLING localStorage.getItem for key: ${key}`
            );
            const stored = localStorage.getItem(key);
            console.log(
              `[StickerStore] 📦 RAW DATA from localStorage:`,
              stored
            );
            if (stored) {
              data = JSON.parse(stored);
              console.log(
                `[StickerStore] ✅ LOADED via localStorage: ${data.length} stickers`
              );
            } else {
              console.log(
                `[StickerStore] ℹ️ NO DATA found for project ${projectId}`
              );
            }
          }

          // Validate data structure and individual sticker objects
          if (!Array.isArray(data)) {
            console.warn(
              `[StickerStore] ⚠️ INVALID DATA: Expected array, got ${typeof data}`
            );
            data = [];
          } else {
            // Validate each sticker object has required fields
            const validStickers = data.filter(
              (item: any): item is OverlaySticker => {
                const isValid =
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
                  typeof item.zIndex === "number";

                if (!isValid) {
                  console.warn(
                    `[StickerStore] ⚠️ INVALID STICKER: Skipping malformed sticker object:`,
                    item
                  );
                }

                return isValid;
              }
            );

            const filteredCount = data.length - validStickers.length;
            if (filteredCount > 0) {
              console.warn(
                `[StickerStore] 🧹 VALIDATION: Filtered out ${filteredCount} invalid sticker objects`
              );
            }

            data = validStickers;
          }

          const stickersMap = new Map(data.map((s) => [s.id, s]));
          set({
            overlayStickers: stickersMap,
            selectedStickerId: null,
            history: { past: [], future: [] },
          });

          console.log(
            `[StickerStore] ✅ LOADED COMPLETE: ${stickersMap.size} stickers applied to store`
          );
        } catch (error) {
          console.error(
            `[StickerStore] ❌ LOAD FAILED for project ${projectId}:`,
            error
          );
          // Try fallback to localStorage if Electron IPC fails
          if (window.electronAPI?.storage) {
            try {
              const stored = localStorage.getItem(key);
              if (stored) {
                data = JSON.parse(stored);
                const stickersMap = new Map(data.map((s) => [s.id, s]));
                set({
                  overlayStickers: stickersMap,
                  selectedStickerId: null,
                  history: { past: [], future: [] },
                });
                console.log(
                  `[StickerStore] ✅ FALLBACK LOAD via localStorage: ${data.length} stickers`
                );
              }
            } catch (fallbackError) {
              console.error(
                `[StickerStore] ❌ FALLBACK LOAD FAILED:`,
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
    }),
    {
      name: "stickers-overlay-store",
    }
  )
);
