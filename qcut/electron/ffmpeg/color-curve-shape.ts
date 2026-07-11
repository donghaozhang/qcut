import type {
	VideoColorCurveShapeKeyframe,
	VideoColorSettings,
} from "./color-settings";

interface CurvePoint {
	id: string;
	x: number;
	y: number;
}

const SAMPLE_COUNT = 257;

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function sortedUniquePoints({
	points,
}: {
	points: CurvePoint[];
}): CurvePoint[] {
	const sorted = points
		.map((point) => ({ ...point, x: clamp01(point.x), y: clamp01(point.y) }))
		.sort((left, right) => left.x - right.x);
	const unique: CurvePoint[] = [];
	for (const point of sorted) {
		const previous = unique[unique.length - 1];
		if (previous && Math.abs(previous.x - point.x) < 0.000001) {
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

function slopes({ points }: { points: CurvePoint[] }): number[] {
	if (points.length < 2) return [0];
	const widths: number[] = [];
	const deltas: number[] = [];
	for (let index = 0; index < points.length - 1; index += 1) {
		const width = points[index + 1].x - points[index].x;
		widths.push(width);
		deltas.push((points[index + 1].y - points[index].y) / width);
	}
	if (points.length === 2) return [deltas[0], deltas[0]];
	const result = new Array<number>(points.length).fill(0);
	result[0] = endpointSlope({
		firstWidth: widths[0],
		secondWidth: widths[1],
		firstDelta: deltas[0],
		secondDelta: deltas[1],
	});
	for (let index = 1; index < points.length - 1; index += 1) {
		const before = deltas[index - 1];
		const after = deltas[index];
		if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) {
			result[index] = 0;
			continue;
		}
		const beforeWidth = widths[index - 1];
		const afterWidth = widths[index];
		const firstWeight = 2 * afterWidth + beforeWidth;
		const secondWeight = afterWidth + 2 * beforeWidth;
		result[index] =
			(firstWeight + secondWeight) /
			(firstWeight / before + secondWeight / after);
	}
	result[result.length - 1] = endpointSlope({
		firstWidth: widths[widths.length - 1] ?? 1,
		secondWidth: widths[widths.length - 2] ?? 1,
		firstDelta: deltas[deltas.length - 1] ?? 0,
		secondDelta: deltas[deltas.length - 2] ?? 0,
	});
	return result;
}

function curveSampler({ points }: { points: CurvePoint[] }) {
	const sorted = sortedUniquePoints({ points });
	if (sorted.length === 0) return clamp01;
	if (sorted.length === 1) return () => sorted[0].y;
	const derivatives = slopes({ points: sorted });
	return (rawValue: number) => {
		const value = clamp01(rawValue);
		if (value <= sorted[0].x) return sorted[0].y;
		for (let index = 1; index < sorted.length; index += 1) {
			const to = sorted[index];
			if (value > to.x) continue;
			const from = sorted[index - 1];
			const width = to.x - from.x;
			const progress = (value - from.x) / width;
			const squared = progress * progress;
			const cubed = squared * progress;
			return clamp01(
				(2 * cubed - 3 * squared + 1) * from.y +
					(cubed - 2 * squared + progress) * width * derivatives[index - 1] +
					(-2 * cubed + 3 * squared) * to.y +
					(cubed - squared) * width * derivatives[index]
			);
		}
		return sorted[sorted.length - 1]?.y ?? value;
	};
}

function samplesFromPoints({ points }: { points: CurvePoint[] }): number[] {
	const sample = curveSampler({ points });
	return Array.from({ length: SAMPLE_COUNT }, (_, index) =>
		sample(index / (SAMPLE_COUNT - 1))
	);
}

function easedProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: VideoColorCurveShapeKeyframe["easing"];
}): number {
	if (easing === "easeIn") return progress ** 2;
	if (easing === "easeOut") return 1 - (1 - progress) ** 2;
	if (easing === "easeInOut") return progress ** 2 * (3 - 2 * progress);
	if (easing === "spring") {
		return progress + Math.sin(progress * Math.PI) * 0.15 * (1 - progress);
	}
	return progress;
}

function surroundingKeyframes({
	keyframes,
	frame,
}: {
	keyframes: VideoColorCurveShapeKeyframe[];
	frame: number;
}): {
	from: VideoColorCurveShapeKeyframe;
	to: VideoColorCurveShapeKeyframe;
	progress: number;
} {
	const sorted = [...keyframes].sort((left, right) => left.frame - right.frame);
	if (frame <= sorted[0].frame) {
		return { from: sorted[0], to: sorted[0], progress: 0 };
	}
	for (let index = 1; index < sorted.length; index += 1) {
		const to = sorted[index];
		if (frame > to.frame) continue;
		const from = sorted[index - 1];
		const progress = (frame - from.frame) / Math.max(1, to.frame - from.frame);
		return {
			from,
			to,
			progress: easedProgress({ progress, easing: to.easing }),
		};
	}
	const last = sorted[sorted.length - 1] ?? sorted[0];
	return { from: last, to: last, progress: 0 };
}

function shapeAtFrame({
	keyframes,
	frame,
}: {
	keyframes: VideoColorCurveShapeKeyframe[];
	frame: number;
}): { points: CurvePoint[]; samples: number[] } {
	const { from, to, progress } = surroundingKeyframes({ keyframes, frame });
	const fromSamples = from.samples?.length
		? from.samples
		: samplesFromPoints({ points: from.points });
	if (from === to) {
		return {
			points: from.points.map((point) => ({ ...point })),
			samples: [...fromSamples],
		};
	}
	const toSamples = to.samples?.length
		? to.samples
		: samplesFromPoints({ points: to.points });
	const sampleCount = Math.max(2, fromSamples.length, toSamples.length);
	const read = ({ samples, index }: { samples: number[]; index: number }) => {
		const position = (index / (sampleCount - 1)) * (samples.length - 1);
		const before = Math.floor(position);
		const after = Math.min(samples.length - 1, before + 1);
		const amount = position - before;
		return (
			(samples[before] ?? 0.5) +
			((samples[after] ?? 0.5) - (samples[before] ?? 0.5)) * amount
		);
	};
	const samples = Array.from({ length: sampleCount }, (_, index) => {
		const fromValue = read({ samples: fromSamples, index });
		return (
			fromValue + (read({ samples: toSamples, index }) - fromValue) * progress
		);
	});
	const readInterpolatedSample = (position: number) => {
		const samplePosition = position * (samples.length - 1);
		const before = Math.floor(samplePosition);
		const after = Math.min(samples.length - 1, before + 1);
		const amount = samplePosition - before;
		return (
			(samples[before] ?? 0.5) +
			((samples[after] ?? 0.5) - (samples[before] ?? 0.5)) * amount
		);
	};
	return {
		points: Array.from({ length: 65 }, (_, index) => {
			const x = index / 64;
			return {
				id: `interpolated-${index}`,
				x,
				y: readInterpolatedSample(x),
			};
		}),
		samples,
	};
}

export function curveShapeFrames({
	color,
	prefix,
}: {
	color: VideoColorSettings;
	prefix: "curves." | "secondaryCurves.";
}): number[] {
	const frames = new Set<number>();
	for (const [property, keyframes] of Object.entries(
		color.curveShapeKeyframes ?? {}
	)) {
		if (!property.startsWith(prefix)) continue;
		for (const keyframe of keyframes ?? []) frames.add(keyframe.frame);
	}
	return [...frames].sort((left, right) => left - right);
}

export function curveShapeEasingAtFrame({
	color,
	prefix,
	frame,
}: {
	color: VideoColorSettings;
	prefix: "curves." | "secondaryCurves.";
	frame: number;
}): VideoColorCurveShapeKeyframe["easing"] {
	for (const [property, keyframes] of Object.entries(
		color.curveShapeKeyframes ?? {}
	)) {
		if (!property.startsWith(prefix)) continue;
		const keyframe = keyframes?.find((candidate) => candidate.frame === frame);
		if (keyframe) return keyframe.easing;
	}
	return "linear";
}

export function resolveVideoCurveShapes({
	color,
	frame,
}: {
	color: VideoColorSettings;
	frame: number;
}): VideoColorSettings {
	const resolved = structuredClone(color);
	for (const [property, keyframes] of Object.entries(
		color.curveShapeKeyframes ?? {}
	)) {
		if (!keyframes?.length) continue;
		const [group, name] = property.split(".");
		const shape = shapeAtFrame({ keyframes, frame });
		if (group === "curves") {
			resolved.curves[name as "master" | "red" | "green" | "blue"] =
				shape.points;
			continue;
		}
		if (group === "secondaryCurves") {
			const curveName = name as keyof Omit<
				VideoColorSettings["secondaryCurves"],
				"enabled" | "mix"
			>;
			resolved.secondaryCurves[curveName] = shape;
		}
	}
	return resolved;
}
