import {
	computeRegionStrength,
	type ZoomRegion,
	type ConnectedTransition,
	getConnectedPanState,
} from "./zoom-region-utils";
import { constrainFocus } from "./focus-utils";
import { lerp } from "./math-utils";

export interface ZoomTransform {
	scale: number;
	translateX: number;
	translateY: number;
}

const IDENTITY_TRANSFORM: ZoomTransform = {
	scale: 1,
	translateX: 0,
	translateY: 0,
};

/**
 * Compute the active zoom transform at a given time.
 * Connected transitions take priority — smooth pan between adjacent regions
 * instead of zooming all the way out and back in.
 */
export function computeZoomTransform(
	timeMs: number,
	regions: ZoomRegion[],
	sourceWidth: number,
	sourceHeight: number,
	connectedTransitions?: ConnectedTransition[]
): ZoomTransform {
	if (regions.length === 0) return IDENTITY_TRANSFORM;

	const aspectRatio = sourceWidth / sourceHeight;

	// Priority 1: Check connected pan transitions
	if (connectedTransitions && connectedTransitions.length > 0) {
		const panState = getConnectedPanState(connectedTransitions, timeMs);
		if (panState) {
			const { cx, cy } = constrainFocus(
				panState.cx,
				panState.cy,
				panState.scale,
				aspectRatio
			);
			const translateX = -(cx * sourceWidth * panState.scale - sourceWidth / 2);
			const translateY = -(
				cy * sourceHeight * panState.scale -
				sourceHeight / 2
			);
			return { scale: panState.scale, translateX, translateY };
		}
	}

	// Priority 2: Find the strongest active region
	let bestStrength = 0;
	let bestRegion: ZoomRegion | null = null;

	for (const region of regions) {
		const strength = computeRegionStrength(region, timeMs);
		if (strength > bestStrength) {
			bestStrength = strength;
			bestRegion = region;
		}
	}

	if (!bestRegion || bestStrength <= 0.001) return IDENTITY_TRANSFORM;

	const { cx, cy } = constrainFocus(
		bestRegion.focus.cx,
		bestRegion.focus.cy,
		bestRegion.depth,
		aspectRatio
	);

	const scale = lerp(1, bestRegion.depth, bestStrength);
	const translateX = -(cx * sourceWidth * scale - sourceWidth / 2);
	const translateY = -(cy * sourceHeight * scale - sourceHeight / 2);

	return { scale, translateX, translateY };
}
