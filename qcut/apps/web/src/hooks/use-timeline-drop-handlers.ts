import { useCallback, useRef, useState } from "react";
import { TimelineTrack, TimelineElement } from "@/types/timeline";
import { SnapPoint } from "@/hooks/use-timeline-snapping";

export interface DropHandlersOptions {
  track: TimelineTrack;
  zoomLevel: number;
  onSnapPointChange?: (snapPoint: SnapPoint | null) => void;
  getDropSnappedTime: (
    dropTime: number,
    elementDuration: number,
    excludeElementId?: string
  ) => number;
}

export interface DropHandlersReturn {
  handleTrackDragEnter: (e: React.DragEvent) => void;
  handleTrackDragLeave: (e: React.DragEvent) => void;
  handleTrackDragOver: (e: React.DragEvent) => void;
  handleTrackDrop: (e: React.DragEvent) => void;
  isDropping: boolean;
  wouldOverlap: boolean;
  dropPosition: number | null;
}

/**
 * Custom hook for handling timeline track drop interactions  
 */
export function useTimelineDropHandlers(options: DropHandlersOptions): DropHandlersReturn {
  const { track, zoomLevel, onSnapPointChange, getDropSnappedTime } = options;

  // Drop state management (extracted from timeline-track.tsx)
  const [isDropping, setIsDropping] = useState(false);
  const [dropPosition, setDropPosition] = useState<number | null>(null);
  const [wouldOverlap, setWouldOverlap] = useState(false);
  const dragCounterRef = useRef(0);

  // Extracted from timeline-track.tsx (lines 563-577)
  const handleTrackDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    const hasTimelineElement = e.dataTransfer.types.includes(
      "application/x-timeline-element"
    );
    const hasMediaItem = e.dataTransfer.types.includes(
      "application/x-media-item"
    );

    if (!hasTimelineElement && !hasMediaItem) return;

    dragCounterRef.current++;
    setIsDropping(true);
  }, []);

  // Extracted from timeline-track.tsx (lines 579-598)
  const handleTrackDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    const hasTimelineElement = e.dataTransfer.types.includes(
      "application/x-timeline-element"
    );
    const hasMediaItem = e.dataTransfer.types.includes(
      "application/x-media-item"
    );

    if (!hasTimelineElement && !hasMediaItem) return;

    dragCounterRef.current--;

    if (dragCounterRef.current === 0) {
      setIsDropping(false);
      setWouldOverlap(false);
      setDropPosition(null);
    }
  }, []);

  const handleTrackDragOver = useCallback((e: React.DragEvent) => {
    // TODO: Extract from timeline-track.tsx (lines ~500-646)
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleTrackDrop = useCallback((e: React.DragEvent) => {
    // TODO: Extract from timeline-track.tsx (lines ~685-1050)
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    handleTrackDragEnter,
    handleTrackDragLeave,
    handleTrackDragOver,
    handleTrackDrop,
    isDropping,
    wouldOverlap,
    dropPosition,
  };
}