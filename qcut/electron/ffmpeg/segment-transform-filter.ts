/**
 * Media element transform → ffmpeg filter chain for the segment export
 * pipeline. Mirrors the preview's application order (scale, then rotate,
 * then translate; opacity last) so exports match what the editor shows.
 * Static sizes are computed numerically in TS; linear position keyframes
 * (L4) become time-varying crop expressions with `\,`-escaped commas. The
 * pipeline composites segments over an opaque black canvas, so opacity is
 * premultiplied against black via colorchannelmixer. Rotation is degrees,
 * screen-clockwise positive (ffmpeg rotate's own convention, same as the
 * editor's element rotation).
 */

/** One linear position keyframe in TIMELINE seconds and canvas pixels. */
export interface SegmentPositionKeyframe {
	timeSeconds: number;
	value: number;
}

export interface SegmentTransform {
	x: number;
	y: number;
	rotationDegrees: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
	/** When present, animates the axis and overrides the static offset. */
	xKeyframes?: SegmentPositionKeyframe[];
	yKeyframes?: SegmentPositionKeyframe[];
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
		transform.opacity === 1 &&
		(transform.xKeyframes?.length ?? 0) === 0 &&
		(transform.yKeyframes?.length ?? 0) === 0
	);
}

/**
 * Piecewise-linear track value as an ffmpeg expression over `t` (source
 * seconds). Keyframe times are timeline seconds; at playback rate r the
 * source clock runs r× faster, so the expression samples at t/r.
 */
export function buildLinearTrackExpression({
	keyframes,
	playbackRate = 1,
}: {
	keyframes: SegmentPositionKeyframe[];
	playbackRate?: number;
}): string {
	if (keyframes.length === 0) return "0";
	if (keyframes.length === 1) return String(keyframes[0].value);
	const clock = playbackRate === 1 ? "t" : `(t/${playbackRate})`;
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	const terms = [
		`lt(${clock}\\,${first.timeSeconds})*(${first.value})`,
		`gte(${clock}\\,${last.timeSeconds})*(${last.value})`,
	];
	for (let index = 0; index < keyframes.length - 1; index += 1) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const span = to.timeSeconds - from.timeSeconds;
		if (span <= 0) continue;
		const slope = (to.value - from.value) / span;
		terms.push(
			`gte(${clock}\\,${from.timeSeconds})*lt(${clock}\\,${to.timeSeconds})*(${from.value}+${slope}*(${clock}-${from.timeSeconds}))`
		);
	}
	return terms.join("+");
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
	playbackRate = 1,
}: {
	transform: SegmentTransform;
	width: number;
	height: number;
	playbackRate?: number;
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
	// stays inside the frame across the whole animation range.
	const xTrack = transform.xKeyframes?.length ? transform.xKeyframes : null;
	const yTrack = transform.yKeyframes?.length ? transform.yKeyframes : null;
	const maxAbsX = xTrack
		? Math.max(...xTrack.map(({ value }) => Math.abs(value)))
		: Math.abs(transform.x);
	const maxAbsY = yTrack
		? Math.max(...yTrack.map(({ value }) => Math.abs(value)))
		: Math.abs(transform.y);
	const neededWidth = width + 2 * Math.ceil(maxAbsX);
	const neededHeight = height + 2 * Math.ceil(maxAbsY);
	const paddedWidth = Math.max(currentWidth, neededWidth);
	const paddedHeight = Math.max(currentHeight, neededHeight);
	if (paddedWidth !== currentWidth || paddedHeight !== currentHeight) {
		stages.push(
			`pad=${paddedWidth}:${paddedHeight}:(ow-iw)/2:(oh-ih)/2:color=black`
		);
		currentWidth = paddedWidth;
		currentHeight = paddedHeight;
	}

	const animated = xTrack !== null || yTrack !== null;
	if (currentWidth !== width || currentHeight !== height || animated) {
		// Content moved +x renders further right, so the crop window shifts left.
		const xOffset = xTrack
			? `(${buildLinearTrackExpression({ keyframes: xTrack, playbackRate })})`
			: null;
		const yOffset = yTrack
			? `(${buildLinearTrackExpression({ keyframes: yTrack, playbackRate })})`
			: null;
		const cropX =
			xOffset === null
				? String((currentWidth - width) / 2 - transform.x)
				: `(${currentWidth}-${width})/2-${xOffset}`;
		const cropY =
			yOffset === null
				? String((currentHeight - height) / 2 - transform.y)
				: `(${currentHeight}-${height})/2-${yOffset}`;
		stages.push(`crop=${width}:${height}:${cropX}:${cropY}`);
	}

	if (transform.opacity !== 1) {
		const alpha = Math.min(1, Math.max(0, transform.opacity));
		stages.push(`colorchannelmixer=rr=${alpha}:gg=${alpha}:bb=${alpha}`);
	}

	return stages.join(",");
}

/**
 * atempo only accepts factors in [0.5, 2] per stage; chain stages until the
 * remaining factor fits. Returns null at rate 1 (no audio filter needed).
 */
export function buildAtempoChain({ rate }: { rate: number }): string | null {
	if (rate === 1) return null;
	const stages: number[] = [];
	let remaining = rate;
	while (remaining > 2) {
		stages.push(2);
		remaining /= 2;
	}
	while (remaining < 0.5) {
		stages.push(0.5);
		remaining *= 2;
	}
	stages.push(remaining);
	return stages.map((stage) => `atempo=${stage}`).join(",");
}
