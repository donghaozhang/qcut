import type {
	MediaKeyframeProperty,
	MediaMask,
	MediaPropertyKeyframe,
} from "@/types/timeline";

type TrackedMaskProperty = "centerX" | "centerY" | "width" | "height";
type SmartToolName = "smart-motion" | "smart-crop" | "camera-tracking";

interface TrackedMaskSample {
	frame: number;
	centerX: number;
	centerY: number;
	width: number;
	height: number;
}

interface PreparedTracking {
	maxFrame: number;
	samples: TrackedMaskSample[];
}

interface PlannedValue {
	frame: number;
	value: number;
}

export interface MediaLabSmartToolParams {
	mask: MediaMask;
	canvasWidth: number;
	canvasHeight: number;
	clipDuration: number;
	fps: number;
}

export interface MediaLabBaseTransformUpdates {
	x?: number;
	y?: number;
	scaleX?: number;
	scaleY?: number;
}

export interface MediaLabSmartToolPlan {
	keyframes: Partial<Record<MediaKeyframeProperty, MediaPropertyKeyframe[]>>;
	baseTransformUpdates: MediaLabBaseTransformUpdates;
}

const TRACKED_MASK_PROPERTIES = [
	"centerX",
	"centerY",
	"width",
	"height",
] as const satisfies TrackedMaskProperty[];

const EMPTY_PLAN = (): MediaLabSmartToolPlan => ({
	keyframes: {},
	baseTransformUpdates: {},
});

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, value));
}

function rounded({ value }: { value: number }) {
	const result = Math.round(value * 1_000_000) / 1_000_000;
	return Object.is(result, -0) ? 0 : result;
}

function normalizedMaskValue({
	property,
	value,
}: {
	property: TrackedMaskProperty;
	value: number;
}): number | null {
	if (!Number.isFinite(value)) return null;
	if (property === "width" || property === "height") {
		if (value <= 0) return null;
		return clamp({ value, min: 0.01, max: 1 });
	}
	return clamp({ value, min: 0, max: 1 });
}

function normalizedTrack({
	mask,
	property,
	maxFrame,
}: {
	mask: MediaMask;
	property: TrackedMaskProperty;
	maxFrame: number;
}): MediaPropertyKeyframe[] {
	const byFrame = new Map<number, MediaPropertyKeyframe>();
	for (const keyframe of mask.keyframes?.[property] ?? []) {
		if (!Number.isFinite(keyframe.frame)) continue;
		const frame = Math.round(keyframe.frame);
		if (frame < 0 || frame > maxFrame) continue;
		const value = normalizedMaskValue({ property, value: keyframe.value });
		if (value === null) continue;
		byFrame.set(frame, { ...keyframe, frame, value });
	}
	return [...byFrame.values()].sort(
		(first, second) => first.frame - second.frame
	);
}

function fallbackMaskValue({
	mask,
	property,
}: {
	mask: MediaMask;
	property: TrackedMaskProperty;
}) {
	const normalized = normalizedMaskValue({ property, value: mask[property] });
	if (normalized !== null) return normalized;
	return 0.5;
}

function interpolatedTrackValue({
	track,
	frame,
	fallback,
}: {
	track: MediaPropertyKeyframe[];
	frame: number;
	fallback: number;
}) {
	if (track.length === 0) return fallback;
	const first = track[0];
	const last = track.at(-1) ?? first;
	if (frame <= first.frame) return first.value;
	if (frame >= last.frame) return last.value;

	for (let index = 1; index < track.length; index += 1) {
		const next = track[index];
		if (frame > next.frame) continue;
		const previous = track[index - 1];
		const span = next.frame - previous.frame;
		if (span <= 0) return next.value;
		const progress = (frame - previous.frame) / span;
		return previous.value + (next.value - previous.value) * progress;
	}
	return last.value;
}

function boundedSample({
	sample,
}: {
	sample: TrackedMaskSample;
}): TrackedMaskSample {
	const width = clamp({ value: sample.width, min: 0.01, max: 1 });
	const height = clamp({ value: sample.height, min: 0.01, max: 1 });
	return {
		...sample,
		centerX: clamp({
			value: sample.centerX,
			min: width / 2,
			max: 1 - width / 2,
		}),
		centerY: clamp({
			value: sample.centerY,
			min: height / 2,
			max: 1 - height / 2,
		}),
		width,
		height,
	};
}

function smoothSamples({
	samples,
	strength,
}: {
	samples: TrackedMaskSample[];
	strength: number;
}): TrackedMaskSample[] {
	if (samples.length < 3) {
		return samples.map((sample) => boundedSample({ sample }));
	}
	return samples.map((sample, index) => {
		if (index === 0 || index === samples.length - 1) {
			return boundedSample({ sample });
		}
		const previous = samples[index - 1];
		const next = samples[index + 1];
		const span = next.frame - previous.frame;
		const progress = span > 0 ? (sample.frame - previous.frame) / span : 0.5;
		const smoothed = { ...sample };
		for (const property of TRACKED_MASK_PROPERTIES) {
			const interpolated =
				previous[property] + (next[property] - previous[property]) * progress;
			smoothed[property] =
				sample[property] * (1 - strength) + interpolated * strength;
		}
		return boundedSample({ sample: smoothed });
	});
}

function prepareTracking({
	mask,
	clipDuration,
	fps,
}: Pick<
	MediaLabSmartToolParams,
	"mask" | "clipDuration" | "fps"
>): PreparedTracking | null {
	if (
		!Number.isFinite(clipDuration) ||
		clipDuration <= 0 ||
		!Number.isFinite(fps) ||
		fps <= 0
	) {
		return null;
	}
	const maxFrame = Math.max(0, Math.round(clipDuration * fps));
	const tracks = Object.fromEntries(
		TRACKED_MASK_PROPERTIES.map((property) => [
			property,
			normalizedTrack({ mask, property, maxFrame }),
		])
	) as Record<TrackedMaskProperty, MediaPropertyKeyframe[]>;
	if (
		TRACKED_MASK_PROPERTIES.every((property) => tracks[property].length === 0)
	) {
		return null;
	}

	const frames = new Set<number>([0, maxFrame]);
	for (const property of TRACKED_MASK_PROPERTIES) {
		for (const keyframe of tracks[property]) frames.add(keyframe.frame);
	}
	const samples = [...frames]
		.sort((first, second) => first - second)
		.map((frame) => {
			const sample = { frame } as TrackedMaskSample;
			for (const property of TRACKED_MASK_PROPERTIES) {
				sample[property] = interpolatedTrackValue({
					track: tracks[property],
					frame,
					fallback: fallbackMaskValue({ mask, property }),
				});
			}
			return sample;
		});
	return { maxFrame, samples };
}

function plannedKeyframes({
	mask,
	tool,
	property,
	values,
}: {
	mask: MediaMask;
	tool: SmartToolName;
	property: MediaKeyframeProperty;
	values: PlannedValue[];
}): MediaPropertyKeyframe[] {
	const maskId = mask.id?.trim() || "mask";
	return values.map(({ frame, value }) => ({
		id: `${maskId}-media-lab-${tool}-${property}-${frame}`,
		frame,
		value: rounded({ value }),
		easing: "easeInOut",
	}));
}

function buildPlan({
	mask,
	tool,
	values,
}: {
	mask: MediaMask;
	tool: SmartToolName;
	values: Partial<Record<"x" | "y" | "scaleX" | "scaleY", PlannedValue[]>>;
}): MediaLabSmartToolPlan {
	const keyframes: MediaLabSmartToolPlan["keyframes"] = {};
	const baseTransformUpdates: MediaLabBaseTransformUpdates = {};
	for (const property of ["x", "y", "scaleX", "scaleY"] as const) {
		const propertyValues = values[property];
		if (!propertyValues?.length) continue;
		keyframes[property] = plannedKeyframes({
			mask,
			tool,
			property,
			values: propertyValues,
		});
		baseTransformUpdates[property] = rounded({
			value: propertyValues[0].value,
		});
	}
	return { keyframes, baseTransformUpdates };
}

function hasValidCanvas({
	canvasWidth,
	canvasHeight,
}: Pick<MediaLabSmartToolParams, "canvasWidth" | "canvasHeight">) {
	return (
		Number.isFinite(canvasWidth) &&
		canvasWidth > 0 &&
		Number.isFinite(canvasHeight) &&
		canvasHeight > 0
	);
}

export function planExperimentalSmartMotion({
	mask,
	canvasWidth,
	canvasHeight,
	clipDuration,
	fps,
}: MediaLabSmartToolParams): MediaLabSmartToolPlan {
	if (!hasValidCanvas({ canvasWidth, canvasHeight })) return EMPTY_PLAN();
	const tracking = prepareTracking({ mask, clipDuration, fps });
	if (!tracking) return EMPTY_PLAN();
	const samples = smoothSamples({ samples: tracking.samples, strength: 0.65 });
	const values = {
		x: [] as PlannedValue[],
		y: [] as PlannedValue[],
		scaleX: [] as PlannedValue[],
		scaleY: [] as PlannedValue[],
	};
	for (const sample of samples) {
		const progress =
			tracking.maxFrame > 0 ? sample.frame / tracking.maxFrame : 0;
		const scale = 1.04 + progress * 0.1;
		values.x.push({
			frame: sample.frame,
			value: clamp({
				value: -(sample.centerX - 0.5) * canvasWidth * scale * 0.3,
				min: -canvasWidth * 0.12,
				max: canvasWidth * 0.12,
			}),
		});
		values.y.push({
			frame: sample.frame,
			value: clamp({
				value: -(sample.centerY - 0.48) * canvasHeight * scale * 0.25,
				min: -canvasHeight * 0.1,
				max: canvasHeight * 0.1,
			}),
		});
		values.scaleX.push({ frame: sample.frame, value: scale });
		values.scaleY.push({ frame: sample.frame, value: scale });
	}
	return buildPlan({ mask, tool: "smart-motion", values });
}

export function planExperimentalSmartCrop({
	mask,
	canvasWidth,
	canvasHeight,
	clipDuration,
	fps,
}: MediaLabSmartToolParams): MediaLabSmartToolPlan {
	if (!hasValidCanvas({ canvasWidth, canvasHeight })) return EMPTY_PLAN();
	const tracking = prepareTracking({ mask, clipDuration, fps });
	if (!tracking) return EMPTY_PLAN();
	const samples = smoothSamples({ samples: tracking.samples, strength: 0.55 });
	const values = {
		x: [] as PlannedValue[],
		y: [] as PlannedValue[],
		scaleX: [] as PlannedValue[],
		scaleY: [] as PlannedValue[],
	};
	for (const sample of samples) {
		const desiredScale = Math.min(0.72 / sample.width, 0.78 / sample.height);
		const scale = clamp({ value: desiredScale, min: 1, max: 2.75 });
		const halfSubjectWidth = Math.min(0.5, (sample.width * scale) / 2);
		const halfSubjectHeight = Math.min(0.5, (sample.height * scale) / 2);
		const targetCenterX = clamp({
			value: 0.5,
			min: halfSubjectWidth,
			max: 1 - halfSubjectWidth,
		});
		const targetCenterY = clamp({
			value: 0.46,
			min: halfSubjectHeight,
			max: 1 - halfSubjectHeight,
		});
		const safeOffsetX = ((scale - 1) * canvasWidth) / 2;
		const safeOffsetY = ((scale - 1) * canvasHeight) / 2;
		values.x.push({
			frame: sample.frame,
			value: clamp({
				value:
					(targetCenterX - 0.5) * canvasWidth -
					(sample.centerX - 0.5) * canvasWidth * scale,
				min: -safeOffsetX,
				max: safeOffsetX,
			}),
		});
		values.y.push({
			frame: sample.frame,
			value: clamp({
				value:
					(targetCenterY - 0.5) * canvasHeight -
					(sample.centerY - 0.5) * canvasHeight * scale,
				min: -safeOffsetY,
				max: safeOffsetY,
			}),
		});
		values.scaleX.push({ frame: sample.frame, value: scale });
		values.scaleY.push({ frame: sample.frame, value: scale });
	}
	return buildPlan({ mask, tool: "smart-crop", values });
}

export function planExperimentalCameraTracking({
	mask,
	canvasWidth,
	canvasHeight,
	clipDuration,
	fps,
}: MediaLabSmartToolParams): MediaLabSmartToolPlan {
	if (!hasValidCanvas({ canvasWidth, canvasHeight })) return EMPTY_PLAN();
	const tracking = prepareTracking({ mask, clipDuration, fps });
	if (!tracking) return EMPTY_PLAN();
	const samples = smoothSamples({ samples: tracking.samples, strength: 0.7 });
	const values = {
		x: samples.map((sample) => ({
			frame: sample.frame,
			value: clamp({
				value: -(sample.centerX - 0.5) * canvasWidth,
				min: -canvasWidth * 0.5,
				max: canvasWidth * 0.5,
			}),
		})),
		y: samples.map((sample) => ({
			frame: sample.frame,
			value: clamp({
				value: -(sample.centerY - 0.5) * canvasHeight,
				min: -canvasHeight * 0.5,
				max: canvasHeight * 0.5,
			}),
		})),
	};
	return buildPlan({ mask, tool: "camera-tracking", values });
}
