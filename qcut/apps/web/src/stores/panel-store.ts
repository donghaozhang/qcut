import { create } from "zustand";
import { persist } from "zustand/middleware";

// DEBUG: Trace infinite loop on project click
const DEBUG_MODE = false;
let updateCounter = 0;
let lastUpdateTime = Date.now();
const updateHistory: string[] = [];

// Initialize tolerance fix
console.log('🔧 [TOLERANCE-FIX] Initialized with 0.1 threshold to prevent react-resizable-panels infinite loops');

const debugLog = (source: string, data?: any) => {
  if (!DEBUG_MODE) return;
  
  const now = Date.now();
  const timeDiff = now - lastUpdateTime;
  updateCounter++;
  
  const logEntry = `[${updateCounter}] ${source} +${timeDiff}ms`;
  updateHistory.push(logEntry);
  
  console.log(`🔍 [PanelStore] ${logEntry}`, data || '');
  
  // Detect rapid updates
  if (timeDiff < 10 && updateCounter > 5) {
    console.error('⚠️ RAPID UPDATES DETECTED!', {
      count: updateCounter,
      history: updateHistory.slice(-10),
      source
    });
  }
  
  // Reset counter after 1 second of inactivity
  if (timeDiff > 1000) {
    updateCounter = 0;
    updateHistory.length = 0;
  }
  
  lastUpdateTime = now;
};

// Circuit breaker for infinite loops
let emergencyStop = false;
const MAX_UPDATES_PER_SECOND = 20;
const updateTimes: number[] = [];

const checkCircuitBreaker = (source: string) => {
  if (emergencyStop) {
    console.error('🛑 [CIRCUIT-BREAKER] EMERGENCY STOP ACTIVE - Blocking update from', source);
    return true;
  }
  
  const now = Date.now();
  updateTimes.push(now);
  
  // Keep only updates from last second
  const oneSecondAgo = now - 1000;
  const recentUpdates = updateTimes.filter(t => t > oneSecondAgo);
  updateTimes.length = 0;
  updateTimes.push(...recentUpdates);
  
  if (recentUpdates.length > MAX_UPDATES_PER_SECOND) {
    emergencyStop = true;
    console.error('🛑 [CIRCUIT-BREAKER] TRIGGERED! Tolerance fix failed - emergency stop active', {
      source,
      updateCount: recentUpdates.length,
      resetting: 'in 2 seconds'
    });
    
    // Auto-reset after 2 seconds
    setTimeout(() => {
      emergencyStop = false;
      updateTimes.length = 0;
      console.warn('⚡ [CIRCUIT-BREAKER] Reset - tolerance fix should prevent further issues');
    }, 2000);
    
    return true;
  }
  
  return false;
};

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
        if (checkCircuitBreaker('setToolsPanel')) return;
        
        debugLog('setToolsPanel:START', { 
          incoming: size, 
          current: get().toolsPanel,
          diff: Math.abs(get().toolsPanel - size)
        });
        
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().toolsPanel;

        // Only update if the size actually changed (prevents infinite loops)
        // Increased tolerance to handle react-resizable-panels floating-point precision
        if (Math.abs(currentSize - roundedSize) > 0.1) {
          debugLog('setToolsPanel:UPDATE', { 
            from: currentSize, 
            to: roundedSize 
          });
          if (DEBUG_MODE) console.log(`✅ [TOLERANCE-FIX] setToolsPanel UPDATE allowed: ${currentSize} → ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)})`);
          set({ toolsPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        } else {
          debugLog('setToolsPanel:SKIP', 'Size unchanged');
          if (DEBUG_MODE) console.log(`🛡️ [TOLERANCE-FIX] setToolsPanel BLOCKED: ${currentSize} vs ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)} < 0.1)`);
        }
      },
      setPreviewPanel: (size) => {
        if (checkCircuitBreaker('setPreviewPanel')) return;
        
        debugLog('setPreviewPanel:START', { 
          incoming: size, 
          current: get().previewPanel,
          diff: Math.abs(get().previewPanel - size)
        });
        
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().previewPanel;

        // Only update if the size actually changed (prevents infinite loops)
        // Increased tolerance to handle react-resizable-panels floating-point precision
        if (Math.abs(currentSize - roundedSize) > 0.1) {
          debugLog('setPreviewPanel:UPDATE', { 
            from: currentSize, 
            to: roundedSize 
          });
          if (DEBUG_MODE) console.log(`✅ [TOLERANCE-FIX] setPreviewPanel UPDATE allowed: ${currentSize} → ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)})`);
          set({ previewPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        } else {
          debugLog('setPreviewPanel:SKIP', 'Size unchanged');
          if (DEBUG_MODE) console.log(`🛡️ [TOLERANCE-FIX] setPreviewPanel BLOCKED: ${currentSize} vs ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)} < 0.1)`);
        }
      },
      setPropertiesPanel: (size) => {
        if (checkCircuitBreaker('setPropertiesPanel')) return;
        
        debugLog('setPropertiesPanel:START', { 
          incoming: size, 
          current: get().propertiesPanel,
          diff: Math.abs(get().propertiesPanel - size)
        });
        
        // Round to 2 decimal places to reduce precision errors
        const roundedSize = Math.round(size * 100) / 100;
        const currentSize = get().propertiesPanel;

        // Only update if the size actually changed (prevents infinite loops)
        // Increased tolerance to handle react-resizable-panels floating-point precision
        if (Math.abs(currentSize - roundedSize) > 0.1) {
          debugLog('setPropertiesPanel:UPDATE', { 
            from: currentSize, 
            to: roundedSize 
          });
          if (DEBUG_MODE) console.log(`✅ [TOLERANCE-FIX] setPropertiesPanel UPDATE allowed: ${currentSize} → ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)})`);
          set({ propertiesPanel: roundedSize });
          debouncedNormalize(() => get().normalizeHorizontalPanels());
        } else {
          debugLog('setPropertiesPanel:SKIP', 'Size unchanged');
          if (DEBUG_MODE) console.log(`🛡️ [TOLERANCE-FIX] setPropertiesPanel BLOCKED: ${currentSize} vs ${roundedSize} (diff: ${Math.abs(currentSize - roundedSize)} < 0.1)`);
        }
      },
      setMainContent: (size) => set({ mainContent: size }),
      setTimeline: (size) => set({ timeline: size }),
      setAiPanelWidth: (size) => set({ aiPanelWidth: size }),

      // Normalize horizontal panels to ensure they add up to 100%
      normalizeHorizontalPanels: () => {
        debugLog('normalizeHorizontalPanels:START', {
          isNormalizing
        });
        
        const state = get();
        const totalRaw =
          state.toolsPanel + state.previewPanel + state.propertiesPanel;

        // Round the total to 2 decimals to avoid floating point drift like 99.9899999999
        const total = Math.round(totalRaw * 100) / 100;

        debugLog('normalizeHorizontalPanels:CHECK', {
          toolsPanel: state.toolsPanel,
          previewPanel: state.previewPanel,
          propertiesPanel: state.propertiesPanel,
          total
        });

        // Use a larger tolerance to avoid constant corrections from floating-point precision issues
        const tolerance = 0.1; // 0.1% tolerance

        if (Math.abs(total - 100) > tolerance) {
          debugLog('normalizeHorizontalPanels:NORMALIZE_NEEDED', {
            total,
            deviation: total - 100
          });
          // Suppress console warnings; normalize silently

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
