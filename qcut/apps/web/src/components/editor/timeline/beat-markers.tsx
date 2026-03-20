/**
 * Beat Markers — renders semi-transparent vertical lines on the timeline ruler
 * for detected beats. Orange for downbeats, blue for regular beats.
 *
 * Only renders markers visible in the current viewport for performance.
 */

import { useMemo } from "react";
import { useBeatDetectionStore } from "@/stores/beat-detection-store";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";

interface BeatMarkersProps {
	zoomLevel: number;
	/** Visible scroll left offset in pixels */
	scrollLeft?: number;
	/** Visible container width in pixels */
	containerWidth?: number;
}

export function BeatMarkers({
	zoomLevel,
	scrollLeft = 0,
	containerWidth = 4000,
}: BeatMarkersProps) {
	const activeElementId = useBeatDetectionStore((s) => s.activeElementId);
	const cache = useBeatDetectionStore((s) => s.cache);

	const result = activeElementId ? (cache.get(activeElementId) ?? null) : null;

	const visibleBeats = useMemo(() => {
		if (!result || result.beats.length === 0) return [];

		const pps = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
		const viewStart = scrollLeft / pps;
		const viewEnd = (scrollLeft + containerWidth) / pps;
		// Add small buffer to avoid popping
		const buffer = 1;

		return result.beats.filter(
			(b) =>
				b.timestamp >= viewStart - buffer && b.timestamp <= viewEnd + buffer
		);
	}, [result, zoomLevel, scrollLeft, containerWidth]);

	if (visibleBeats.length === 0) return null;

	const pps = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

	return (
		<>
			{visibleBeats.map((beat) => (
				<div
					key={`beat-${beat.index}`}
					className={`absolute top-0 h-full w-px ${
						beat.isDownbeat ? "bg-orange-400/50" : "bg-blue-400/35"
					}`}
					style={{
						left: `${beat.timestamp * pps}px`,
					}}
					aria-hidden="true"
				/>
			))}
		</>
	);
}
