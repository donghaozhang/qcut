/**
 * AutoSave Component
 *
 * Handles automatic saving of sticker overlay state to storage
 * with debouncing to prevent excessive writes.
 */

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/project-store";
import { debugLog } from "@/lib/debug-config";

/**
 * Auto-save component that monitors overlay changes and saves to storage
 */
export const StickerOverlayAutoSave = () => {
  const { activeProject } = useProjectStore();
  const lastProjectIdRef = useRef<string | null>(null);

  // Project loading is now handled by the project store directly
  // This AutoSave component only handles saving, not loading
  useEffect(() => {
    // Reset tracking when project changes
    if (lastProjectIdRef.current !== activeProject?.id) {
      debugLog(
        `[AutoSave] 🔄 PROJECT CHANGED: ${lastProjectIdRef.current} → ${activeProject?.id}`
      );
      lastProjectIdRef.current = activeProject?.id || null;
    }
  }, [activeProject?.id]);

  // Auto-save is now disabled - stickers auto-save immediately when created/modified
  // This prevents conflicts with project loading and eliminates the race condition
  // where cleared stickers during project load would overwrite saved stickers
  useEffect(() => {
    debugLog(
      "[AutoSave] 💾 AUTO-SAVE DISABLED - immediate save on create/modify instead"
    );
  }, []);

  // No UI, just side effects
  return null;
};
