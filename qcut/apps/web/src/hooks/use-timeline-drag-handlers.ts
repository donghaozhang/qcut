import { useCallback, useEffect, useRef, RefObject } from "react";
import { TimelineElement, TimelineTrack, DragData } from "@/types/timeline";
import { SnapPoint } from "@/hooks/use-timeline-snapping";
import { useTimelineStore } from "@/stores/timeline-store";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";

export interface DragHandlersOptions {
  track: TimelineTrack;
  tracks: TimelineTrack[];
  zoomLevel: number;
  timelineRef: RefObject<HTMLDivElement>;
  onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
  getDragSnappedTime: (
    adjustedTime: number,
    elementId?: string,
    trackId?: string,
    onSnapPointChange?: (snapPoint: SnapPoint | null) => void
  ) => { finalTime: number; snapPoint: SnapPoint | null };
}

export interface DragHandlersReturn {
  handleMouseDown: (e: React.MouseEvent, element: TimelineElement) => void;
  handleMouseMove: (e: MouseEvent) => void;
  handleMouseUp: (e: MouseEvent) => void;
  isDragging: boolean;
}

/**
 * Custom hook for handling timeline element drag interactions
 */
export function useTimelineDragHandlers(options: DragHandlersOptions): DragHandlersReturn {
  const { 
    track, 
    tracks, 
    zoomLevel, 
    timelineRef, 
    onSnapPointChange,
    getDragSnappedTime 
  } = options;

  const {
    dragState,
    updateDragTime,
    updateElementStartTime,
    updateElementStartTimeWithRipple,
    moveElementToTrack,
    endDrag,
    selectedElements,
    selectElement,
    rippleEditingEnabled,
  } = useTimelineStore();
  
  // Extracted from timeline-track.tsx useEffect (lines 82-311)
  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;

      // On first mouse move during drag, ensure the element is selected
      if (dragState.elementId && dragState.trackId) {
        const isSelected = selectedElements.some(
          (c) =>
            c.trackId === dragState.trackId &&
            c.elementId === dragState.elementId
        );

        if (!isSelected) {
          // Select this element (replacing other selections) since we're dragging it
          selectElement(dragState.trackId, dragState.elementId, false);
        }
      }

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const mouseX = e.clientX - timelineRect.left;
      const mouseTime = Math.max(
        0,
        mouseX / (TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel)
      );
      const adjustedTime = Math.max(0, mouseTime - dragState.clickOffsetTime);

      // Apply snapping using extracted function
      const { finalTime, snapPoint } = getDragSnappedTime(
        adjustedTime,
        dragState.elementId || undefined,
        dragState.trackId || undefined,
        onSnapPointChange
      );

      updateDragTime(finalTime);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragState.elementId || !dragState.trackId) return;

      // If this track initiated the drag, we should handle the mouse up regardless of where it occurs
      const isTrackThatStartedDrag = dragState.trackId === track.id;

      const timelineRect = timelineRef.current?.getBoundingClientRect();
      if (!timelineRect) {
        if (isTrackThatStartedDrag) {
          if (rippleEditingEnabled) {
            updateElementStartTimeWithRipple(
              track.id,
              dragState.elementId,
              dragState.currentTime
            );
          } else {
            updateElementStartTime(
              track.id,
              dragState.elementId,
              dragState.currentTime
            );
          }
          endDrag();
          // Clear snap point when drag ends
          onSnapPointChange?.(null);
        }
        return;
      }

      const isMouseOverThisTrack =
        e.clientY >= timelineRect.top && e.clientY <= timelineRect.bottom;

      if (!isMouseOverThisTrack && !isTrackThatStartedDrag) return;

      const finalTime = dragState.currentTime;

      if (isMouseOverThisTrack) {
        const sourceTrack = tracks.find((t) => t.id === dragState.trackId);
        const movingElement = sourceTrack?.elements.find(
          (c) => c.id === dragState.elementId
        );

        if (movingElement && dragState.trackId !== track.id) {
          // Moving to a different track
          moveElementToTrack(
            dragState.trackId,
            track.id,
            dragState.elementId
          );
        } else if (movingElement) {
          // Moving within the same track - check for overlaps
          const movingElementDuration =
            movingElement.duration -
            movingElement.trimStart -
            movingElement.trimEnd;

          const movingElementEnd = finalTime + movingElementDuration;

          const hasOverlap = track.elements.some((existingElement) => {
            if (existingElement.id === dragState.elementId) {
              return false;
            }
            const existingStart = existingElement.startTime;
            const existingEnd =
              existingElement.startTime +
              (existingElement.duration -
                existingElement.trimStart -
                existingElement.trimEnd);
            return finalTime < existingEnd && movingElementEnd > existingStart;
          });

          if (!hasOverlap) {
            if (rippleEditingEnabled) {
              updateElementStartTimeWithRipple(
                track.id,
                dragState.elementId,
                finalTime
              );
            } else {
              updateElementStartTime(track.id, dragState.elementId, finalTime);
            }
          }
        }
      }

      if (isTrackThatStartedDrag) {
        endDrag();
        // Clear snap point when drag ends
        onSnapPointChange?.(null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragState.isDragging,
    dragState.clickOffsetTime,
    dragState.elementId,
    dragState.trackId,
    dragState.currentTime,
    zoomLevel,
    tracks,
    track.id,
    track.elements,
    updateDragTime,
    updateElementStartTime,
    updateElementStartTimeWithRipple,
    moveElementToTrack,
    endDrag,
    selectedElements,
    selectElement,
    onSnapPointChange,
    rippleEditingEnabled,
    getDragSnappedTime,
    timelineRef,
  ]);

  // Placeholder handlers for now
  const handleMouseDown = useCallback((e: React.MouseEvent, element: TimelineElement) => {
    // TODO: Extract mouse down logic if needed
    console.log("Mouse down on element", element.id);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    // Mouse move is now handled by the useEffect above
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Mouse up is now handled by the useEffect above
  }, []);

  return {
    handleMouseDown,
    handleMouseMove, 
    handleMouseUp,
    isDragging: dragState.isDragging,
  };
}