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
import { StickerElement } from "./StickerElement";
import { StickerOverlayAutoSave } from "./AutoSave";
import { useProjectStore } from "@/stores/project-store";
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
  } = useStickersOverlayStore();

  const { mediaItems } = useMediaStore();
  const { activeProject } = useProjectStore();

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
      console.log("[StickerCanvas] 🎯 DROP DETECTED: Adding sticker from drag-and-drop", mediaItem);
      
      // Only allow images and videos as stickers
      if (mediaItem.type === "image" || mediaItem.type === "video") {
        const { addOverlaySticker } = useStickersOverlayStore.getState();
        
        // Calculate drop position as percentage
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          
          addOverlaySticker(mediaItem.id, {
            position: { x: Math.min(Math.max(x, 0), 100), y: Math.min(Math.max(y, 0), 100) }
          });
          
          console.log("[StickerCanvas] ✅ DRAG-DROP FIX: Added sticker at position", { x, y });
        } else {
          // Fallback to center position
          addOverlaySticker(mediaItem.id);
          console.log("[StickerCanvas] ✅ DRAG-DROP FIX: Added sticker at center (fallback)");
        }
      }
    } catch (error) {
      console.error("[StickerCanvas] ❌ DROP ERROR:", error);
    }
  };

  // Manual save for testing
  const handleManualSave = async () => {
    if (!activeProject?.id) return;
    console.log("[StickerCanvas] 🔧 MANUAL SAVE: Triggered for testing");
    await saveToProject(activeProject.id);
  };

  // Clean up stickers with missing media items when media loads
  useEffect(() => {
    if (mediaItems.length > 0 && overlayStickers.size > 0) {
      const mediaIds = mediaItems.map(item => item.id);
      cleanupInvalidStickers(mediaIds);
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

  // Convert Map to sorted array for rendering
  const sortedStickers = Array.from(overlayStickers.values()).sort(
    (a, b) => a.zIndex - b.zIndex
  );
  
  // Debug logging
  console.log("[StickerCanvas] 📊 RENDERING STATUS:", {
    stickersCount: overlayStickers.size,
    sortedStickers: sortedStickers.map(s => ({
      id: s.id,
      size: s.size, // Show actual size to verify it's 8% not 20%
      position: s.position
    })),
    mediaItemsCount: mediaItems.length,
    disabled
  });

  return (
    <>
      {/* Auto-save component */}
      <StickerOverlayAutoSave />

      <div
        ref={canvasRef}
        className={cn(
          "absolute inset-0 z-50 pointer-events-auto",
          className
        )}
        onClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        data-testid="sticker-canvas"
        style={{
          isolation: "isolate", // Create new stacking context
        }}
      >
        {/* Render stickers using StickerElement */}
        {sortedStickers.map((sticker) => {
          const mediaItem = mediaItems.find(
            (item) => item.id === sticker.mediaItemId
          );

          // Skip if media item not found
          if (!mediaItem) {
            console.warn(`[StickerCanvas] ⚠️ MEDIA MISSING: Media item not found for sticker ${sticker.id}, mediaItemId: ${sticker.mediaItemId}. Available media: ${mediaItems.length}`);
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
        {process.env.NODE_ENV === "development" && (
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
