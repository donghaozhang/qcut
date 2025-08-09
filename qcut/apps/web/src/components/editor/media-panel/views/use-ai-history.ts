/**
 * AI History Management Hook
 *
 * Extracted from ai.tsx as part of safe refactoring process.
 * Manages generation history, localStorage persistence, and history panel state.
 *
 * @see ai-view-refactoring-guide.md for refactoring plan
 * @see ai-refactoring-subtasks.md for implementation tracking
 */

import { useState, useEffect, useCallback } from "react";
import { debugLogger } from "@/lib/debug-logger";
import { STORAGE_KEYS, ERROR_MESSAGES } from "./ai-constants";
import type {
  GeneratedVideo,
  AIHistoryState,
  UseAIHistoryProps,
} from "./ai-types";

/**
 * Custom hook for managing AI generation history
 * Handles localStorage persistence, history operations, and panel state
 */
export function useAIHistory(props: UseAIHistoryProps = {}) {
  // History state
  const [generationHistory, setGenerationHistory] = useState<GeneratedVideo[]>(
    []
  );
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState<boolean>(false);

  // Load generation history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem(STORAGE_KEYS.GENERATION_HISTORY);
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setGenerationHistory(parsedHistory);
        debugLogger.log("AIHistory", "HISTORY_LOADED", {
          count: parsedHistory.length,
        });
      } catch (error) {
        debugLogger.log("AIHistory", "PARSE_HISTORY_ERROR", {
          error: error instanceof Error ? error.message : "Unknown error",
          savedHistory,
        });
        console.error(ERROR_MESSAGES.HISTORY_LOAD_FAILED, error);
      }
    }
  }, []);

  // Save generation history to localStorage
  const saveGenerationHistory = useCallback((history: GeneratedVideo[]) => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.GENERATION_HISTORY,
        JSON.stringify(history)
      );
      debugLogger.log("AIHistory", "HISTORY_SAVED", {
        count: history.length,
      });
    } catch (error) {
      debugLogger.log("AIHistory", "SAVE_HISTORY_ERROR", {
        error: error instanceof Error ? error.message : "Unknown error",
        historyCount: history.length,
      });
      console.error(ERROR_MESSAGES.HISTORY_SAVE_FAILED, error);
    }
  }, []);

  // Add video to history
  const addToHistory = useCallback(
    (video: GeneratedVideo) => {
      const newHistory = [video, ...generationHistory.slice(0, 9)]; // Keep only last 10
      setGenerationHistory(newHistory);
      saveGenerationHistory(newHistory);

      debugLogger.log("AIHistory", "VIDEO_ADDED_TO_HISTORY", {
        jobId: video.jobId,
        model: video.model,
        historyCount: newHistory.length,
      });
    },
    [generationHistory, saveGenerationHistory]
  );

  // Remove video from history
  const removeFromHistory = useCallback(
    (jobId: string) => {
      const newHistory = generationHistory.filter(
        (video) => video.jobId !== jobId
      );
      setGenerationHistory(newHistory);
      saveGenerationHistory(newHistory);

      debugLogger.log("AIHistory", "VIDEO_REMOVED_FROM_HISTORY", {
        jobId,
        historyCount: newHistory.length,
      });
    },
    [generationHistory, saveGenerationHistory]
  );

  // Clear all history
  const clearHistory = useCallback(() => {
    setGenerationHistory([]);
    saveGenerationHistory([]);

    debugLogger.log("AIHistory", "HISTORY_CLEARED", {});
  }, [saveGenerationHistory]);

  // Get history statistics
  const getHistoryStats = useCallback(() => {
    return {
      totalVideos: generationHistory.length,
      modelBreakdown: generationHistory.reduce(
        (acc, video) => {
          acc[video.model] = (acc[video.model] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
      recentGeneration: generationHistory[0] || null,
      hasHistory: generationHistory.length > 0,
    };
  }, [generationHistory]);

  // Export the complete state for external use
  const historyState: AIHistoryState = {
    generationHistory,
    isHistoryPanelOpen,
  };

  return {
    // State
    generationHistory,
    isHistoryPanelOpen,

    // Actions
    setIsHistoryPanelOpen,
    addToHistory,
    removeFromHistory,
    saveGenerationHistory,
    clearHistory,

    // Computed values
    getHistoryStats,

    // Complete state object
    historyState,

    // Helper methods
    hasHistory: generationHistory.length > 0,
    historyCount: generationHistory.length,

    // Panel control
    openHistoryPanel: () => setIsHistoryPanelOpen(true),
    closeHistoryPanel: () => setIsHistoryPanelOpen(false),
    toggleHistoryPanel: () => setIsHistoryPanelOpen((prev) => !prev),
  };
}

export type UseAIHistoryReturn = ReturnType<typeof useAIHistory>;
