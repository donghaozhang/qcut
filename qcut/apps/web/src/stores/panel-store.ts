import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_PANEL_SIZES = {
  toolsPanel: 20,
  previewPanel: 55,
  propertiesPanel: 25,
  mainContent: 70,
  timeline: 30,
  aiPanelWidth: 22,
  aiPanelMinWidth: 4,
} as const;

interface PanelState {
  // Panel sizes as percentages
  toolsPanel: number;
  previewPanel: number;
  propertiesPanel: number;
  mainContent: number;
  timeline: number;
  aiPanelWidth: number;
  aiPanelMinWidth: number;

  // Actions
  setToolsPanel: (size: number) => void;
  setPreviewPanel: (size: number) => void;
  setPropertiesPanel: (size: number) => void;
  setMainContent: (size: number) => void;
  setTimeline: (size: number) => void;
  setAiPanelWidth: (size: number) => void;
  normalizeHorizontalPanels: () => void;
}

// Debounce normalization to avoid excessive calls during resize
let normalizationTimeout: NodeJS.Timeout | null = null;
let isNormalizing = false;
const debouncedNormalize = (normalizeFunc: () => void) => {
  if (isNormalizing) return; // Prevent recursive calls

  if (normalizationTimeout) {
    clearTimeout(normalizationTimeout);
  }
  normalizationTimeout = setTimeout(() => {
    isNormalizing = true;
    try {
      normalizeFunc();
    } finally {
      isNormalizing = false;
    }
  }, 50); // 50ms debounce
};

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      // Default sizes - optimized for responsiveness
      ...DEFAULT_PANEL_SIZES,

      // Actions
      setToolsPanel: (size) => {
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().toolsPanel;

        // Only update if the size actually changed (prevents infinite loops)
        if (Math.abs(currentSize - roundedSize) > 0.01) {
          set({ toolsPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        }
      },
      setPreviewPanel: (size) => {
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().previewPanel;

        // Only update if the size actually changed (prevents infinite loops)
        if (Math.abs(currentSize - roundedSize) > 0.01) {
          set({ previewPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        }
      },
      setPropertiesPanel: (size) => {
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().propertiesPanel;

        // Only update if the size actually changed (prevents infinite loops)
        if (Math.abs(currentSize - roundedSize) > 0.01) {
          set({ propertiesPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        }
      },
      setMainContent: (size) => set({ mainContent: size }),
      setTimeline: (size) => set({ timeline: size }),
      setAiPanelWidth: (size) => set({ aiPanelWidth: size }),

      // Normalize horizontal panels to ensure they add up to 100%
      normalizeHorizontalPanels: () => {
        const state = get();
        const total =
          state.toolsPanel + state.previewPanel + state.propertiesPanel;

        // Use a larger tolerance to avoid constant warnings from floating-point precision issues
        const tolerance = 0.1; // 0.1% tolerance instead of 0.01%

        if (Math.abs(total - 100) > tolerance) {
          // Only log warning for significant deviations (> 1%)
          if (Math.abs(total - 100) > 1) {
            console.warn(
              `WARNING: Invalid layout total size: ${state.toolsPanel}%, ${state.previewPanel}%, ${state.propertiesPanel}%. Layout normalization will be applied.`
            );
          }

          // If the values are way off, reset to defaults
          if (total < 50 || total > 150) {
            console.warn(
              "[PanelStore] Panel sizes severely corrupted, resetting to defaults"
            );
            set({
              toolsPanel: DEFAULT_PANEL_SIZES.toolsPanel,
              previewPanel: DEFAULT_PANEL_SIZES.previewPanel,
              propertiesPanel: DEFAULT_PANEL_SIZES.propertiesPanel,
            });
          } else {
            // Calculate normalized values with rounding to avoid precision issues
            const factor = 100 / total;
            const normalizedTools =
              Math.round(state.toolsPanel * factor * 100) / 100;
            const normalizedPreview =
              Math.round(state.previewPanel * factor * 100) / 100;
            // Properties panel gets the remainder to ensure exact 100%
            const normalizedProperties =
              Math.round((100 - normalizedTools - normalizedPreview) * 100) /
              100;

            set({
              toolsPanel: normalizedTools,
              previewPanel: normalizedPreview,
              propertiesPanel: normalizedProperties,
            });
          }
        }
      },
    }),
    {
      name: "panel-sizes",
      version: 6, // Increment this to force migration
      migrate: (persistedState: any, version: number) => {
        // Reset to defaults if coming from old version or if data is corrupted
        if (version < 6) {
          console.log(
            "[PanelStore] Migrating from version",
            version,
            "to version 6"
          );
          return DEFAULT_PANEL_SIZES;
        }

        // Validate persisted state
        if (
          !persistedState ||
          typeof persistedState.toolsPanel !== "number" ||
          typeof persistedState.previewPanel !== "number" ||
          typeof persistedState.propertiesPanel !== "number"
        ) {
          console.warn(
            "[PanelStore] Invalid persisted state, resetting to defaults"
          );
          return DEFAULT_PANEL_SIZES;
        }

        // Normalize horizontal panels on load
        const total =
          persistedState.toolsPanel +
          persistedState.previewPanel +
          persistedState.propertiesPanel;

        // If severely corrupted, reset to defaults
        if (total < 50 || total > 150 || isNaN(total)) {
          console.warn(
            "[PanelStore] Corrupted panel sizes detected, resetting to defaults"
          );
          return DEFAULT_PANEL_SIZES;
        }

        if (Math.abs(total - 100) > 0.1) {
          const factor = 100 / total;
          const normalizedTools =
            Math.round(persistedState.toolsPanel * factor * 100) / 100;
          const normalizedPreview =
            Math.round(persistedState.previewPanel * factor * 100) / 100;
          // Properties panel gets the remainder to ensure exact 100%
          const normalizedProperties =
            Math.round((100 - normalizedTools - normalizedPreview) * 100) / 100;

          return {
            ...persistedState,
            toolsPanel: normalizedTools,
            previewPanel: normalizedPreview,
            propertiesPanel: normalizedProperties,
          };
        }

        return persistedState;
      },
    }
  )
);
