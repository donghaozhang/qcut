import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { 
  ExportSettings, 
  ExportProgress, 
  ExportFormat, 
  ExportQuality,
  getDefaultFilename,
  QUALITY_RESOLUTIONS
} from "@/types/export";

interface ExportStore {
  // Dialog state
  isDialogOpen: boolean;
  
  // Export settings
  settings: ExportSettings;
  
  // Export progress
  progress: ExportProgress;
  
  // Error state
  error: string | null;
  
  // Actions
  setDialogOpen: (open: boolean) => void;
  updateSettings: (settings: Partial<ExportSettings>) => void;
  updateProgress: (progress: Partial<ExportProgress>) => void;
  setError: (error: string | null) => void;
  resetExport: () => void;
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
      settings: getDefaultSettings(),
      progress: getDefaultProgress(),
      error: null,
      
      // Actions
      setDialogOpen: (open) => {
        set({ isDialogOpen: open });
        // Reset error when opening dialog
        if (open) {
          set({ error: null });
        }
      },
      
      updateSettings: (newSettings) => {
        set((state) => {
          // If quality changed, update resolution
          if (newSettings.quality && newSettings.quality !== state.settings.quality) {
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
    }),
    {
      name: "export-store", // DevTools name
    }
  )
);