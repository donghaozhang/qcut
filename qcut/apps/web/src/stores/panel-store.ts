import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_PANEL_SIZES = {
  toolsPanel: 45,
  previewPanel: 75,
  propertiesPanel: 20,
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
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      // Default sizes - optimized for responsiveness
      ...DEFAULT_PANEL_SIZES,

      // Actions
      setToolsPanel: (size) => set({ toolsPanel: size }),
      setPreviewPanel: (size) => set({ previewPanel: size }),
      setPropertiesPanel: (size) => set({ propertiesPanel: size }),
      setMainContent: (size) => set({ mainContent: size }),
      setTimeline: (size) => set({ timeline: size }),
      setAiPanelWidth: (size) => set({ aiPanelWidth: size }),
    }),
    {
      name: "panel-sizes",
    }
  )
);
