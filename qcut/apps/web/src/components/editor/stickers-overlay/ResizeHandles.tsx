/**
 * ResizeHandles Component
 *
 * Provides visual resize handles for selected stickers with
 * corner and edge dragging support.
 */

import React, { memo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { debugLog } from "@/lib/debug-config";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { OverlaySticker } from "@/types/sticker-overlay";

interface ResizeHandlesProps {
  stickerId: string;
  isVisible: boolean;
  sticker: OverlaySticker;
  elementRef: React.RefObject<HTMLDivElement>;
}

type ResizeHandle = "tl" | "tr" | "bl" | "br" | "t" | "r" | "b" | "l";

/**
 * Resize handles for sticker elements
 */
export const ResizeHandles = memo<ResizeHandlesProps>(
  ({ stickerId, isVisible, sticker, elementRef }) => {
    const { updateOverlaySticker, setIsResizing } = useStickersOverlayStore();
    const resizeState = useRef({
      isResizing: false,
      handle: null as ResizeHandle | null,
      startX: 0,
      startY: 0,
      startWidth: 0,
      startHeight: 0,
      startLeft: 0,
      startTop: 0,
      aspectRatio: 1,
    });

    /**
     * Calculate new size based on resize handle and mouse position
     */
    const calculateNewSize = useCallback(
      (
        handle: ResizeHandle,
        deltaX: number,
        deltaY: number,
        maintainAspectRatio: boolean
      ) => {
        const state = resizeState.current;
        let newWidth = state.startWidth;
        let newHeight = state.startHeight;
        let newX = sticker.position.x;
        let newY = sticker.position.y;

        // Calculate percentage changes
        const deltaXPercent = (deltaX / window.innerWidth) * 100;
        const deltaYPercent = (deltaY / window.innerHeight) * 100;

        switch (handle) {
          case "tl": // Top-left
            newWidth = state.startWidth - deltaXPercent * 2;
            newHeight = state.startHeight - deltaYPercent * 2;
            newX = state.startLeft + deltaXPercent;
            newY = state.startTop + deltaYPercent;
            break;
          case "tr": // Top-right
            newWidth = state.startWidth + deltaXPercent * 2;
            newHeight = state.startHeight - deltaYPercent * 2;
            newY = state.startTop + deltaYPercent;
            break;
          case "bl": // Bottom-left
            newWidth = state.startWidth - deltaXPercent * 2;
            newHeight = state.startHeight + deltaYPercent * 2;
            newX = state.startLeft + deltaXPercent;
            break;
          case "br": // Bottom-right
            newWidth = state.startWidth + deltaXPercent * 2;
            newHeight = state.startHeight + deltaYPercent * 2;
            break;
          case "t": // Top
            newHeight = state.startHeight - deltaYPercent * 2;
            newY = state.startTop + deltaYPercent;
            break;
          case "b": // Bottom
            newHeight = state.startHeight + deltaYPercent * 2;
            break;
          case "l": // Left
            newWidth = state.startWidth - deltaXPercent * 2;
            newX = state.startLeft + deltaXPercent;
            break;
          case "r": // Right
            newWidth = state.startWidth + deltaXPercent * 2;
            break;
        }

        // Maintain aspect ratio if needed
        if (
          maintainAspectRatio &&
          (handle === "tl" ||
            handle === "tr" ||
            handle === "bl" ||
            handle === "br")
        ) {
          const ratio = state.aspectRatio;
          if (Math.abs(deltaXPercent) > Math.abs(deltaYPercent)) {
            const heightDiff = newWidth / ratio - newHeight;
            newHeight = newWidth / ratio;
            // Adjust position for top handles
            if (handle === "tl" || handle === "tr") {
              newY = state.startTop - (heightDiff / 2);
            }
          } else {
            const widthDiff = newHeight * ratio - newWidth;
            newWidth = newHeight * ratio;
            // Adjust position for left handles
            if (handle === "tl" || handle === "bl") {
              newX = state.startLeft - (widthDiff / 2);
            }
          }
        }

        // Apply minimum and maximum constraints
        newWidth = Math.max(5, Math.min(100, newWidth));
        newHeight = Math.max(5, Math.min(100, newHeight));
        newX = Math.max(0, Math.min(100, newX));
        newY = Math.max(0, Math.min(100, newY));

        return { width: newWidth, height: newHeight, x: newX, y: newY };
      },
      [sticker.position.x, sticker.position.y]
    );

    /**
     * Get cursor style for handle
     */
    const getCursorForHandle = useCallback((handle: ResizeHandle): string => {
      const cursors: Record<ResizeHandle, string> = {
        tl: "nw-resize",
        tr: "ne-resize",
        bl: "sw-resize",
        br: "se-resize",
        t: "n-resize",
        b: "s-resize",
        l: "w-resize",
        r: "e-resize",
      };
      return cursors[handle];
    }, []);

    /**
     * Handle resize start
     */
    const handleResizeStart = useCallback(
      (e: React.MouseEvent, handle: ResizeHandle) => {
        debugLog(`[ResizeHandles] Starting resize with handle: ${handle}`);
        e.stopPropagation();
        e.preventDefault();

        resizeState.current = {
          isResizing: true,
          handle,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: sticker.size.width,
          startHeight: sticker.size.height,
          startLeft: sticker.position.x,
          startTop: sticker.position.y,
          aspectRatio: sticker.size.width / sticker.size.height,
        };

        setIsResizing(true);
        document.body.style.cursor = getCursorForHandle(handle);
        document.body.style.userSelect = "none";

        const handleMouseMove = (e: MouseEvent) => {
          if (!resizeState.current.isResizing) return;

          const deltaX = e.clientX - resizeState.current.startX;
          const deltaY = e.clientY - resizeState.current.startY;

          const newSize = calculateNewSize(
            resizeState.current.handle!,
            deltaX,
            deltaY,
            e.shiftKey || sticker.maintainAspectRatio
          );

          requestAnimationFrame(() => {
            try {
              updateOverlaySticker(stickerId, {
                size: { width: newSize.width, height: newSize.height },
                position: { x: newSize.x, y: newSize.y },
              });
            } catch (error) {
              debugLog(`[ResizeHandles] Error updating sticker: ${error}`);
              // Optionally trigger cleanup
              handleMouseUp();
            }
          });
        };

        const handleMouseUp = () => {
          debugLog(
            `[ResizeHandles] Finished resizing handle ${resizeState.current.handle}`
          );
          resizeState.current.isResizing = false;
          setIsResizing(false);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
      },
      [
        stickerId,
        sticker,
        setIsResizing,
        updateOverlaySticker,
        calculateNewSize,
        getCursorForHandle,
      ]
    );

    if (!isVisible) return null;

    const handleClass =
      "absolute w-3 h-3 bg-white border-2 border-primary rounded-full z-[10000] pointer-events-auto hover:scale-110 transition-transform";
    const edgeHandleClass =
      "absolute bg-white border-2 border-primary z-[10000] pointer-events-auto hover:scale-105 transition-transform";

    return (
      <>
        {/* Corner handles */}
        <div
          className={cn(handleClass, "-top-1.5 -left-1.5 cursor-nw-resize")}
          onMouseDown={(e) => handleResizeStart(e, "tl")}
          title="Resize top-left"
        />
        <div
          className={cn(handleClass, "-top-1.5 -right-1.5 cursor-ne-resize")}
          onMouseDown={(e) => handleResizeStart(e, "tr")}
          title="Resize top-right"
        />
        <div
          className={cn(handleClass, "-bottom-1.5 -left-1.5 cursor-sw-resize")}
          onMouseDown={(e) => handleResizeStart(e, "bl")}
          title="Resize bottom-left"
        />
        <div
          className={cn(handleClass, "-bottom-1.5 -right-1.5 cursor-se-resize")}
          onMouseDown={(e) => handleResizeStart(e, "br")}
          title="Resize bottom-right (hold Shift for aspect ratio)"
        />

        {/* Edge handles (optional, can be enabled for more precise control) */}
        {sticker.size.width > 15 && sticker.size.height > 15 && (
          <>
            <div
              className={cn(
                edgeHandleClass,
                "top-1/2 -left-1 w-2 h-6 -translate-y-1/2 cursor-w-resize"
              )}
              onMouseDown={(e) => handleResizeStart(e, "l")}
              title="Resize left"
            />
            <div
              className={cn(
                edgeHandleClass,
                "top-1/2 -right-1 w-2 h-6 -translate-y-1/2 cursor-e-resize"
              )}
              onMouseDown={(e) => handleResizeStart(e, "r")}
              title="Resize right"
            />
            <div
              className={cn(
                edgeHandleClass,
                "-top-1 left-1/2 w-6 h-2 -translate-x-1/2 cursor-n-resize"
              )}
              onMouseDown={(e) => handleResizeStart(e, "t")}
              title="Resize top"
            />
            <div
              className={cn(
                edgeHandleClass,
                "-bottom-1 left-1/2 w-6 h-2 -translate-x-1/2 cursor-s-resize"
              )}
              onMouseDown={(e) => handleResizeStart(e, "b")}
              title="Resize bottom"
            />
          </>
        )}
      </>
    );
  }
);

ResizeHandles.displayName = "ResizeHandles";
