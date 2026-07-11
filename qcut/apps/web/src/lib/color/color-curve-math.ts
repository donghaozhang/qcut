import type { ColorCurvePoint } from "@/types/timeline";

const MINIMUM_POINT_DISTANCE = 0.000001;
const samplerCache = new WeakMap<
	ColorCurvePoint[],
	(value: number) => number
>();

function finiteUnit(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function sortedUniquePoints({
	points,
}: {
	points: ColorCurvePoint[];
}): ColorCurvePoint[] {
	const sorted = points
		.map((point) => ({
			...point,
			x: finiteUnit(point.x),
			y: finiteUnit(point.y),
		}))
		.sort((left, right) => left.x - right.x);
	const unique: ColorCurvePoint[] = [];
	for (const point of sorted) {
		const previous = unique.at(-1);
		if (previous && Math.abs(previous.x - point.x) < MINIMUM_POINT_DISTANCE) {
			unique[unique.length - 1] = point;
			continue;
		}
		unique.push(point);
	}
	return unique;
}

function endpointSlope({
	firstWidth,
	secondWidth,
	firstDelta,
	secondDelta,
}: {
	firstWidth: number;
	secondWidth: number;
	firstDelta: number;
	secondDelta: number;
}): number {
	let slope =
		((2 * firstWidth + secondWidth) * firstDelta - firstWidth * secondDelta) /
		(firstWidth + secondWidth);
	if (Math.sign(slope) !== Math.sign(firstDelta)) return 0;
	if (
		Math.sign(firstDelta) !== Math.sign(secondDelta) &&
		Math.abs(slope) > Math.abs(3 * firstDelta)
	) {
		slope = 3 * firstDelta;
	}
	return slope;
}

function pchipSlopes({ points }: { points: ColorCurvePoint[] }): number[] {
	if (points.length < 2) return [0];
	const widths: number[] = [];
	const deltas: number[] = [];
	for (let index = 0; index < points.length - 1; index += 1) {
		const width = points[index + 1].x - points[index].x;
		widths.push(width);
		deltas.push((points[index + 1].y - points[index].y) / width);
	}
	if (points.length === 2) return [deltas[0], deltas[0]];
	const slopes = new Array<number>(points.length).fill(0);
	slopes[0] = endpointSlope({
		firstWidth: widths[0],
		secondWidth: widths[1],
		firstDelta: deltas[0],
		secondDelta: deltas[1],
	});
	for (let index = 1; index < points.length - 1; index += 1) {
		const before = deltas[index - 1];
		const after = deltas[index];
		if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
			slopes[index] = 0;
			continue;
		}
		const beforeWidth = widths[index - 1];
		const afterWidth = widths[index];
		const firstWeight = 2 * afterWidth + beforeWidth;
		const secondWeight = afterWidth + 2 * beforeWidth;
		slopes[index] =
			(firstWeight + secondWeight) /
			(firstWeight / before + secondWeight / after);
	}
	slopes[slopes.length - 1] = endpointSlope({
		firstWidth: widths.at(-1) ?? 1,
		secondWidth: widths.at(-2) ?? 1,
		firstDelta: deltas.at(-1) ?? 0,
		secondDelta: deltas.at(-2) ?? 0,
	});
	return slopes;
}

export function createCurveSampler({
	points,
}: {
	points: ColorCurvePoint[];
}): (value: number) => number {
	const sorted = sortedUniquePoints({ points });
	if (sorted.length === 0) return finiteUnit;
	if (sorted.length === 1) return () => sorted[0].y;
	const slopes = pchipSlopes({ points: sorted });
	return (rawValue: number) => {
		const value = finiteUnit(rawValue);
		if (value <= sorted[0].x) return sorted[0].y;
		for (let index = 1; index < sorted.length; index += 1) {
			const to = sorted[index];
			if (value > to.x) continue;
			const from = sorted[index - 1];
			const width = to.x - from.x;
			const progress = (value - from.x) / width;
			const progressSquared = progress * progress;
			const progressCubed = progressSquared * progress;
			return finiteUnit(
				(2 * progressCubed - 3 * progressSquared + 1) * from.y +
					(progressCubed - 2 * progressSquared + progress) *
						width *
						slopes[index - 1] +
					(-2 * progressCubed + 3 * progressSquared) * to.y +
					(progressCubed - progressSquared) * width * slopes[index]
			);
		}
		return sorted.at(-1)?.y ?? value;
	};
}

export function buildCurveSamples({
	points,
	count,
}: {
	points: ColorCurvePoint[];
	count: number;
}): number[] {
	const sample = createCurveSampler({ points });
	const safeCount = Math.max(2, Math.round(count));
	return Array.from({ length: safeCount }, (_, index) =>
		sample(index / (safeCount - 1))
	);
}

export function sampleSmoothCurve({
	points,
	value,
}: {
	points: ColorCurvePoint[];
	value: number;
}): number {
	let sample = samplerCache.get(points);
	if (!sample) {
		sample = createCurveSampler({ points });
		samplerCache.set(points, sample);
	}
	return sample(value);
}

export function sampleCurveValues({
	samples,
	value,
}: {
	samples: number[];
	value: number;
}): number {
	if (samples.length === 0) return finiteUnit(value);
	if (samples.length === 1) return finiteUnit(samples[0]);
	const position = finiteUnit(value) * (samples.length - 1);
	const from = Math.floor(position);
	const to = Math.min(samples.length - 1, from + 1);
	const progress = position - from;
	return finiteUnit(
		(samples[from] ?? value) +
			((samples[to] ?? value) - (samples[from] ?? value)) * progress
	);
}

export function insertCurvePoint({
	points,
	point,
	minimumSpacing,
}: {
	points: ColorCurvePoint[];
	point: ColorCurvePoint;
	minimumSpacing: number;
}): ColorCurvePoint[] {
	const ordered = [...points].sort((left, right) => left.x - right.x);
	const insertionIndex = ordered.findIndex(
		(candidate) => candidate.x >= point.x
	);
	const sliceIndex = insertionIndex < 0 ? ordered.length : insertionIndex;
	const left = ordered[sliceIndex - 1];
	const right = ordered[sliceIndex];
	const minimumX = left ? left.x + minimumSpacing : 0;
	const maximumX = right ? right.x - minimumSpacing : 1;
	if (minimumX > maximumX) return ordered;
	const x = Math.min(maximumX, Math.max(minimumX, finiteUnit(point.x)));
	return [
		...ordered.slice(0, sliceIndex),
		{ ...point, x, y: finiteUnit(point.y) },
		...ordered.slice(sliceIndex),
	];
}
