/**
 * AutoSave Component
 *
 * Handles automatic saving of sticker overlay state to storage
 * with debouncing to prevent excessive writes.
 */

import { useEffect, useRef } from "react";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useProjectStore } from "@/stores/project-store";
import { useDebounce } from "@/hooks/use-debounce";

// Debug utility for conditional logging
const debugLog = (message: string, ...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(message, ...args);
  }
};

/**
 * Auto-save component that monitors overlay changes and saves to storage
 */
export const StickerOverlayAutoSave = () => {
  const { overlayStickers, saveToProject, loadFromProject } =
    useStickersOverlayStore();
  const { activeProject, isLoading } = useProjectStore();
  const hasLoadedRef = useRef(false);
  const lastSaveRef = useRef<string>("");
  const lastProjectIdRef = useRef<string | null>(null);

  // Project loading is now handled by the project store directly
  // This AutoSave component only handles saving, not loading
  useEffect(() => {
    // Reset tracking when project changes
    if (lastProjectIdRef.current !== activeProject?.id) {
      debugLog(
        `[AutoSave] 🔄 PROJECT CHANGED: ${lastProjectIdRef.current} → ${activeProject?.id}`
      );
      hasLoadedRef.current = true; // Mark as loaded since project store handles loading
      lastProjectIdRef.current = activeProject?.id || null;
    }
  }, [activeProject?.id]);

  // Create a stable string representation of stickers for comparison
  const stickersString = JSON.stringify(
    Array.from(overlayStickers.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  );

  // Debounce the stickers string to avoid too frequent saves
  const debouncedStickersString = useDebounce(stickersString, 1000);

  // Auto-save is now disabled - stickers auto-save immediately when created/modified
  // This prevents conflicts with project loading and eliminates the race condition
  // where cleared stickers during project load would overwrite saved stickers
  useEffect(() => {
    debugLog(`[AutoSave] 💾 AUTO-SAVE DISABLED - immediate save on create/modify instead`);
  }, []);

  // No UI, just side effects
  return null;
};

/**
 * Hook version for components that need to know save status
 */
export const useStickerAutoSave = () => {
  const { overlayStickers, saveToProject } = useStickersOverlayStore();
  const { activeProject } = useProjectStore();
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const triggerSave = () => {
    if (!activeProject?.id) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      saveToProject(activeProject.id);
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return { triggerSave };
};
