export type CubicPoint = {
	x: number;
	y: number;
};

export type SpatialPoint = number[];

function clampUnit({ value }: { value: number }) {
	return Math.min(1, Math.max(0, value));
}

export function remapProgress({
	progress,
	start,
	end,
}: {
	progress: number;
	start: number;
	end: number;
}) {
	if (!(end > start)) {
		throw new Error("progress range end must be greater than start");
	}
	return clampUnit({ value: (progress - start) / (end - start) });
}

export function threeJsTimelineProgress({ progress }: { progress: number }) {
	return remapProgress({ progress, start: 0.15, end: 0.85 });
}

export function threeJsShaderProgress({ progress }: { progress: number }) {
	return remapProgress({ progress, start: 0.1, end: 0.9 });
}

export function sineEaseInOut({ progress }: { progress: number }) {
	const value = clampUnit({ value: progress });
	return 0.5 * (1 - Math.cos(Math.PI * value));
}

export function quinticEaseInOut({ progress }: { progress: number }) {
	const value = clampUnit({ value: progress });
	if (value < 0.5) {
		return 16 * value ** 5;
	}
	return 1 + 16 * (value - 1) ** 5;
}

export function quadraticEaseInOut({ progress }: { progress: number }) {
	const value = clampUnit({ value: progress });
	if (value < 0.5) {
		return 2 * value * value;
	}
	return 1 - (-2 * value + 2) ** 2 / 2;
}

export function fogBlurIntensity({ progress }: { progress: number }) {
	const value = clampUnit({ value: progress });
	return 4 * value * (1 - value);
}

export function pageCurlCylinderAmount({ progress }: { progress: number }) {
	return 1.66 * clampUnit({ value: progress }) - 0.16;
}

export function horizontalMotionUsesIncomingFrame({
	progress,
}: {
	progress: number;
}) {
	return clampUnit({ value: progress }) >= 13 / 24;
}

function cubicBezier({
	t,
	p0,
	p1,
	p2,
	p3,
}: {
	t: number;
	p0: number;
	p1: number;
	p2: number;
	p3: number;
}) {
	const inverse = 1 - t;
	return (
		inverse ** 3 * p0 +
		3 * inverse ** 2 * t * p1 +
		3 * inverse * t ** 2 * p2 +
		t ** 3 * p3
	);
}

export function solveCubicBezierTime({
	progress,
	control1X,
	control2X,
	epsilon = 0.001,
	maximumIterations = 50,
}: {
	progress: number;
	control1X: number;
	control2X: number;
	epsilon?: number;
	maximumIterations?: number;
}) {
	const target = clampUnit({ value: progress });
	let lower = 0;
	let upper = 1;
	let time = target;
	for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
		time = (lower + upper) / 2;
		const x = cubicBezier({
			t: time,
			p0: 0,
			p1: control1X,
			p2: control2X,
			p3: 1,
		});
		if (Math.abs(x - target) <= epsilon || upper - lower <= epsilon) {
			break;
		}
		if (x < target) {
			lower = time;
			continue;
		}
		upper = time;
	}
	return time;
}

export function evaluateAeTemporalBezier({
	progress,
	startValue,
	endValue,
	control1,
	control2,
}: {
	progress: number;
	startValue: number;
	endValue: number;
	control1: CubicPoint;
	control2: CubicPoint;
}) {
	const time = solveCubicBezierTime({
		progress,
		control1X: control1.x,
		control2X: control2.x,
	});
	const valueDelta = endValue - startValue;
	const offset = cubicBezier({
		t: time,
		p0: 0,
		p1: control1.y,
		p2: control2.y,
		p3: valueDelta,
	});
	return startValue + offset;
}

function evaluateSpatialCubic({
	time,
	start,
	control1,
	control2,
	end,
}: {
	time: number;
	start: SpatialPoint;
	control1: SpatialPoint;
	control2: SpatialPoint;
	end: SpatialPoint;
}) {
	return start.map((coordinate, index) =>
		cubicBezier({
			t: time,
			p0: coordinate,
			p1: control1[index] ?? coordinate,
			p2: control2[index] ?? end[index] ?? coordinate,
			p3: end[index] ?? coordinate,
		})
	);
}

function pointDistance({
	left,
	right,
}: {
	left: SpatialPoint;
	right: SpatialPoint;
}) {
	return Math.sqrt(
		left.reduce((sum, coordinate, index) => {
			const delta = coordinate - (right[index] ?? coordinate);
			return sum + delta * delta;
		}, 0)
	);
}

export function evaluateAeSpatialBezier({
	progress,
	start,
	control1,
	control2,
	end,
	samples = 200,
}: {
	progress: number;
	start: SpatialPoint;
	control1: SpatialPoint;
	control2: SpatialPoint;
	end: SpatialPoint;
	samples?: number;
}) {
	if (start.length === 0 || end.length !== start.length) {
		throw new Error("spatial endpoints must have the same non-zero dimension");
	}
	if (control1.length !== start.length || control2.length !== start.length) {
		throw new Error("spatial controls must match the endpoint dimension");
	}
	if (!Number.isInteger(samples) || samples < 2) {
		throw new Error("spatial samples must be an integer of at least two");
	}

	const points: SpatialPoint[] = [start];
	const cumulativeDistance = [0];
	for (let index = 1; index <= samples; index += 1) {
		const point = evaluateSpatialCubic({
			time: index / samples,
			start,
			control1,
			control2,
			end,
		});
		points.push(point);
		cumulativeDistance.push(
			(cumulativeDistance[index - 1] ?? 0) +
				pointDistance({ left: point, right: points[index - 1] ?? start })
		);
	}

	const totalDistance = cumulativeDistance.at(-1) ?? 0;
	if (totalDistance === 0) {
		return [...start];
	}
	const targetDistance = clampUnit({ value: progress }) * totalDistance;
	let upperIndex = 1;
	while (
		upperIndex < cumulativeDistance.length - 1 &&
		(cumulativeDistance[upperIndex] ?? 0) < targetDistance
	) {
		upperIndex += 1;
	}
	const lowerIndex = upperIndex - 1;
	const lowerDistance = cumulativeDistance[lowerIndex] ?? 0;
	const upperDistance = cumulativeDistance[upperIndex] ?? totalDistance;
	const intervalDistance = upperDistance - lowerDistance;
	const intervalProgress =
		intervalDistance === 0
			? 0
			: (targetDistance - lowerDistance) / intervalDistance;
	const time = (lowerIndex + intervalProgress) / samples;
	return evaluateSpatialCubic({ time, start, control1, control2, end });
}
