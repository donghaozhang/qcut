export interface NormalizedBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SaliencyAnalysis {
	activePixelCount: number;
	activePixelRatio: number;
	centroid: { x: number; y: number };
	subjectBounds: NormalizedBounds;
	recommendedCrop: NormalizedBounds;
}

export interface SaliencyObservation {
	timestampSeconds: number;
	analysis: SaliencyAnalysis;
}

export interface SmartMotionKeyframe {
	timestampSeconds: number;
	centerX: number;
	centerY: number;
	zoom: number;
}

function clamp({
	value,
	minimum,
	maximum,
}: {
	value: number;
	minimum: number;
	maximum: number;
}): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function fitBoundsToAspectRatio({
	bounds,
	targetAspectRatio,
}: {
	bounds: NormalizedBounds;
	targetAspectRatio: number;
}): NormalizedBounds {
	const centerX = bounds.x + bounds.width / 2;
	const centerY = bounds.y + bounds.height / 2;
	let width = bounds.width;
	let height = bounds.height;

	if (width / height < targetAspectRatio) {
		width = height * targetAspectRatio;
	} else {
		height = width / targetAspectRatio;
	}

	const scale = Math.min(1, 1 / width, 1 / height);
	width *= scale;
	height *= scale;

	return {
		x: clamp({ value: centerX - width / 2, minimum: 0, maximum: 1 - width }),
		y: clamp({ value: centerY - height / 2, minimum: 0, maximum: 1 - height }),
		width,
		height,
	};
}

export function analyzeSaliencyMask({
	mask,
	width,
	height,
	threshold = 32,
	paddingRatio = 0.12,
	targetAspectRatio = width / height,
}: {
	mask: Uint8Array;
	width: number;
	height: number;
	threshold?: number;
	paddingRatio?: number;
	targetAspectRatio?: number;
}): SaliencyAnalysis {
	if (
		!Number.isInteger(width) ||
		width <= 0 ||
		!Number.isInteger(height) ||
		height <= 0
	) {
		throw new Error("mask dimensions must be positive integers");
	}
	if (mask.byteLength !== width * height) {
		throw new Error(
			`mask size ${mask.byteLength} does not match ${width}x${height}`
		);
	}
	if (targetAspectRatio <= 0) {
		throw new Error("target aspect ratio must be positive");
	}

	let minimumX = width;
	let minimumY = height;
	let maximumX = -1;
	let maximumY = -1;
	let weightedX = 0;
	let weightedY = 0;
	let totalWeight = 0;
	let activePixelCount = 0;

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const value = mask[y * width + x] ?? 0;
			if (value < threshold) continue;
			minimumX = Math.min(minimumX, x);
			minimumY = Math.min(minimumY, y);
			maximumX = Math.max(maximumX, x);
			maximumY = Math.max(maximumY, y);
			weightedX += x * value;
			weightedY += y * value;
			totalWeight += value;
			activePixelCount += 1;
		}
	}

	if (activePixelCount === 0 || totalWeight === 0) {
		throw new Error("saliency mask has no foreground pixels");
	}

	const subjectWidth = maximumX - minimumX + 1;
	const subjectHeight = maximumY - minimumY + 1;
	const paddedX = Math.max(0, minimumX - subjectWidth * paddingRatio);
	const paddedY = Math.max(0, minimumY - subjectHeight * paddingRatio);
	const paddedMaximumX = Math.min(
		width,
		maximumX + 1 + subjectWidth * paddingRatio
	);
	const paddedMaximumY = Math.min(
		height,
		maximumY + 1 + subjectHeight * paddingRatio
	);
	const paddedBounds = {
		x: paddedX / width,
		y: paddedY / height,
		width: (paddedMaximumX - paddedX) / width,
		height: (paddedMaximumY - paddedY) / height,
	};

	return {
		activePixelCount,
		activePixelRatio: activePixelCount / mask.byteLength,
		centroid: {
			x: weightedX / totalWeight / width,
			y: weightedY / totalWeight / height,
		},
		subjectBounds: {
			x: minimumX / width,
			y: minimumY / height,
			width: subjectWidth / width,
			height: subjectHeight / height,
		},
		recommendedCrop: fitBoundsToAspectRatio({
			bounds: paddedBounds,
			targetAspectRatio,
		}),
	};
}

export function buildSmartMotionKeyframes({
	observations,
	smoothing = 0.4,
}: {
	observations: SaliencyObservation[];
	smoothing?: number;
}): SmartMotionKeyframe[] {
	if (observations.length === 0) {
		throw new Error("at least one saliency observation is required");
	}
	if (smoothing < 0 || smoothing > 1) {
		throw new Error("smoothing must be between 0 and 1");
	}

	const ordered = [...observations].sort(
		(left, right) => left.timestampSeconds - right.timestampSeconds
	);
	let centerX = ordered[0]?.analysis.centroid.x ?? 0.5;
	let centerY = ordered[0]?.analysis.centroid.y ?? 0.5;
	let zoom =
		1 / Math.max(ordered[0]?.analysis.recommendedCrop.width ?? 1, 0.01);

	return ordered.map(({ timestampSeconds, analysis }, index) => {
		const targetZoom = 1 / Math.max(analysis.recommendedCrop.width, 0.01);
		if (index > 0) {
			centerX += (analysis.centroid.x - centerX) * smoothing;
			centerY += (analysis.centroid.y - centerY) * smoothing;
			zoom += (targetZoom - zoom) * smoothing;
		}
		return {
			timestampSeconds,
			centerX,
			centerY,
			zoom: clamp({ value: zoom, minimum: 1, maximum: 4 }),
		};
	});
}
