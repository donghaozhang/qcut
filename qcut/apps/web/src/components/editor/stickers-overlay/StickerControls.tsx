/**
 * StickerControls Component
 *
 * Provides control buttons for selected stickers including delete,
 * layer management, and other actions.
 */

import React, { memo } from "react";
import { X, ArrowUp, ArrowDown, Copy, RotateCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { cn } from "@/lib/utils";

interface StickerControlsProps {
  stickerId: string;
  isVisible: boolean;
  sticker: OverlaySticker;
}

/**
 * Control buttons and tools for selected stickers
 */
export const StickerControls = memo<StickerControlsProps>(
  ({ stickerId, isVisible, sticker }) => {
    const {
      removeOverlaySticker,
      updateOverlaySticker,
      bringToFront,
      sendToBack,
      bringForward,
      sendBackward,
      addOverlaySticker,
    } = useStickersOverlayStore();

    if (!isVisible) return null;

    /**
     * Handle delete sticker
     */
    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      removeOverlaySticker(stickerId);
    };

    /**
     * Handle duplicate sticker
     */
    const handleDuplicate = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Add a duplicate with slight offset, excluding id and metadata
      const { id, metadata, ...stickerWithoutId } = sticker;
      addOverlaySticker(sticker.mediaItemId, {
        ...stickerWithoutId,
        position: {
          x: Math.min(90, sticker.position.x + 5),
          y: Math.min(90, sticker.position.y + 5),
        },
      });
    };

    /**
     * Handle rotation
     */
    const handleRotate = (e: React.MouseEvent) => {
      e.stopPropagation();
      updateOverlaySticker(stickerId, {
        rotation: (sticker.rotation + 45) % 360,
      });
    };

    /**
     * Handle opacity change
     */
    const handleOpacityChange = (value: number[]) => {
      updateOverlaySticker(stickerId, {
        opacity: value[0] / 100,
      });
    };

    /**
     * Handle layer order changes
     */
    const handleBringToFront = (e: React.MouseEvent) => {
      e.stopPropagation();
      bringToFront(stickerId);
    };

    const handleSendToBack = (e: React.MouseEvent) => {
      e.stopPropagation();
      sendToBack(stickerId);
    };

    return (
      <TooltipProvider>
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 flex items-center gap-1 bg-background/95 backdrop-blur-sm border rounded-lg p-1 shadow-lg z-50">
          {/* Delete button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={handleDelete}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete sticker (Del)</TooltipContent>
          </Tooltip>

          {/* Duplicate button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={handleDuplicate}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate sticker</TooltipContent>
          </Tooltip>

          {/* Rotate button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={handleRotate}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rotate 45°</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border" />

          {/* Layer controls */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={handleBringToFront}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bring to front</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={handleSendToBack}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send to back</TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border" />

          {/* Opacity slider */}
          <div className="flex items-center gap-2 px-2">
            <Layers className="h-3 w-3 text-muted-foreground" />
            <Slider
              className="w-20"
              value={[sticker.opacity * 100]}
              onValueChange={handleOpacityChange}
              max={100}
              min={0}
              step={5}
            />
            <span className="text-xs text-muted-foreground w-8">
              {Math.round(sticker.opacity * 100)}%
            </span>
          </div>
        </div>
      </TooltipProvider>
    );
  }
);

StickerControls.displayName = "StickerControls";

/**
 * Simplified controls for mobile/touch devices
 */
export const SimpleStickerControls = memo<{
  stickerId: string;
  isVisible: boolean;
}>(({ stickerId, isVisible }) => {
  const { removeOverlaySticker } = useStickersOverlayStore();

  if (!isVisible) return null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeOverlaySticker(stickerId);
  };

  return (
    <div className="absolute -top-8 -right-2">
      <Button
        size="icon"
        variant="destructive"
        className="h-6 w-6 rounded-full shadow-lg"
        onClick={handleDelete}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
});

SimpleStickerControls.displayName = "SimpleStickerControls";
