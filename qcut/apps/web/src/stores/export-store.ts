import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  ExportSettings,
  ExportProgress,
  ExportFormat,
  ExportQuality,
  getDefaultFilename,
  QUALITY_RESOLUTIONS,
} from "@/types/export";

// Export history entry
export interface ExportHistoryEntry {
  id: string;
  filename: string;
  settings: ExportSettings;
  timestamp: Date;
  duration: number; // Export duration in seconds
  fileSize?: number; // File size in bytes (if available)
  success: boolean;
  error?: string;
}

interface ExportStore {
  // Dialog state
  isDialogOpen: boolean;
  panelView: 'properties' | 'export';

  // Export settings
  settings: ExportSettings;

  // Export progress
  progress: ExportProgress;

  // Error state
  error: string | null;

  // Export history
  exportHistory: ExportHistoryEntry[];

  // Actions
  setDialogOpen: (open: boolean) => void;
  setPanelView: (view: 'properties' | 'export') => void;
  updateSettings: (settings: Partial<ExportSettings>) => void;
  updateProgress: (progress: Partial<ExportProgress>) => void;
  setError: (error: string | null) => void;
  resetExport: () => void;

  // History actions
  addToHistory: (entry: Omit<ExportHistoryEntry, "id" | "timestamp">) => void;
  clearHistory: () => void;
  getRecentExports: (limit?: number) => ExportHistoryEntry[];
  replayExport: (historyId: string) => void;
}

// Default settings factory
const getDefaultSettings = (): ExportSettings => {
  const quality = ExportQuality.HIGH;
  const resolution = QUALITY_RESOLUTIONS[quality];

  return {
    format: ExportFormat.WEBM,
    quality,
    filename: getDefaultFilename(),
    width: resolution.width,
    height: resolution.height,
  };
};

// Default progress factory
const getDefaultProgress = (): ExportProgress => ({
  isExporting: false,
  progress: 0,
  currentFrame: 0,
  totalFrames: 0,
  estimatedTimeRemaining: 0,
  status: "",
});

export const useExportStore = create<ExportStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      isDialogOpen: false,
      panelView: 'properties',
      settings: getDefaultSettings(),
      progress: getDefaultProgress(),
      error: null,
      exportHistory: [],

      // Actions
      setDialogOpen: (open) => {
        set({ isDialogOpen: open });
        // Reset error when opening dialog
        if (open) {
          set({ error: null });
        }
      },
      setPanelView: (view) => set({ panelView: view }),

      updateSettings: (newSettings) => {
        set((state) => {
          // If quality changed, update resolution
          if (
            newSettings.quality &&
            newSettings.quality !== state.settings.quality
          ) {
            const resolution = QUALITY_RESOLUTIONS[newSettings.quality];
            return {
              settings: {
                ...state.settings,
                ...newSettings,
                width: resolution.width,
                height: resolution.height,
              },
            };
          }

          return {
            settings: { ...state.settings, ...newSettings },
          };
        });
      },

      updateProgress: (newProgress) => {
        set((state) => ({
          progress: { ...state.progress, ...newProgress },
        }));
      },

      setError: (error) => set({ error }),

      resetExport: () => {
        set({
          settings: getDefaultSettings(),
          progress: getDefaultProgress(),
          error: null,
          isDialogOpen: false,
        });
      },

      // History actions
      addToHistory: (entry) => {
        const historyEntry: ExportHistoryEntry = {
          ...entry,
          id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        };

        set((state) => ({
          exportHistory: [
            historyEntry,
            ...state.exportHistory.slice(0, 49), // Keep last 50 entries
          ],
        }));
      },

      clearHistory: () => set({ exportHistory: [] }),

      getRecentExports: (limit = 10) => {
        const { exportHistory } = get();
        return exportHistory.slice(0, limit);
      },

      replayExport: (historyId) => {
        const { exportHistory } = get();
        const historyEntry = exportHistory.find(
          (entry) => entry.id === historyId
        );

        if (historyEntry) {
          // Apply the settings from history
          set({
            settings: {
              ...historyEntry.settings,
              filename: getDefaultFilename(), // Generate new filename
            },
          });

          // Open dialog for re-export
          set({ isDialogOpen: true });
        }
      },
    }),
    {
      name: "export-store", // DevTools name
    }
  )
);
