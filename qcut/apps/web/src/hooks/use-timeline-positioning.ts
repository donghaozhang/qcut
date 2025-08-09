import { TimelineElement, TimelineTrack, SnapPoint } from "@/types/timeline";
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

  const detectElementOverlap = (
    element: TimelineElement,
    track: TimelineTrack,
    newStartTime: number
  ): OverlapDetectionResult => {
    // TODO: Extract from timeline-track.tsx
    return { hasOverlap: false, overlappingElements: [] };
  };

  const checkTrackCompatibility = (
    elementType: string,
    trackType: string
  ): TrackCompatibilityResult => {
    // TODO: Extract from timeline-track.tsx
    return { compatible: true };
  };

  return {
    getDropSnappedTime,
    detectElementOverlap,
    checkTrackCompatibility,
  };
}