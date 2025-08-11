import { create } from "zustand";
import { persist } from "zustand/middleware";
import { debugLog, debugError, isDebugEnabled } from "@/lib/debug-config";

// DEBUG: Trace infinite loop on project click
let updateCounter = 0;
let lastUpdateTime = Date.now();
const updateHistory: string[] = [];

// Trace configuration constants
const RAPID_UPDATE_WINDOW_MS = 10;
const RAPID_UPDATE_THRESHOLD = 5;
const INACTIVITY_RESET_MS = 1000;
const MAX_HISTORY_SIZE = 200;

/**
 * Trace panel-related updates when debug mode is enabled.
 * Adds an entry to update history and detects rapid update bursts.
 * @param source Short identifier for the caller.
 * @param data Optional payload to log with the trace line.
 */
const tracePanelUpdate = (source: string, data?: unknown) => {
  if (!isDebugEnabled()) return;

  const now = Date.now();
  const timeDiff = now - lastUpdateTime;

  // Reset counter after inactivity period
  if (timeDiff > INACTIVITY_RESET_MS) {
    updateCounter = 0;
    updateHistory.length = 0;
  }
  updateCounter++;

  const logEntry = `[${updateCounter}] ${source} +${timeDiff}ms`;
  updateHistory.push(logEntry);

  // Cap history to prevent unbounded growth
  if (updateHistory.length > MAX_HISTORY_SIZE) {
    updateHistory.splice(0, updateHistory.length - MAX_HISTORY_SIZE);
  }

  debugLog(`🔍 [PanelStore] ${logEntry}`, data ?? "");

  // Detect rapid updates
  if (
    timeDiff < RAPID_UPDATE_WINDOW_MS &&
    updateCounter > RAPID_UPDATE_THRESHOLD
  ) {
    debugError("⚠️ RAPID UPDATES DETECTED!", {
      count: updateCounter,
      history: updateHistory.slice(-10),
      source,
    });
  }

  // Reset handled above to ensure the first post-inactivity event is [1]
  lastUpdateTime = now;
};

// Circuit breaker for infinite loops
let emergencyStop = false;
const MAX_UPDATES_PER_SECOND = 20;
const SECOND_MS = 1000;
const CIRCUIT_BREAKER_RESET_MS = 2000;

// Size change tolerance for panel updates (in percent)
const SIZE_TOLERANCE = 0.1;

// Type guard for persisted panel state validation
type PersistedPanelState = Pick<
  PanelState,
  "toolsPanel" | "previewPanel" | "propertiesPanel"
>;

function isPersistedPanelState(value: unknown): value is PersistedPanelState {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.toolsPanel === "number" &&
    typeof v.previewPanel === "number" &&
    typeof v.propertiesPanel === "number"
  );
}
const updateTimes: number[] = [];

/**
 * Sliding-window circuit breaker to prevent runaway update loops.
 * Returns true when updates should be blocked.
 * @param source Identifier for the source attempting the update.
 * @returns true if updates should be blocked, false otherwise.
 */
const checkCircuitBreaker = (source: string) => {
  if (emergencyStop) {
    debugError(
      "🛑 [CIRCUIT-BREAKER] EMERGENCY STOP ACTIVE - Blocking update from",
      source
    );
    return true;
  }

  const now = Date.now();
  updateTimes.push(now);

  // Keep only updates from last second using sliding window
  const oneSecondAgo = now - SECOND_MS;
  // Drop timestamps older than 1 second
  while (updateTimes.length && updateTimes[0] <= oneSecondAgo) {
    updateTimes.shift();
  }

  if (updateTimes.length > MAX_UPDATES_PER_SECOND) {
    emergencyStop = true;
    debugError(
      "🛑 [CIRCUIT-BREAKER] TRIGGERED! Tolerance fix failed - emergency stop active",
      {
        source,
        updateCount: updateTimes.length,
        resetting: `in ${CIRCUIT_BREAKER_RESET_MS / SECOND_MS} seconds`,
      }
    );

    // Auto-reset after configured delay
    setTimeout(() => {
      emergencyStop = false;
      updateTimes.length = 0;
      debugLog(
        "⚡ [CIRCUIT-BREAKER] Reset - tolerance fix should prevent further issues"
      );
    }, CIRCUIT_BREAKER_RESET_MS);

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
let normalizationTimeout: ReturnType<typeof setTimeout> | null = null;
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
      normalizationTimeout = null;
    }
  }, 50); // 50ms debounce
};

// Consolidated panel size setter to reduce duplication
function setPanelSize<
  K extends "toolsPanel" | "previewPanel" | "propertiesPanel",
>(key: K, size: number, source: string) {
  if (checkCircuitBreaker(source)) return;
  if (!Number.isFinite(size)) {
    tracePanelUpdate(`${source}:INVALID`, { size });
    return;
  }

  const state = usePanelStore.getState();
  tracePanelUpdate(`${source}:START`, {
    incoming: size,
    current: state[key],
    diff: Math.abs(state[key] - size),
  });

  const rounded = Math.round(size * 100) / 100;
  const current = state[key];

  if (Math.abs(current - rounded) > SIZE_TOLERANCE) {
    tracePanelUpdate(`${source}:UPDATE`, {
      from: current,
      to: rounded,
      diff: Math.abs(current - rounded),
      action: "TOLERANCE-FIX-ALLOWED",
    });
    usePanelStore.setState({ [key]: rounded } as Pick<PanelState, K>);
    debouncedNormalize(() =>
      usePanelStore.getState().normalizeHorizontalPanels()
    );
  } else {
    tracePanelUpdate(`${source}:SKIP`, {
      current,
      attempted: rounded,
      diff: Math.abs(current - rounded),
      reason: "TOLERANCE-FIX-BLOCKED",
    });
  }
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      // Default sizes - optimized for responsiveness
      ...DEFAULT_PANEL_SIZES,

      // Actions
      setToolsPanel: (size) =>
        setPanelSize("toolsPanel", size, "setToolsPanel"),
      setPreviewPanel: (size) =>
        setPanelSize("previewPanel", size, "setPreviewPanel"),
      setPropertiesPanel: (size) =>
        setPanelSize("propertiesPanel", size, "setPropertiesPanel"),
      setMainContent: (size) => set({ mainContent: size }),
      setTimeline: (size) => set({ timeline: size }),
      setAiPanelWidth: (size) => set({ aiPanelWidth: size }),

      // Normalize horizontal panels to ensure they add up to 100%
      normalizeHorizontalPanels: () => {
        tracePanelUpdate("normalizeHorizontalPanels:START", {
          isNormalizing,
        });

        const state = get();
        const totalRaw =
          state.toolsPanel + state.previewPanel + state.propertiesPanel;

        // Round the total to 2 decimals to avoid floating point drift like 99.9899999999
        const total = Math.round(totalRaw * 100) / 100;

        tracePanelUpdate("normalizeHorizontalPanels:CHECK", {
          toolsPanel: state.toolsPanel,
          previewPanel: state.previewPanel,
          propertiesPanel: state.propertiesPanel,
          total,
        });

        // Use a larger tolerance to avoid constant corrections from floating-point precision issues
        if (Math.abs(total - 100) > SIZE_TOLERANCE) {
          tracePanelUpdate("normalizeHorizontalPanels:NORMALIZE_NEEDED", {
            total,
            deviation: total - 100,
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
      version: 7, // Increment this to force migration and reset
      onRehydrateStorage: () => (state) => {
        // Normalize panels after rehydration
        if (state) {
          const total =
            state.toolsPanel + state.previewPanel + state.propertiesPanel;
          if (Math.abs(total - 100) > SIZE_TOLERANCE) {
            // Immediately normalize if total is not 100%
            state.normalizeHorizontalPanels();
          }
        }
      },
      migrate: (persistedState: unknown, version: number) => {
        // Reset to defaults if coming from old version or if data is corrupted
        if (version < 7) {
          debugLog(
            `[PanelStore] Migrating from version ${version} to version 7`
          );
          return DEFAULT_PANEL_SIZES;
        }

        // Validate persisted state
        if (!isPersistedPanelState(persistedState)) {
          debugError(
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
        if (total < 50 || total > 150 || Number.isNaN(total)) {
          debugError(
            "[PanelStore] Corrupted panel sizes detected, resetting to defaults"
          );
          return DEFAULT_PANEL_SIZES;
        }

        if (Math.abs(total - 100) > SIZE_TOLERANCE) {
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
