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
          console.warn(
            `[PanelStore] Invalid layout total size: ${state.toolsPanel}%, ${state.previewPanel}%, ${state.propertiesPanel}%. Normalizing to 100%.`
          );
          
          // If the values are way off, reset to defaults
          if (total < 50 || total > 150) {
            console.warn('[PanelStore] Panel sizes severely corrupted, resetting to defaults');
            set({
              toolsPanel: DEFAULT_PANEL_SIZES.toolsPanel,
              previewPanel: DEFAULT_PANEL_SIZES.previewPanel,
              propertiesPanel: DEFAULT_PANEL_SIZES.propertiesPanel,
            });
          } else {
            // Calculate normalized values
            const factor = 100 / total;
            set({
              toolsPanel: state.toolsPanel * factor,
              previewPanel: state.previewPanel * factor,
              propertiesPanel: state.propertiesPanel * factor,
            });
          }
        }
      },
    }),
    {
      name: "panel-sizes",
      version: 4, // Increment this to force migration
      migrate: (persistedState: any, version: number) => {
        // Reset to defaults if coming from old version or if data is corrupted
        if (version < 4) {
          console.log('[PanelStore] Migrating from version', version, 'to version 4');
          return DEFAULT_PANEL_SIZES;
        }

        // Validate persisted state
        if (!persistedState || 
            typeof persistedState.toolsPanel !== 'number' ||
            typeof persistedState.previewPanel !== 'number' ||
            typeof persistedState.propertiesPanel !== 'number') {
          console.warn('[PanelStore] Invalid persisted state, resetting to defaults');
          return DEFAULT_PANEL_SIZES;
        }

        // Normalize horizontal panels on load
        const total =
          persistedState.toolsPanel +
          persistedState.previewPanel +
          persistedState.propertiesPanel;
        
        // If severely corrupted, reset to defaults
        if (total < 50 || total > 150 || isNaN(total)) {
          console.warn('[PanelStore] Corrupted panel sizes detected, resetting to defaults');
          return DEFAULT_PANEL_SIZES;
        }
        
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
