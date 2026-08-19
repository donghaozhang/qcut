/**
 * Media element transform → ffmpeg filter chain for the segment export
 * pipeline. Mirrors the preview's application order (scale, then rotate,
 * then translate; opacity last) so exports match what the editor shows.
 * All sizes are computed numerically in TS — no ffmpeg expressions with
 * escaped commas. The pipeline composites segments over an opaque black
 * canvas, so opacity is premultiplied against black via colorchannelmixer.
 * Rotation is degrees, screen-clockwise positive (ffmpeg rotate's own
 * convention, same as the editor's element rotation).
 */

export interface SegmentTransform {
	x: number;
	y: number;
	rotationDegrees: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
}

export function isIdentitySegmentTransform({
	transform,
}: {
	transform: SegmentTransform;
}): boolean {
	return (
		transform.x === 0 &&
		transform.y === 0 &&
		transform.rotationDegrees === 0 &&
		transform.scaleX === 1 &&
		transform.scaleY === 1 &&
		transform.opacity === 1
	);
}

/**
 * Builds the transform stages to append after the canvas fit filter, or ""
 * for the identity transform. `width`/`height` are the canvas (and final
 * output) dimensions the fitted input already has.
 */
export function buildSegmentTransformFilter({
	transform,
	width,
	height,
}: {
	transform: SegmentTransform;
	width: number;
	height: number;
}): string {
	if (isIdentitySegmentTransform({ transform })) return "";
	const stages: string[] = [];
	let currentWidth = width;
	let currentHeight = height;

	if (transform.scaleX !== 1 || transform.scaleY !== 1) {
		currentWidth = Math.max(2, Math.round(width * transform.scaleX));
		currentHeight = Math.max(2, Math.round(height * transform.scaleY));
		stages.push(`scale=${currentWidth}:${currentHeight}`);
	}

	if (transform.rotationDegrees !== 0) {
		// A square diagonal canvas holds the rotated content at any angle.
		const diagonal = Math.ceil(Math.hypot(currentWidth, currentHeight));
		const radians = (transform.rotationDegrees * Math.PI) / 180;
		stages.push(
			`rotate=${radians.toFixed(8)}:ow=${diagonal}:oh=${diagonal}:c=black`
		);
		currentWidth = diagonal;
		currentHeight = diagonal;
	}

	// Ensure the crop window (canvas size, shifted against the translation)
	// stays inside the frame even for large offsets.
	const neededWidth = width + 2 * Math.ceil(Math.abs(transform.x));
	const neededHeight = height + 2 * Math.ceil(Math.abs(transform.y));
	const paddedWidth = Math.max(currentWidth, neededWidth);
	const paddedHeight = Math.max(currentHeight, neededHeight);
	if (paddedWidth !== currentWidth || paddedHeight !== currentHeight) {
		stages.push(
			`pad=${paddedWidth}:${paddedHeight}:(ow-iw)/2:(oh-ih)/2:color=black`
		);
		currentWidth = paddedWidth;
		currentHeight = paddedHeight;
	}

	if (currentWidth !== width || currentHeight !== height) {
		// Content moved +x renders further right, so the crop window shifts left.
		const cropX = (currentWidth - width) / 2 - transform.x;
		const cropY = (currentHeight - height) / 2 - transform.y;
		stages.push(`crop=${width}:${height}:${cropX}:${cropY}`);
	}

	if (transform.opacity !== 1) {
		const alpha = Math.min(1, Math.max(0, transform.opacity));
		stages.push(`colorchannelmixer=rr=${alpha}:gg=${alpha}:bb=${alpha}`);
	}

	return stages.join(",");
}
