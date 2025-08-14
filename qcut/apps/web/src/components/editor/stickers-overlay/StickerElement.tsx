/**
 * StickerElement Component
 *
 * Individual draggable sticker element with selection and interaction support.
 */

import React, { memo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useStickerDrag } from "./hooks/useStickerDrag";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { ResizeHandles } from "./ResizeHandles";
import { StickerControls, SimpleStickerControls } from "./StickerControls";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media-store-types";

// Debug utility for conditional logging
const debugLog = (message: string, ...args: any[]) => {
  if (import.meta.env.DEV) {
    console.log(message, ...args);
  }
};

interface StickerElementProps {
  sticker: OverlaySticker;
  mediaItem: MediaItem;
  canvasRef: React.RefObject<HTMLDivElement>;
}

/**
 * Draggable sticker element with full interaction support
 */
export const StickerElement = memo<StickerElementProps>(
  ({ sticker, mediaItem, canvasRef }) => {
    const elementRef = useRef<HTMLDivElement>(null);

    // Store hooks
    const { selectedStickerId, selectSticker } = useStickersOverlayStore();
    const isSelected = selectedStickerId === sticker.id;

    // Drag functionality
    const {
      isDragging,
      handleMouseDown,
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
    } = useStickerDrag(sticker.id, elementRef, canvasRef);

    /**
     * Handle element click for selection
     */
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isDragging) {
        selectSticker(sticker.id);
      }
    };

    /**
     * Combined mouse down handler
     */
    const handleMouseDownWrapper = (e: React.MouseEvent) => {
      console.log(
        "[StickerElement] 🎯 MOUSE DOWN WRAPPER: Called for sticker",
        sticker.id
      );
      selectSticker(sticker.id);
      handleMouseDown(e);
    };

    /**
     * Render media content based on type
     */
    const renderMediaContent = () => {
      switch (mediaItem.type) {
        case "image":
          return (
            <img
              src={mediaItem.url}
              alt={mediaItem.name}
              className="w-full h-full object-contain select-none"
              draggable={false}
              style={{
                pointerEvents: "none",
                imageRendering: "crisp-edges", // Better quality for small images
              }}
            />
          );

        case "video":
          return (
            <video
              src={mediaItem.url}
              className="w-full h-full object-contain"
              autoPlay
              loop
              muted
              playsInline
              style={{
                pointerEvents: "none",
              }}
            />
          );

        default:
          return (
            <div className="w-full h-full flex items-center justify-center bg-muted/50 rounded">
              <span className="text-xs text-muted-foreground">
                {mediaItem.type}
              </span>
            </div>
          );
      }
    };

    return (
      <div
        ref={elementRef}
        className={cn(
          "absolute pointer-events-auto",
          "transition-shadow duration-200",
          isDragging ? "cursor-grabbing" : "cursor-grab",
          isSelected && "ring-2 ring-primary shadow-lg z-50",
          !isSelected && "hover:ring-1 hover:ring-primary/50"
        )}
        style={{
          left: `${sticker.position.x}%`,
          top: `${sticker.position.y}%`,
          width: `${sticker.size.width}%`,
          height: `${sticker.size.height}%`,
          transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
          opacity: sticker.opacity,
          zIndex: isSelected ? 9999 : sticker.zIndex,
          transformOrigin: "center",
          // Smooth transitions except during drag
          transition: isDragging ? "none" : "box-shadow 0.2s",
        }}
        onClick={handleClick}
        onMouseDown={handleMouseDownWrapper}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-sticker-id={sticker.id}
        role="button"
        tabIndex={0}
        aria-label={`Sticker: ${mediaItem.name}`}
        aria-selected={isSelected}
      >
        {/* Media content */}
        {renderMediaContent()}

        {/* Resize handles for selected sticker */}
        <ResizeHandles
          stickerId={sticker.id}
          isVisible={isSelected}
          sticker={sticker}
          elementRef={elementRef}
        />

        {/* Control buttons for selected sticker */}
        {isSelected && sticker.size.width > 20 ? (
          <StickerControls
            stickerId={sticker.id}
            isVisible={isSelected}
            sticker={sticker}
          />
        ) : (
          <SimpleStickerControls
            stickerId={sticker.id}
            isVisible={isSelected}
          />
        )}

        {/* Debug info in development */}
        {process.env.NODE_ENV === "development" && isSelected && (
          <div className="absolute -bottom-8 left-0 text-xs bg-black/75 text-white px-1 rounded whitespace-nowrap">
            {Math.round(sticker.position.x)}, {Math.round(sticker.position.y)} |{" "}
            {Math.round(sticker.size.width)}x{Math.round(sticker.size.height)}
          </div>
        )}
      </div>
    );
  }
);

StickerElement.displayName = "StickerElement";
