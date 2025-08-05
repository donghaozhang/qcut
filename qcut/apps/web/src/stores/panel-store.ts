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

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      // Default sizes - optimized for responsiveness
      ...DEFAULT_PANEL_SIZES,

      // Actions
      setToolsPanel: (size) => {
        set({ toolsPanel: size });
        get().normalizeHorizontalPanels();
      },
      setPreviewPanel: (size) => {
        set({ previewPanel: size });
        get().normalizeHorizontalPanels();
      },
      setPropertiesPanel: (size) => {
        set({ propertiesPanel: size });
        get().normalizeHorizontalPanels();
      },
      setMainContent: (size) => set({ mainContent: size }),
      setTimeline: (size) => set({ timeline: size }),
      setAiPanelWidth: (size) => set({ aiPanelWidth: size }),

      // Normalize horizontal panels to ensure they add up to 100%
      normalizeHorizontalPanels: () => {
        const state = get();
        const total =
          state.toolsPanel + state.previewPanel + state.propertiesPanel;

        if (Math.abs(total - 100) > 0.01) {
          // Calculate normalized values
          const factor = 100 / total;
          set({
            toolsPanel: state.toolsPanel * factor,
            previewPanel: state.previewPanel * factor,
            propertiesPanel: state.propertiesPanel * factor,
          });
        }
      },
    }),
    {
      name: "panel-sizes",
      version: 3, // Increment this to reset stored values
      migrate: (persistedState: any, version: number) => {
        // Reset to defaults if coming from old version
        if (version < 3) {
          return DEFAULT_PANEL_SIZES;
        }

        // Normalize horizontal panels on load
        const total =
          persistedState.toolsPanel +
          persistedState.previewPanel +
          persistedState.propertiesPanel;
        if (Math.abs(total - 100) > 0.01) {
          const factor = 100 / total;
          return {
            ...persistedState,
            toolsPanel: persistedState.toolsPanel * factor,
            previewPanel: persistedState.previewPanel * factor,
            propertiesPanel: persistedState.propertiesPanel * factor,
          };
        }

        return persistedState;
      },
    }
  )
);
