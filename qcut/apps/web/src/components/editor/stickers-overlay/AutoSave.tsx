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
  const { activeProject, isLoading } = useProjectStore();
  const hasLoadedRef = useRef(false);
  const lastSaveRef = useRef<string>("");
  const lastProjectIdRef = useRef<string | null>(null);

  // Load stickers on mount or project change
  useEffect(() => {
    console.log(`[AutoSave] 🔍 EFFECT TRIGGERED:`, {
      activeProjectId: activeProject?.id,
      hasLoaded: hasLoadedRef.current,
      lastProjectId: lastProjectIdRef.current,
      currentStickersCount: overlayStickers.size,
      isProjectLoading: isLoading,
    });

    if (!activeProject?.id) {
      console.log(`[AutoSave] ⚠️ NO ACTIVE PROJECT - skipping load`);
      return;
    }

    // Wait for project to finish loading first
    if (isLoading) {
      console.log(
        `[AutoSave] ⏳ PROJECT STILL LOADING - waiting for completion`
      );
      return;
    }

    // Reset loading flag if project changed
    if (lastProjectIdRef.current !== activeProject.id) {
      console.log(
        `[AutoSave] 🔄 PROJECT CHANGED: ${lastProjectIdRef.current} → ${activeProject.id}`
      );
      hasLoadedRef.current = false;
      lastProjectIdRef.current = activeProject.id;
    }

    // Only load once per project
    if (!hasLoadedRef.current) {
      console.log(
        `[AutoSave] 🚀 STARTING LOAD for project: ${activeProject.id}`
      );
      loadFromProject(activeProject.id)
        .then(() => {
          hasLoadedRef.current = true;
          console.log(
            `[AutoSave] ✅ PERSISTENCE FIX: Loaded ${overlayStickers.size} stickers for project: ${activeProject.id}`
          );
        })
        .catch((error) => {
          console.error(`[AutoSave] ❌ LOAD ERROR:`, error);
        });
    } else {
      console.log(
        `[AutoSave] ⏭️ ALREADY LOADED - skipping for project: ${activeProject.id}`
      );
    }

    // Note: Removed problematic cleanup that was resetting hasLoadedRef on every render
    // Now we only reset when the project actually changes
  }, [activeProject?.id, loadFromProject, overlayStickers.size, isLoading]);

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
    console.log(`[AutoSave] 💾 SAVE EFFECT TRIGGERED:`, {
      activeProjectId: activeProject?.id,
      hasLoaded: hasLoadedRef.current,
      stickersCount: overlayStickers.size,
      debouncedStringChanged: debouncedStickersString !== lastSaveRef.current,
      lastSaveString: lastSaveRef.current.substring(0, 50) + "...",
      currentString: debouncedStickersString.substring(0, 50) + "...",
      isProjectLoading: isLoading,
    });

    if (!activeProject?.id || !hasLoadedRef.current || isLoading) {
      console.log(
        `[AutoSave] ⏭️ SAVE SKIPPED: no project (${!activeProject?.id}) or not loaded (${!hasLoadedRef.current}) or loading (${isLoading})`
      );
      return;
    }

    // Skip if nothing changed
    if (debouncedStickersString === lastSaveRef.current) {
      console.log(`[AutoSave] ⏭️ SAVE SKIPPED: no changes detected`);
      return;
    }

    // Skip initial empty state
    if (overlayStickers.size === 0 && !lastSaveRef.current) {
      console.log(`[AutoSave] ⏭️ SAVE SKIPPED: initial empty state`);
      lastSaveRef.current = debouncedStickersString;
      return;
    }

    // Save to storage
    console.log(
      `[AutoSave] 🚀 STARTING SAVE: ${overlayStickers.size} stickers to project: ${activeProject.id}`
    );
    saveToProject(activeProject.id)
      .then(() => {
        lastSaveRef.current = debouncedStickersString;
        console.log(
          `[AutoSave] ✅ SAVE COMPLETE: ${overlayStickers.size} stickers for project: ${activeProject.id}`
        );
      })
      .catch((error) => {
        console.error(`[AutoSave] ❌ SAVE ERROR:`, error);
      });
  }, [
    debouncedStickersString,
    activeProject?.id,
    overlayStickers.size,
    saveToProject,
    isLoading,
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
