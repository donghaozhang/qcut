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
  size: { width: 20, height: 20 },
  rotation: 0,
  opacity: 1,
  maintainAspectRatio: true,
};

/**
 * Generate unique ID for stickers
 */
const generateStickerId = (): string => {
  return `sticker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate next z-index for new stickers
 */
const getNextZIndex = (stickers: Map<string, OverlaySticker>): number => {
  if (stickers.size === 0) return 100;
  const maxZ = Math.max(...Array.from(stickers.values()).map((s) => s.zIndex));
  return maxZ + 10;
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

      // Persistence using existing storage patterns
      saveToProject: async (projectId: string) => {
        const state = get();
        const data = Array.from(state.overlayStickers.values());
        const key = `overlay-stickers-${projectId}`;

        try {
          // Use Electron IPC if available, otherwise localStorage
          if (window.electronAPI?.storage) {
            await window.electronAPI.storage.save(key, data);
          } else {
            localStorage.setItem(key, JSON.stringify(data));
          }
        } catch (error) {
          console.error("Failed to save overlay stickers:", error);
        }
      },

      loadFromProject: async (projectId: string) => {
        const key = `overlay-stickers-${projectId}`;
        let data: OverlaySticker[] = [];

        try {
          if (window.electronAPI?.storage) {
            data = (await window.electronAPI.storage.load(key)) || [];
          } else {
            const stored = localStorage.getItem(key);
            if (stored) {
              data = JSON.parse(stored);
            }
          }

          const stickersMap = new Map(data.map((s) => [s.id, s]));
          set({
            overlayStickers: stickersMap,
            selectedStickerId: null,
            history: { past: [], future: [] },
          });
        } catch (error) {
          console.error("Failed to load overlay stickers:", error);
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
