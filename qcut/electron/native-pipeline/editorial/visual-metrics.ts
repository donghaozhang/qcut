import type {
	FramePosition,
	FrameSample,
	MotionDirection,
	RangeMetrics,
	VisualFocus,
} from "./types.js";

function clamp({
	value,
	min = 0,
	max = 1,
}: {
	value: number;
	min?: number;
	max?: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

function mean({ values }: { values: number[] }): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round({
	value,
	digits = 4,
}: {
	value: number;
	digits?: number;
}): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function positionFromPoint({ x, y }: { x: number; y: number }): FramePosition {
	const column = x < 1 / 3 ? 0 : x > 2 / 3 ? 2 : 1;
	const row = y < 1 / 3 ? 0 : y > 2 / 3 ? 2 : 1;
	const positions: FramePosition[][] = [
		["top-left", "top", "top-right"],
		["left", "center", "right"],
		["bottom-left", "bottom", "bottom-right"],
	];
	return positions[row][column];
}

function analyzeFrame({
	frame,
	width,
	height,
}: {
	frame: Buffer;
	width: number;
	height: number;
}): {
	luma: number;
	contrast: number;
	sharpness: number;
	focus: VisualFocus;
} {
	const pixelCount = width * height;
	if (frame.length < pixelCount) {
		throw new Error(
			`Expected ${pixelCount} grayscale bytes, got ${frame.length}`
		);
	}
	let lumaSum = 0;
	let lumaSquaredSum = 0;
	for (let index = 0; index < pixelCount; index += 1) {
		const value = frame[index];
		lumaSum += value;
		lumaSquaredSum += value * value;
	}
	const luma = lumaSum / pixelCount;
	const variance = Math.max(0, lumaSquaredSum / pixelCount - luma * luma);
	const contrast = clamp({ value: Math.sqrt(variance) / 64 });

	let laplacianSum = 0;
	let laplacianSquaredSum = 0;
	let edgeWeight = 0;
	let weightedX = 0;
	let weightedY = 0;
	let edgeSamples = 0;
	for (let y = 1; y < height - 1; y += 1) {
		for (let x = 1; x < width - 1; x += 1) {
			const index = y * width + x;
			const center = frame[index];
			const laplacian =
				frame[index - 1] +
				frame[index + 1] +
				frame[index - width] +
				frame[index + width] -
				4 * center;
			laplacianSum += laplacian;
			laplacianSquaredSum += laplacian * laplacian;
			const gradient =
				Math.abs(frame[index + 1] - frame[index - 1]) +
				Math.abs(frame[index + width] - frame[index - width]);
			edgeWeight += gradient;
			weightedX += gradient * x;
			weightedY += gradient * y;
			edgeSamples += 1;
		}
	}
	const laplacianMean = laplacianSum / Math.max(1, edgeSamples);
	const laplacianVariance = Math.max(
		0,
		laplacianSquaredSum / Math.max(1, edgeSamples) -
			laplacianMean * laplacianMean
	);
	const sharpness = clamp({
		value: 1 - Math.exp(-laplacianVariance / 1800),
	});
	const focusX =
		edgeWeight > 0 ? weightedX / edgeWeight / Math.max(1, width - 1) : 0.5;
	const focusY =
		edgeWeight > 0 ? weightedY / edgeWeight / Math.max(1, height - 1) : 0.5;
	const focusConfidence = clamp({
		value: edgeWeight / Math.max(1, edgeSamples * 80),
	});

	return {
		luma: round({ value: luma / 255 }),
		contrast: round({ value: contrast }),
		sharpness: round({ value: sharpness }),
		focus: {
			x: round({ value: focusX }),
			y: round({ value: focusY }),
			position: positionFromPoint({ x: focusX, y: focusY }),
			confidence: round({ value: focusConfidence }),
		},
	};
}

function estimateMotion({
	previous,
	current,
	width,
	height,
	maxShift = 4,
}: {
	previous: Buffer;
	current: Buffer;
	width: number;
	height: number;
	maxShift?: number;
}): { x: number; y: number; magnitude: number; residual: number } {
	let bestX = 0;
	let bestY = 0;
	let bestError = Number.POSITIVE_INFINITY;
	for (let shiftY = -maxShift; shiftY <= maxShift; shiftY += 1) {
		for (let shiftX = -maxShift; shiftX <= maxShift; shiftX += 1) {
			let error = 0;
			let count = 0;
			const minX = Math.max(0, -shiftX);
			const maxX = Math.min(width, width - shiftX);
			const minY = Math.max(0, -shiftY);
			const maxY = Math.min(height, height - shiftY);
			for (let y = minY; y < maxY; y += 2) {
				for (let x = minX; x < maxX; x += 2) {
					const previousValue = previous[y * width + x];
					const currentValue = current[(y + shiftY) * width + x + shiftX];
					error += Math.abs(previousValue - currentValue);
					count += 1;
				}
			}
			const normalizedError = count > 0 ? error / count / 255 : 1;
			const candidateMagnitude = Math.hypot(shiftX, shiftY);
			const bestMagnitude = Math.hypot(bestX, bestY);
			if (
				normalizedError < bestError - 0.000001 ||
				(Math.abs(normalizedError - bestError) <= 0.000001 &&
					candidateMagnitude < bestMagnitude)
			) {
				bestError = normalizedError;
				bestX = shiftX;
				bestY = shiftY;
			}
		}
	}
	return {
		x: bestX,
		y: bestY,
		magnitude: Math.hypot(bestX, bestY),
		residual: bestError,
	};
}

export function directionFromVector({
	x,
	y,
	minMagnitude = 0.4,
}: {
	x: number;
	y: number;
	minMagnitude?: number;
}): MotionDirection {
	if (Math.hypot(x, y) < minMagnitude) return "static";
	const horizontal = Math.abs(x) >= Math.abs(y) * 0.5;
	const vertical = Math.abs(y) >= Math.abs(x) * 0.5;
	if (horizontal && vertical) {
		if (x < 0 && y < 0) return "up-left";
		if (x > 0 && y < 0) return "up-right";
		if (x < 0 && y > 0) return "down-left";
		return "down-right";
	}
	if (horizontal) return x < 0 ? "left" : "right";
	return y < 0 ? "up" : "down";
}

export function buildFrameSamples({
	frames,
	fps,
	width,
	height,
}: {
	frames: Buffer[];
	fps: number;
	width: number;
	height: number;
}): FrameSample[] {
	return frames.map((frame, index) => {
		const appearance = analyzeFrame({ frame, width, height });
		const motion =
			index === 0
				? { x: 0, y: 0, magnitude: 0, residual: 0 }
				: estimateMotion({
						previous: frames[index - 1],
						current: frame,
						width,
						height,
					});
		return {
			time: round({ value: index / fps, digits: 3 }),
			...appearance,
			motionX: round({ value: motion.x }),
			motionY: round({ value: motion.y }),
			motionMagnitude: round({ value: motion.magnitude }),
			motionResidual: round({ value: motion.residual }),
		};
	});
}

function dominantDirection({
	samples,
}: {
	samples: FrameSample[];
}): MotionDirection {
	const moving = samples.filter((sample) => sample.motionMagnitude >= 0.4);
	if (moving.length === 0) return "static";
	const averageX = mean({ values: moving.map((sample) => sample.motionX) });
	const averageY = mean({ values: moving.map((sample) => sample.motionY) });
	const dominant = directionFromVector({ x: averageX, y: averageY });
	const directions = new Set(
		moving.map((sample) =>
			directionFromVector({ x: sample.motionX, y: sample.motionY })
		)
	);
	if (directions.size >= 4 && Math.hypot(averageX, averageY) < 0.8) {
		return "mixed";
	}
	return dominant;
}

export function aggregateRangeMetrics({
	samples,
}: {
	samples: FrameSample[];
}): RangeMetrics {
	if (samples.length === 0) {
		return {
			sharpness: 0,
			stability: 0,
			exposure: 0,
			motionDirection: "static",
			motionMagnitude: 0,
			subjectPosition: "center",
			subjectX: 0.5,
			subjectY: 0.5,
		};
	}
	const sharpness = mean({ values: samples.map((sample) => sample.sharpness) });
	const luma = mean({ values: samples.map((sample) => sample.luma) });
	const contrast = mean({ values: samples.map((sample) => sample.contrast) });
	const exposureDistance = Math.abs(luma - 0.5) / 0.5;
	const exposure = clamp({
		value: 1 - exposureDistance * 0.65 - Math.max(0, 0.2 - contrast),
	});
	const motionX = mean({ values: samples.map((sample) => sample.motionX) });
	const motionY = mean({ values: samples.map((sample) => sample.motionY) });
	const motionJitter = Math.sqrt(
		mean({
			values: samples.map(
				(sample) =>
					(sample.motionX - motionX) ** 2 + (sample.motionY - motionY) ** 2
			),
		})
	);
	const residual = mean({
		values: samples.map((sample) => sample.motionResidual),
	});
	const stability = clamp({
		value: 1 - motionJitter / 4 - residual * 1.6,
	});
	const focusX = mean({ values: samples.map((sample) => sample.focus.x) });
	const focusY = mean({ values: samples.map((sample) => sample.focus.y) });
	return {
		sharpness: round({ value: sharpness }),
		stability: round({ value: stability }),
		exposure: round({ value: exposure }),
		motionDirection: dominantDirection({ samples }),
		motionMagnitude: round({
			value: mean({
				values: samples.map((sample) => sample.motionMagnitude),
			}),
		}),
		subjectPosition: positionFromPoint({ x: focusX, y: focusY }),
		subjectX: round({ value: focusX }),
		subjectY: round({ value: focusY }),
	};
}

export function scoreRangeMetrics({
	metrics,
}: {
	metrics: RangeMetrics;
}): number {
	const motionQuality =
		metrics.motionDirection === "mixed"
			? 0.35
			: metrics.motionDirection === "static"
				? 0.75
				: 1;
	return round({
		value: clamp({
			value:
				metrics.sharpness * 0.34 +
				metrics.stability * 0.36 +
				metrics.exposure * 0.2 +
				motionQuality * 0.1,
		}),
	});
}

export const visualMetricsInternals = {
	analyzeFrame,
	estimateMotion,
	positionFromPoint,
};
