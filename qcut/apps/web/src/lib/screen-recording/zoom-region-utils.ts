import { easeOutCubic, clamp01, lerp } from "./math-utils";
import {
	ZOOM_IN_OVERLAP_MS,
	ZOOM_IN_TRANSITION_WINDOW_MS,
	TRANSITION_WINDOW_MS,
	CONNECTED_ZOOM_GAP_MS,
	CONNECTED_PAN_DURATION_MS,
} from "./constants";
import { easeConnectedPan } from "./easing";

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
	const merged: ZoomRegion[] = [{ ...sorted[0] }];

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

/** A smooth pan transition between two adjacent zoom regions. */
export interface ConnectedTransition {
	fromRegion: ZoomRegion;
	toRegion: ZoomRegion;
	panStartMs: number;
	panEndMs: number;
}

/**
 * Find pairs of zoom regions close enough to chain with a smooth pan
 * instead of zooming all the way out and back in.
 */
export function findConnectedTransitions(
	regions: ZoomRegion[]
): ConnectedTransition[] {
	if (regions.length < 2) return [];

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	const transitions: ConnectedTransition[] = [];

	for (let i = 0; i < sorted.length - 1; i++) {
		const gap = sorted[i + 1].startMs - sorted[i].endMs;
		if (gap > 0 && gap <= CONNECTED_ZOOM_GAP_MS) {
			const panStart = sorted[i].endMs;
			const panEnd = Math.min(
				panStart + CONNECTED_PAN_DURATION_MS,
				sorted[i + 1].startMs
			);
			transitions.push({
				fromRegion: sorted[i],
				toRegion: sorted[i + 1],
				panStartMs: panStart,
				panEndMs: panEnd,
			});
		}
	}

	return transitions;
}

/**
 * Get the connected pan state at a given time.
 * Returns interpolated focus + scale during a pan, or null if no pan is active.
 */
export function getConnectedPanState(
	transitions: ConnectedTransition[],
	timeMs: number
): { cx: number; cy: number; scale: number } | null {
	for (const tr of transitions) {
		// During pan animation
		if (timeMs >= tr.panStartMs && timeMs <= tr.panEndMs) {
			const t = clamp01(
				(timeMs - tr.panStartMs) / (tr.panEndMs - tr.panStartMs)
			);
			const eased = easeConnectedPan(t);
			return {
				cx: lerp(tr.fromRegion.focus.cx, tr.toRegion.focus.cx, eased),
				cy: lerp(tr.fromRegion.focus.cy, tr.toRegion.focus.cy, eased),
				scale: lerp(tr.fromRegion.depth, tr.toRegion.depth, eased),
			};
		}
		// Hold at target between pan end and next region start
		if (timeMs > tr.panEndMs && timeMs < tr.toRegion.startMs) {
			return {
				cx: tr.toRegion.focus.cx,
				cy: tr.toRegion.focus.cy,
				scale: tr.toRegion.depth,
			};
		}
	}
	return null;
}
