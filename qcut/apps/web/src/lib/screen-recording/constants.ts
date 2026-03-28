/** Shared constants for zoom and timing. */

export const ZOOM_DEPTH_SCALES: Record<number, number> = {
	1: 1.0,
	1.5: 1.5,
	2: 2.0,
	3: 3.0,
};

export const ZOOM_IN_OVERLAP_MS = 500;
export const ZOOM_IN_TRANSITION_WINDOW_MS = 600;
export const TRANSITION_WINDOW_MS = 400;

/** Max gap between regions to chain with a smooth pan instead of zoom out/in */
export const CONNECTED_ZOOM_GAP_MS = 1500;
/** Duration of the pan transition between connected zoom regions */
export const CONNECTED_PAN_DURATION_MS = 1000;
