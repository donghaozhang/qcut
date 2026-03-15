import { computeRegionStrength, type ZoomRegion } from "./zoom-region-utils";
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
 * Combines all active zoom regions and returns a single transform.
 */
export function computeZoomTransform(
	timeMs: number,
	regions: ZoomRegion[],
	sourceWidth: number,
	sourceHeight: number
): ZoomTransform {
	if (regions.length === 0) return IDENTITY_TRANSFORM;

	// Find the strongest active region
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

	const aspectRatio = sourceWidth / sourceHeight;
	const { cx, cy } = constrainFocus(
		bestRegion.focus.cx,
		bestRegion.focus.cy,
		bestRegion.depth,
		aspectRatio
	);

	// Interpolate scale from 1 to depth based on strength
	const scale = lerp(1, bestRegion.depth, bestStrength);

	// Translate so the focus point stays centered
	// At scale S, the visible viewport is (1/S) of the source.
	// To center on (cx, cy), translate by:
	const translateX = -(cx * sourceWidth * scale - sourceWidth / 2);
	const translateY = -(cy * sourceHeight * scale - sourceHeight / 2);

	return { scale, translateX, translateY };
}
