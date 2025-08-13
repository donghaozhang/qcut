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

/**
 * Auto-save component that monitors overlay changes and saves to storage
 */
export const StickerOverlayAutoSave = () => {
  const { overlayStickers, saveToProject, loadFromProject } =
    useStickersOverlayStore();
  const { activeProject } = useProjectStore();
  const hasLoadedRef = useRef(false);
  const lastSaveRef = useRef<string>("");

  // Load stickers on mount or project change
  useEffect(() => {
    if (!activeProject?.id) return;

    // Only load once per project
    if (!hasLoadedRef.current) {
      loadFromProject(activeProject.id).then(() => {
        hasLoadedRef.current = true;
        console.log(
          `[AutoSave] Loaded stickers for project: ${activeProject.id}`
        );
      });
    }

    // Reset on project change
    return () => {
      hasLoadedRef.current = false;
    };
  }, [activeProject?.id, loadFromProject]);

  // Create a stable string representation of stickers for comparison
  const stickersString = JSON.stringify(
    Array.from(overlayStickers.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    )
  );

  // Debounce the stickers string to avoid too frequent saves
  const debouncedStickersString = useDebounce(stickersString, 1000);

  // Save when debounced value changes
  useEffect(() => {
    if (!activeProject?.id || !hasLoadedRef.current) return;

    // Skip if nothing changed
    if (debouncedStickersString === lastSaveRef.current) return;

    // Skip initial empty state
    if (overlayStickers.size === 0 && !lastSaveRef.current) {
      lastSaveRef.current = debouncedStickersString;
      return;
    }

    // Save to storage
    saveToProject(activeProject.id).then(() => {
      lastSaveRef.current = debouncedStickersString;
      console.log(
        `[AutoSave] Saved ${overlayStickers.size} stickers for project: ${activeProject.id}`
      );
    });
  }, [
    debouncedStickersString,
    activeProject?.id,
    overlayStickers.size,
    saveToProject,
  ]);

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
