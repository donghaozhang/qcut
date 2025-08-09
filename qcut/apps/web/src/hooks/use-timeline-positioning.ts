import { TimelineElement, TimelineTrack, canElementGoOnTrack } from "@/types/timeline";
import { SnapPoint } from "@/hooks/use-timeline-snapping";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { useTimelineStore } from "@/stores/timeline-store";
import { usePlaybackStore } from "@/stores/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineSnapping } from "@/hooks/use-timeline-snapping";
import { snapTimeToFrame } from "@/constants/timeline-constants";

export interface TimelinePositioningOptions {
  zoomLevel: number;
  snapThreshold?: number;
}

export interface DropSnappedTimeResult {
  snappedTime: number;
  snapPoint: SnapPoint | null;
}

export interface OverlapDetectionResult {
  hasOverlap: boolean;
  overlappingElements: TimelineElement[];
}

export interface TrackCompatibilityResult {
  compatible: boolean;
  reason?: string;
}

/**
 * Custom hook for timeline positioning, snapping, and validation logic
 */
export function useTimelinePositioning(options: TimelinePositioningOptions) {
  const { tracks, snappingEnabled } = useTimelineStore();
  const { currentTime } = usePlaybackStore();
  const { snapElementEdge } = useTimelineSnapping({
    snapThreshold: options.snapThreshold || 10,
    enableElementSnapping: snappingEnabled,
    enablePlayheadSnapping: snappingEnabled,
  });

  // Extracted from timeline-track.tsx (lines 376-420)
  const getDropSnappedTime = (
    dropTime: number,
    elementDuration: number,
    excludeElementId?: string
  ) => {
    if (!snappingEnabled) {
      // Use frame snapping if project has FPS, otherwise use decimal snapping
      const projectStore = useProjectStore.getState();
      const projectFps = projectStore.activeProject?.fps || 30;
      return snapTimeToFrame(dropTime, projectFps);
    }

    // Try snapping both start and end edges for drops
    const startSnapResult = snapElementEdge(
      dropTime,
      elementDuration,
      tracks,
      currentTime,
      options.zoomLevel,
      excludeElementId,
      true // snap to start edge
    );

    const endSnapResult = snapElementEdge(
      dropTime,
      elementDuration,
      tracks,
      currentTime,
      options.zoomLevel,
      excludeElementId,
      false // snap to end edge
    );

    // Choose the snap result with the smaller distance (closer snap)
    let bestSnapResult = startSnapResult;
    if (
      endSnapResult.snapPoint &&
      (!startSnapResult.snapPoint ||
        endSnapResult.snapDistance < startSnapResult.snapDistance)
    ) {
      bestSnapResult = endSnapResult;
    }

    return bestSnapResult.snappedTime;
  };

  // Extracted from timeline-track.tsx - overlap detection logic
  const detectElementOverlap = (
    newStartTime: number,
    elementDuration: number,
    targetTrack: TimelineTrack,
    excludeElementId?: string
  ): OverlapDetectionResult => {
    const newElementEnd = newStartTime + elementDuration;
    const overlappingElements: TimelineElement[] = [];

    const hasOverlap = targetTrack.elements.some((existingElement) => {
      // Skip the element being moved if specified
      if (excludeElementId && existingElement.id === excludeElementId) {
        return false;
      }

      const existingStart = existingElement.startTime;
      const existingEnd =
        existingElement.startTime +
        (existingElement.duration -
          existingElement.trimStart -
          existingElement.trimEnd);

      // Check if elements overlap
      const overlaps = newStartTime < existingEnd && newElementEnd > existingStart;
      
      if (overlaps) {
        overlappingElements.push(existingElement);
      }
      
      return overlaps;
    });

    return { hasOverlap, overlappingElements };
  };

  // Extracted from timeline-track.tsx - track compatibility checking
  const checkTrackCompatibility = (
    elementType: "media" | "text" | "audio" | "video" | "image",
    trackType: "media" | "audio" | "text"
  ): TrackCompatibilityResult => {
    const isVideoOrImage = elementType === "video" || elementType === "image";
    const isAudio = elementType === "audio";
    const isMedia = elementType === "media";
    
    let compatible = false;
    let reason = "";

    if (isVideoOrImage || isAudio || isMedia) {
      compatible = canElementGoOnTrack("media", trackType);
      reason = compatible ? "" : "Media elements require a media track";
    } else if (elementType === "text") {
      compatible = canElementGoOnTrack("text", trackType);
      reason = compatible ? "" : "Text elements require a text track";
    } else {
      compatible = false;
      reason = `Unknown element type: ${elementType}`;
    }

    return { compatible, reason };
  };

  // Extracted from timeline-track.tsx - drag snapping calculations (lines ~117-178)
  const getDragSnappedTime = (
    adjustedTime: number,
    elementId?: string,
    trackId?: string,
    onSnapPointChange?: (snapPoint: SnapPoint | null) => void
  ) => {
    let finalTime = adjustedTime;
    let snapPoint: SnapPoint | null = null;
    
    if (snappingEnabled) {
      // Find the element being dragged to get its duration
      let elementDuration = 5; // fallback duration
      if (elementId && trackId) {
        const sourceTrack = tracks.find((t) => t.id === trackId);
        const element = sourceTrack?.elements.find((e) => e.id === elementId);
        if (element) {
          elementDuration = element.duration - element.trimStart - element.trimEnd;
        }
      }

      // Try snapping both start and end edges
      const startSnapResult = snapElementEdge(
        adjustedTime,
        elementDuration,
        tracks,
        currentTime,
        options.zoomLevel,
        elementId,
        true // snap to start edge
      );

      const endSnapResult = snapElementEdge(
        adjustedTime,
        elementDuration,
        tracks,
        currentTime,
        options.zoomLevel,
        elementId,
        false // snap to end edge
      );

      // Choose the snap result with the smaller distance (closer snap)
      let bestSnapResult = startSnapResult;
      if (
        endSnapResult.snapPoint &&
        (!startSnapResult.snapPoint ||
          endSnapResult.snapDistance < startSnapResult.snapDistance)
      ) {
        bestSnapResult = endSnapResult;
      }

      finalTime = bestSnapResult.snappedTime;
      snapPoint = bestSnapResult.snapPoint;

      // Notify parent component about snap point change
      onSnapPointChange?.(snapPoint);
    } else {
      // Use frame snapping if project has FPS, otherwise use decimal snapping
      const projectStore = useProjectStore.getState();
      const projectFps = projectStore.activeProject?.fps || 30;
      finalTime = snapTimeToFrame(adjustedTime, projectFps);

      // Clear snap point when not snapping
      onSnapPointChange?.(null);
    }

    return { finalTime, snapPoint };
  };

  return {
    getDropSnappedTime,
    getDragSnappedTime,
    detectElementOverlap,
    checkTrackCompatibility,
  };
}