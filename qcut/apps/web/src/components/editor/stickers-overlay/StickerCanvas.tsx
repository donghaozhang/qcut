/**
 * StickerCanvas Component
 *
 * Main overlay canvas that renders all stickers on top of the video preview.
 * Uses absolute positioning to avoid affecting the video/timeline layout.
 */

import React, { useRef, useEffect, memo } from "react";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useMediaStore } from "@/stores/media-store";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug-config";
import { StickerElement } from "./StickerElement";
import { StickerOverlayAutoSave } from "./AutoSave";
import { useProjectStore } from "@/stores/project-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { Button } from "@/components/ui/button";

/**
 * Main canvas component that manages all overlay stickers
 */
export const StickerCanvas: React.FC<{
  className?: string;
  disabled?: boolean;
}> = memo(({ className, disabled = false }) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Store subscriptions
  const {
    overlayStickers,
    selectedStickerId,
    selectSticker,
    loadFromProject,
    saveToProject,
    cleanupInvalidStickers,
    getVisibleStickersAtTime,
  } = useStickersOverlayStore();

  const { mediaItems } = useMediaStore();
  const { activeProject } = useProjectStore();
  const { currentTime } = usePlaybackStore();

  // Handle clicking on canvas (deselect)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      selectSticker(null);
    }
  };

  // Handle drag and drop from media panel
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    const mediaItemData = e.dataTransfer.getData("application/x-media-item");
    if (!mediaItemData) return;

    try {
      const mediaItem = JSON.parse(mediaItemData);
      debugLog(
        "[StickerCanvas] 🎯 DROP DETECTED: Adding sticker from drag-and-drop",
        mediaItem
      );

      // Only allow images and videos as stickers
      if (mediaItem.type === "image" || mediaItem.type === "video") {
        const { addOverlaySticker } = useStickersOverlayStore.getState();

        // Calculate drop position as percentage
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;

          addOverlaySticker(mediaItem.id, {
            position: {
              x: Math.min(Math.max(x, 0), 100),
              y: Math.min(Math.max(y, 0), 100),
            },
            timing: { startTime: currentTime, endTime: currentTime + 5 }, // 5 second default duration
          });

          debugLog(
            "[StickerCanvas] ✅ DRAG-DROP FIX: Added sticker at position",
            { x, y }
          );
        } else {
          // Fallback to center position
          addOverlaySticker(mediaItem.id, {
            timing: { startTime: currentTime, endTime: currentTime + 5 }, // 5 second default duration
          });
          debugLog(
            "[StickerCanvas] ✅ DRAG-DROP FIX: Added sticker at center (fallback)"
          );
        }
      }
    } catch (error) {
      debugLog("[StickerCanvas] ❌ DROP ERROR:", error);
    }
  };

  // Manual save for testing
  const handleManualSave = async () => {
    if (!activeProject?.id) return;
    debugLog("[StickerCanvas] Manual save triggered");
    await saveToProject(activeProject.id);
  };

  // Clean up stickers with missing media items when media loads
  // Add a delay to avoid race conditions during project loading
  useEffect(() => {
    if (mediaItems.length > 0 && overlayStickers.size > 0) {
      const timeoutId = setTimeout(() => {
        const mediaIds = mediaItems.map((item) => item.id);
        debugLog(
          `[StickerCanvas] Cleanup check - Media count: ${mediaItems.length}, Sticker count: ${overlayStickers.size}`
        );
        debugLog("[StickerCanvas] Cleanup check - Media IDs:", mediaIds);
        debugLog(
          "[StickerCanvas] Cleanup check - Sticker media IDs:",
          Array.from(overlayStickers.values()).map((s) => s.mediaItemId)
        );

        // Only cleanup if we're confident media has fully loaded
        // This helps prevent premature cleanup during initial load
        if (mediaItems.length > 0) {
          cleanupInvalidStickers(mediaIds);
        } else {
          debugLog(
            "[StickerCanvas] Skipping cleanup - no media items loaded yet"
          );
        }
      }, 2000); // Increased to 2 seconds to ensure media is fully loaded

      return () => clearTimeout(timeoutId);
    }
  }, [mediaItems, overlayStickers.size, cleanupInvalidStickers]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedStickerId || disabled) return;

      // Delete key removes selected sticker
      if (e.key === "Delete" || e.key === "Backspace") {
        const { removeOverlaySticker } = useStickersOverlayStore.getState();
        removeOverlaySticker(selectedStickerId);
      }

      // Escape deselects
      if (e.key === "Escape") {
        selectSticker(null);
      }

      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const { undo } = useStickersOverlayStore.getState();
        undo();
      }

      // Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const { redo } = useStickersOverlayStore.getState();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStickerId, disabled, selectSticker]);

  // Don't render if disabled
  if (disabled) return null;

  // Get only visible stickers at current time
  const visibleStickers = getVisibleStickersAtTime(currentTime);

  return (
    <>
      {/* Auto-save component */}
      <StickerOverlayAutoSave />

      <div
        ref={canvasRef}
        className={cn("absolute inset-0 z-50 pointer-events-auto", className)}
        onClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        data-testid="sticker-canvas"
        style={{
          isolation: "isolate", // Create new stacking context
        }}
      >
        {/* Render stickers using StickerElement */}
        {visibleStickers.map((sticker) => {
          const mediaItem = mediaItems.find(
            (item) => item.id === sticker.mediaItemId
          );

          // Show placeholder if media item not found (it might still be loading)
          if (!mediaItem) {
            debugLog(
              `[StickerCanvas] ⚠️ MEDIA MISSING: Media item not found for sticker ${sticker.id}, mediaItemId: ${sticker.mediaItemId}. Available media: ${mediaItems.length}`
            );
            // Don't render anything for now, but keep the sticker in state
            // It might reconnect when media loads
            return null;
          }

          return (
            <StickerElement
              key={sticker.id}
              sticker={sticker}
              mediaItem={mediaItem}
              canvasRef={canvasRef}
            />
          );
        })}

        {/* Show placeholder when empty */}
        {overlayStickers.size === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-muted-foreground text-sm opacity-0">
              {/* Hidden placeholder for layout */}
            </div>
          </div>
        )}

        {/* Debug info */}
        {import.meta.env.DEV && (
          <div className="absolute top-2 right-2 flex gap-2 pointer-events-none">
            <div className="text-xs bg-black/50 text-white px-2 py-1 rounded">
              Stickers: {overlayStickers.size}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleManualSave}
              className="pointer-events-auto text-xs h-6"
            >
              Save Test
            </Button>
          </div>
        )}
      </div>
    </>
  );
});

StickerCanvas.displayName = "StickerCanvas";

/**
 * Export a version that can be used in different contexts
 */
export const StickerOverlay = StickerCanvas;
