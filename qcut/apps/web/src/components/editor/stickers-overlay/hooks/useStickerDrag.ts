/**
 * useStickerDrag Hook
 *
 * Handles drag functionality for overlay stickers with smooth movement
 * and boundary constraints.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
}

/**
 * Hook to handle sticker dragging with mouse events
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
   * Calculate position as percentage of canvas
   */
  const calculatePercentagePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return { x: 50, y: 50 };

      const rect = canvasRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      // Constrain to canvas bounds (with some padding)
      return {
        x: Math.max(5, Math.min(95, x)),
        y: Math.max(5, Math.min(95, y)),
      };
    },
    [canvasRef]
  );

  /**
   * Handle mouse down - start dragging
   */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!sticker) return;

      console.log(
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

  /**
   * Set up and clean up event listeners
   */
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => handleMouseMove(e);
    const handleGlobalMouseUp = () => handleMouseUp();

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mouseleave", handleGlobalMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mouseleave", handleGlobalMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  /**
   * Touch support for mobile/tablet
   */
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousedown", {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true,
      });

      handleMouseDown(mouseEvent as any);
    },
    [handleMouseDown]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;

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
