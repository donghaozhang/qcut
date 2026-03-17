/** Focus area constraint calculations for zoom regions. */

/**
 * Ensure zoom focus point doesn't cause the viewport to go out of bounds.
 * Returns clamped cx, cy in 0–1 normalized space.
 */
export function constrainFocus(
	cx: number,
	cy: number,
	zoomScale: number,
	aspectRatio: number
): { cx: number; cy: number } {
	// At zoom scale S, the visible area is 1/S of the full frame.
	// The focus center must be at least half-viewport from each edge.
	// Use aspect ratio to compute correct horizontal/vertical half-extents.
	const halfViewW = aspectRatio >= 1 ? 0.5 / zoomScale : (0.5 * aspectRatio) / zoomScale;
	const halfViewH = aspectRatio >= 1 ? (0.5 / aspectRatio) / zoomScale : 0.5 / zoomScale;

	const clampedCx = Math.max(halfViewW, Math.min(1 - halfViewW, cx));
	const clampedCy = Math.max(halfViewH, Math.min(1 - halfViewH, cy));

	return { cx: clampedCx, cy: clampedCy };
}
