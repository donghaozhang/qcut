/**
 * useStickerDrag Hook
 *
 * Handles drag functionality for overlay stickers with smooth movement
 * and boundary constraints.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { debugLog } from "@/lib/debug-config";

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

/**
 * Hook to handle sticker dragging with mouse events
 * @param stickerId - The ID of the sticker being dragged
 * @param elementRef - Reference to the sticker element (currently unused, reserved for future boundary calculations)
 * @param canvasRef - Reference to the canvas container for position calculations
 */
export const useStickerDrag = (
  stickerId: string,
  elementRef: React.RefObject<HTMLDivElement>,
  canvasRef: React.RefObject<HTMLDivElement>
) => {
  const { updateOverlaySticker, setIsDragging } = useStickersOverlayStore();
  const [isDragging, setIsDraggingLocal] = useState(false);
  const dragState = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // Get current sticker position
  const sticker = useStickersOverlayStore((state) =>
    state.overlayStickers.get(stickerId)
  );

  /**
   * Calculate position as percentage of canvas, accounting for sticker dimensions
   */
  const calculatePercentagePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 50, y: 50 };

      const canvasRect = canvasRef.current.getBoundingClientRect();
      const stickerRect = elementRef.current?.getBoundingClientRect();

      const x = ((clientX - canvasRect.left) / canvasRect.width) * 100;
      const y = ((clientY - canvasRect.top) / canvasRect.height) * 100;

      // Calculate sticker size as percentage of canvas
      const stickerWidthPct = stickerRect
        ? (stickerRect.width / canvasRect.width) * 100
        : 10; // fallback 10%
      const stickerHeightPct = stickerRect
        ? (stickerRect.height / canvasRect.height) * 100
        : 10; // fallback 10%

      // Constrain so sticker edges never exceed canvas bounds
      const clampedX = Math.max(
        stickerWidthPct / 2,
        Math.min(100 - stickerWidthPct / 2, x)
      );
      const clampedY = Math.max(
        stickerHeightPct / 2,
        Math.min(100 - stickerHeightPct / 2, y)
      );

      return {
        x: clampedX,
        y: clampedY,
      };
    },
    [canvasRef, elementRef]
  );

  /**
   * Handle mouse down - start dragging
   */
  const handleMouseDown = useCallback(
    (
      e:
        | ReactMouseEvent
        | {
            preventDefault: () => void;
            stopPropagation: () => void;
            clientX: number;
            clientY: number;
          }
    ) => {
      e.preventDefault();
      e.stopPropagation();

      if (!sticker) return;

      debugLog(
        "[StickerDrag] 🖱️ MOUSE DOWN: Starting drag for sticker",
        stickerId
      );

      dragState.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialX: sticker.position.x,
        initialY: sticker.position.y,
      };

      setIsDragging(true);
      setIsDraggingLocal(true);

      // Add cursor style
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    },
    [sticker, setIsDragging, stickerId]
  );

  /**
   * Handle mouse move during drag
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragState.current.isDragging || !canvasRef.current) return;

      const position = calculatePercentagePosition(e.clientX, e.clientY);

      // Update sticker position with smooth movement
      requestAnimationFrame(() => {
        updateOverlaySticker(stickerId, {
          position: {
            x: position.x,
            y: position.y,
          },
        });
      });
    },
    [stickerId, updateOverlaySticker, calculatePercentagePosition, canvasRef]
  );

  /**
   * Handle mouse up - stop dragging
   */
  const handleMouseUp = useCallback(() => {
    if (!dragState.current.isDragging) return;

    dragState.current.isDragging = false;
    setIsDragging(false);
    setIsDraggingLocal(false);

    // Reset cursor
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [setIsDragging]);

  // Stable refs for event handlers to prevent unnecessary re-renders
  const handleMouseMoveRef = useRef(handleMouseMove);
  const handleMouseUpRef = useRef(handleMouseUp);

  // Update refs when handlers change
  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
  });

  /**
   * Set up and clean up event listeners
   */
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) =>
      handleMouseMoveRef.current(e);
    const handleGlobalMouseUp = () => handleMouseUpRef.current();
    const handleGlobalMouseOut = (e: MouseEvent) => {
      // When leaving the window (relatedTarget === null), end drag to avoid stuck state
      const toElement = ('relatedTarget' in e ? e.relatedTarget : null) as Node | null;
      if (toElement === null) handleMouseUpRef.current();
    };

    // Touch equivalents
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // Reuse the same path as mouse move
      handleMouseMoveRef.current(
        new MouseEvent("mousemove", { clientX: t.clientX, clientY: t.clientY })
      );
      e.preventDefault();
    };
    const handleGlobalTouchEnd = () => handleMouseUpRef.current();
    const handleGlobalTouchCancel = () => handleMouseUpRef.current();

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mouseout", handleGlobalMouseOut);
    window.addEventListener("blur", handleGlobalMouseUp);
    // Touch listeners (passive: false to allow preventDefault)
    document.addEventListener("touchmove", handleGlobalTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", handleGlobalTouchEnd);
    document.addEventListener("touchcancel", handleGlobalTouchCancel);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mouseout", handleGlobalMouseOut);
      window.removeEventListener("blur", handleGlobalMouseUp);
      document.removeEventListener("touchmove", handleGlobalTouchMove);
      document.removeEventListener("touchend", handleGlobalTouchEnd);
      document.removeEventListener("touchcancel", handleGlobalTouchCancel);
    };
  }, []); // Empty dependency array prevents unnecessary re-renders

  // Safety: ensure body styles are reset on unmount even if a drag is in progress
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  /**
   * Touch support for mobile/tablet
   */
  const handleTouchStart = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      // Create a synthetic React mouse event
      const syntheticEvent = {
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        clientX: touch.clientX,
        clientY: touch.clientY,
      };

      handleMouseDown(syntheticEvent);
    },
    [handleMouseDown]
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent) => {
      if (e.touches.length !== 1) return;

      // Prevent page scroll/zoom while dragging
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousemove", {
        clientX: touch.clientX,
        clientY: touch.clientY,
      });

      handleMouseMove(mouseEvent);
    },
    [handleMouseMove]
  );

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  return {
    isDragging,
    handleMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};
