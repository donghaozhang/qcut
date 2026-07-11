import type {
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaMaskTracking,
	MediaMaskTrackingDirection,
	MediaPropertyKeyframe,
} from "@/types/timeline";

export interface MediaMaskTrackingSample {
	frame: number;
	centerX: number;
	centerY: number;
	width: number;
	height: number;
	rotation?: number;
}

const TRACKED_PROPERTIES = [
	"centerX",
	"centerY",
	"width",
	"height",
] as const satisfies MediaMaskKeyframeProperty[];

function clamp01(value: number) {
	return Math.min(1, Math.max(0, value));
}

export function alphaMaskTrackingSample({
	alpha,
	width,
	height,
	frame,
	threshold = 0.05,
	padding = 0.02,
}: {
	alpha: Float32Array;
	width: number;
	height: number;
	frame: number;
	threshold?: number;
	padding?: number;
}): MediaMaskTrackingSample | null {
	if (width <= 0 || height <= 0 || alpha.length !== width * height) return null;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let index = 0; index < alpha.length; index += 1) {
		if (alpha[index] < threshold) continue;
		const x = index % width;
		const y = Math.floor(index / width);
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	if (maxX < minX || maxY < minY) return null;
	const left = clamp01(minX / width - padding);
	const top = clamp01(minY / height - padding);
	const right = clamp01((maxX + 1) / width + padding);
	const bottom = clamp01((maxY + 1) / height + padding);
	return {
		frame,
		centerX: (left + right) / 2,
		centerY: (top + bottom) / 2,
		width: Math.max(0.001, right - left),
		height: Math.max(0.001, bottom - top),
	};
}

function interpolationError({
	from,
	to,
	sample,
}: {
	from: MediaMaskTrackingSample;
	to: MediaMaskTrackingSample;
	sample: MediaMaskTrackingSample;
}) {
	const progress =
		to.frame === from.frame
			? 0
			: (sample.frame - from.frame) / (to.frame - from.frame);
	return Math.max(
		...TRACKED_PROPERTIES.map((property) => {
			const expected =
				from[property] + (to[property] - from[property]) * progress;
			return Math.abs(sample[property] - expected);
		})
	);
}

export function simplifyMaskTrackingSamples({
	samples,
	tolerance = 0.003,
}: {
	samples: MediaMaskTrackingSample[];
	tolerance?: number;
}): MediaMaskTrackingSample[] {
	const sorted = [...samples]
		.sort((first, second) => first.frame - second.frame)
		.filter(
			(sample, index, list) =>
				index === 0 || sample.frame !== list[index - 1].frame
		);
	if (sorted.length <= 2) return sorted;
	const keep = new Set([0, sorted.length - 1]);
	const ranges: Array<[number, number]> = [[0, sorted.length - 1]];
	while (ranges.length > 0) {
		const [start, end] = ranges.pop()!;
		let largestError = tolerance;
		let splitIndex = -1;
		for (let index = start + 1; index < end; index += 1) {
			const error = interpolationError({
				from: sorted[start],
				to: sorted[end],
				sample: sorted[index],
			});
			if (error <= largestError) continue;
			largestError = error;
			splitIndex = index;
		}
		if (splitIndex < 0) continue;
		keep.add(splitIndex);
		ranges.push([start, splitIndex], [splitIndex, end]);
	}
	return sorted.filter((_, index) => keep.has(index));
}

function trackedKeyframes({
	mask,
	property,
	samples,
}: {
	mask: MediaMask;
	property: (typeof TRACKED_PROPERTIES)[number];
	samples: MediaMaskTrackingSample[];
}): MediaPropertyKeyframe[] {
	const firstFrame = samples[0].frame;
	const lastFrame = samples[samples.length - 1].frame;
	const outsideRange = (mask.keyframes?.[property] ?? []).filter(
		(keyframe) => keyframe.frame < firstFrame || keyframe.frame > lastFrame
	);
	const tracked = samples.map((sample) => ({
		id: `${mask.id ?? "mask"}-tracking-${property}-${sample.frame}`,
		frame: sample.frame,
		value: sample[property],
		easing: "linear" as const,
	}));
	return [...outsideRange, ...tracked].sort(
		(first, second) => first.frame - second.frame
	);
}

export function applyMaskTrackingSamples({
	mask,
	samples,
	direction,
	anchorFrame,
	source,
	sourceFrameOffset = 0,
	maxFrame = Number.POSITIVE_INFINITY,
	tolerance = 0.003,
}: {
	mask: MediaMask;
	samples: MediaMaskTrackingSample[];
	direction: MediaMaskTrackingDirection;
	anchorFrame: number;
	source: NonNullable<MediaMaskTracking["source"]>;
	sourceFrameOffset?: number;
	maxFrame?: number;
	tolerance?: number;
}): MediaMask {
	const localSamples = samples
		.map((sample) => ({
			...sample,
			frame: Math.round(sample.frame - sourceFrameOffset),
		}))
		.filter((sample) => sample.frame >= 0 && sample.frame <= maxFrame)
		.filter((sample) => {
			if (direction === "forward") return sample.frame >= anchorFrame;
			if (direction === "backward") return sample.frame <= anchorFrame;
			return true;
		});
	const simplified = simplifyMaskTrackingSamples({
		samples: localSamples,
		tolerance,
	});
	if (simplified.length === 0) {
		return {
			...mask,
			tracking: {
				direction,
				source,
				status: "error",
				error: "No trackable mask samples were found",
			},
		};
	}
	const keyframes = { ...mask.keyframes };
	for (const property of TRACKED_PROPERTIES) {
		keyframes[property] = trackedKeyframes({
			mask,
			property,
			samples: simplified,
		});
	}
	return {
		...mask,
		keyframes,
		tracking: {
			direction,
			source,
			status: "ready",
		},
	};
}
