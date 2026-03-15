import { easeOutCubic, clamp01 } from "./math-utils";
import {
	ZOOM_IN_OVERLAP_MS,
	ZOOM_IN_TRANSITION_WINDOW_MS,
	TRANSITION_WINDOW_MS,
} from "./constants";

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: number;
	focus: {
		cx: number;
		cy: number;
	};
	auto: boolean;
}

/**
 * Compute the zoom strength (0–1) for a region at a given time.
 * Handles smooth in/out transitions with easing.
 */
export function computeRegionStrength(
	region: ZoomRegion,
	timeMs: number
): number {
	const { startMs, endMs } = region;

	// Before region (with overlap for zoom-in transition)
	const zoomInStart = startMs - ZOOM_IN_OVERLAP_MS;
	if (timeMs < zoomInStart) return 0;

	// Zoom-in transition
	if (timeMs < startMs) {
		const t = (timeMs - zoomInStart) / ZOOM_IN_TRANSITION_WINDOW_MS;
		return easeOutCubic(clamp01(t));
	}

	// Inside region
	if (timeMs <= endMs) return 1;

	// Zoom-out transition
	const zoomOutEnd = endMs + TRANSITION_WINDOW_MS;
	if (timeMs <= zoomOutEnd) {
		const t = (timeMs - endMs) / TRANSITION_WINDOW_MS;
		return 1 - easeOutCubic(clamp01(t));
	}

	return 0;
}

/**
 * Merge overlapping zoom regions into contiguous blocks.
 */
export function mergeOverlappingRegions(regions: ZoomRegion[]): ZoomRegion[] {
	if (regions.length <= 1) return [...regions];

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	const merged: ZoomRegion[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged[merged.length - 1];

		if (current.startMs <= last.endMs + TRANSITION_WINDOW_MS) {
			// Merge: extend end time, use higher depth
			last.endMs = Math.max(last.endMs, current.endMs);
			if (current.depth > last.depth) {
				last.depth = current.depth;
				last.focus = current.focus;
			}
		} else {
			merged.push({ ...current });
		}
	}

	return merged;
}
