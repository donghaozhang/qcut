/**
 * StickerCanvas Component
 * 
 * Main overlay canvas that renders all stickers on top of the video preview.
 * Uses absolute positioning to avoid affecting the video/timeline layout.
 */

import React, { useRef, useEffect, memo } from 'react';
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';
import { useMediaStore } from '@/stores/media-store';
import { cn } from '@/lib/utils';
import { StickerElement } from './StickerElement';


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
    saveToProject
  } = useStickersOverlayStore();
  
  const { mediaItems } = useMediaStore();

  // Load stickers when component mounts
  useEffect(() => {
    // Get project ID from URL or store
    const projectId = new URLSearchParams(window.location.search).get('projectId');
    if (projectId) {
      loadFromProject(projectId);
    }
  }, [loadFromProject]);

  // Auto-save on changes (debounced in store)
  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get('projectId');
    if (projectId && overlayStickers.size > 0) {
      const saveTimeout = setTimeout(() => {
        saveToProject(projectId);
      }, 1000);
      return () => clearTimeout(saveTimeout);
    }
  }, [overlayStickers, saveToProject]);

  // Handle clicking on canvas (deselect)
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      selectSticker(null);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedStickerId || disabled) return;

      // Delete key removes selected sticker
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { removeOverlaySticker } = useStickersOverlayStore.getState();
        removeOverlaySticker(selectedStickerId);
      }

      // Escape deselects
      if (e.key === 'Escape') {
        selectSticker(null);
      }

      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const { undo } = useStickersOverlayStore.getState();
        undo();
      }

      // Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        const { redo } = useStickersOverlayStore.getState();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStickerId, disabled, selectSticker]);

  // Don't render if disabled
  if (disabled) return null;

  // Convert Map to sorted array for rendering
  const sortedStickers = Array.from(overlayStickers.values())
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div 
      ref={canvasRef}
      className={cn(
        "absolute inset-0 z-10",
        overlayStickers.size === 0 ? "pointer-events-none" : "pointer-events-auto",
        className
      )}
      onClick={handleCanvasClick}
      data-testid="sticker-canvas"
      style={{ 
        isolation: 'isolate' // Create new stacking context
      }}
    >
      {/* Render stickers using StickerElement */}
      {sortedStickers.map((sticker) => {
        const mediaItem = mediaItems.find(item => item.id === sticker.mediaItemId);
        
        // Skip if media item not found
        if (!mediaItem) {
          console.warn(`Media item not found for sticker: ${sticker.id}`);
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
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded pointer-events-none">
          Stickers: {overlayStickers.size}
        </div>
      )}
    </div>
  );
});

StickerCanvas.displayName = 'StickerCanvas';

/**
 * Export a version that can be used in different contexts
 */
export const StickerOverlay = StickerCanvas;