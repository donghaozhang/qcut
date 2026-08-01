export const DEFAULT_VISUAL_RMSE_THRESHOLD = 8;

export interface RgbErrorMetrics {
	channelSampleCount: number;
	mae: number;
	max: number;
	p95: number;
	pixelCount: number;
	rmse: number;
}

export interface RgbComparisonResult {
	metrics: RgbErrorMetrics;
	pass: boolean;
	rmseThreshold: number;
}

function roundMetric({ value }: { value: number }): number {
	return Number(value.toFixed(6));
}

function validateRgbBuffers({
	actual,
	expected,
}: {
	actual: Uint8Array;
	expected: Uint8Array;
}): void {
	if (
		expected.length === 0 ||
		expected.length !== actual.length ||
		expected.length % 3 !== 0
	) {
		throw new Error(
			"RGB comparator requires equally sized, non-empty RGB24 buffers."
		);
	}
}

export function computeRgbErrorMetrics({
	actual,
	expected,
}: {
	actual: Uint8Array;
	expected: Uint8Array;
}): RgbErrorMetrics {
	validateRgbBuffers({ actual, expected });
	const absoluteErrors = new Array<number>(expected.length);
	let absoluteSum = 0;
	let squaredSum = 0;
	let maximum = 0;
	for (let index = 0; index < expected.length; index += 1) {
		const error = Math.abs((expected[index] ?? 0) - (actual[index] ?? 0));
		absoluteErrors[index] = error;
		absoluteSum += error;
		squaredSum += error * error;
		maximum = Math.max(maximum, error);
	}
	absoluteErrors.sort((left, right) => left - right);
	const p95Index = Math.max(0, Math.ceil(absoluteErrors.length * 0.95) - 1);
	return {
		channelSampleCount: expected.length,
		mae: roundMetric({ value: absoluteSum / expected.length }),
		max: maximum,
		p95: absoluteErrors[p95Index] ?? maximum,
		pixelCount: expected.length / 3,
		rmse: roundMetric({ value: Math.sqrt(squaredSum / expected.length) }),
	};
}

export function compareRgbBuffers({
	actual,
	expected,
	rmseThreshold = DEFAULT_VISUAL_RMSE_THRESHOLD,
}: {
	actual: Uint8Array;
	expected: Uint8Array;
	rmseThreshold?: number;
}): RgbComparisonResult {
	if (!Number.isFinite(rmseThreshold) || rmseThreshold < 0) {
		throw new Error("RGB RMSE threshold must be a finite non-negative number.");
	}
	const metrics = computeRgbErrorMetrics({ actual, expected });
	return {
		metrics,
		pass: metrics.rmse <= rmseThreshold,
		rmseThreshold,
	};
}
