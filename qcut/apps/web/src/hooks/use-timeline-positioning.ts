import { TimelineElement, TimelineTrack, SnapPoint, canElementGoOnTrack } from "@/types/timeline";
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
    trackType: string
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

  return {
    getDropSnappedTime,
    detectElementOverlap,
    checkTrackCompatibility,
  };
}