import type {
	AnimatedParameter,
	EffectKeyframe,
	EffectParameters,
} from "../types/effects.js";

export const EFFECT_KEYFRAME_PARAMETER_KEYS = [
	"brightness",
	"contrast",
	"saturation",
	"hue",
	"grayscale",
] as const satisfies readonly (keyof EffectParameters)[];

export type EffectKeyframeParameter =
	(typeof EFFECT_KEYFRAME_PARAMETER_KEYS)[number];

export function isEffectKeyframeParameter({
	parameter,
}: {
	parameter: keyof EffectParameters;
}): boolean {
	return EFFECT_KEYFRAME_PARAMETER_KEYS.some(
		(candidate) => candidate === parameter
	);
}

function clampUnit({ value }: { value: number }): number {
	return Math.min(1, Math.max(0, value));
}

function cubicBezierCoordinate({
	time,
	first,
	second,
}: {
	time: number;
	first: number;
	second: number;
}): number {
	const inverse = 1 - time;
	return (
		3 * inverse * inverse * time * first +
		3 * inverse * time * time * second +
		time * time * time
	);
}

function cubicBezierProgress({
	progress,
	controlPoints,
}: {
	progress: number;
	controlPoints: [number, number, number, number];
}): number {
	const [x1, y1, x2, y2] = controlPoints;
	let lower = 0;
	let upper = 1;
	let time = progress;
	for (let iteration = 0; iteration < 12; iteration += 1) {
		time = (lower + upper) / 2;
		const x = cubicBezierCoordinate({ time, first: x1, second: x2 });
		if (x < progress) lower = time;
		else upper = time;
	}
	return cubicBezierCoordinate({ time, first: y1, second: y2 });
}

function applyEasing({
	progress,
	keyframe,
}: {
	progress: number;
	keyframe: EffectKeyframe;
}): number {
	const value = clampUnit({ value: progress });
	switch (keyframe.easing) {
		case "ease-in":
			return value * value;
		case "ease-out":
			return 1 - (1 - value) * (1 - value);
		case "ease-in-out":
			return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
		case "cubic-bezier":
			return keyframe.controlPoints
				? cubicBezierProgress({
						progress: value,
						controlPoints: keyframe.controlPoints,
					})
				: value;
		default:
			return value;
	}
}

export function resolveEffectAnimationValue({
	animation,
	time,
}: {
	animation: AnimatedParameter;
	time: number;
}): number | undefined {
	const keyframes = [...animation.keyframes].sort(
		(left, right) => left.time - right.time
	);
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	if (!first || !last) return;
	if (time <= first.time) return first.value;
	if (time >= last.time) return last.value;

	for (let index = 0; index < keyframes.length - 1; index += 1) {
		const left = keyframes[index];
		const right = keyframes[index + 1];
		if (time < left.time || time > right.time) continue;
		if (animation.interpolation === "step") return left.value;
		const segmentDuration = right.time - left.time;
		if (segmentDuration <= 0) return right.value;
		let progress = applyEasing({
			progress: (time - left.time) / segmentDuration,
			keyframe: left,
		});
		if (animation.interpolation === "smooth") {
			progress = progress * progress * (3 - 2 * progress);
		}
		return left.value + (right.value - left.value) * progress;
	}
	return last.value;
}

export function resolveEffectParametersAtTime({
	parameters,
	animations,
	time,
}: {
	parameters: EffectParameters;
	animations?: readonly AnimatedParameter[];
	time: number;
}): EffectParameters {
	let resolved = { ...parameters };
	for (const animation of animations ?? []) {
		const value = resolveEffectAnimationValue({ animation, time });
		if (value === undefined) continue;
		resolved = { ...resolved, [animation.parameter]: value };
	}
	return resolved;
}

export function upsertEffectKeyframe({
	animations,
	parameter,
	keyframe,
	interpolation = "linear",
	tolerance = 0.001,
}: {
	animations?: readonly AnimatedParameter[];
	parameter: EffectKeyframeParameter;
	keyframe: EffectKeyframe;
	interpolation?: AnimatedParameter["interpolation"];
	tolerance?: number;
}): AnimatedParameter[] {
	const current = animations?.find(
		(animation) => animation.parameter === parameter
	);
	const nextKeyframes = current
		? current.keyframes.some(
				(candidate) => Math.abs(candidate.time - keyframe.time) <= tolerance
			)
			? current.keyframes.map((candidate) =>
					Math.abs(candidate.time - keyframe.time) <= tolerance
						? { ...candidate, ...keyframe }
						: candidate
				)
			: [...current.keyframes, keyframe]
		: [keyframe];
	const nextAnimation: AnimatedParameter = {
		parameter,
		keyframes: nextKeyframes.sort((left, right) => left.time - right.time),
		interpolation: current?.interpolation ?? interpolation,
	};
	return [
		...(animations ?? []).filter(
			(animation) => animation.parameter !== parameter
		),
		nextAnimation,
	];
}

export function removeEffectKeyframe({
	animations,
	parameter,
	time,
	tolerance = 0.001,
}: {
	animations?: readonly AnimatedParameter[];
	parameter: EffectKeyframeParameter;
	time: number;
	tolerance?: number;
}): AnimatedParameter[] | undefined {
	const nextAnimations = (animations ?? []).flatMap((animation) => {
		if (animation.parameter !== parameter) return [animation];
		const keyframes = animation.keyframes.filter(
			(keyframe) => Math.abs(keyframe.time - time) > tolerance
		);
		return keyframes.length > 0 ? [{ ...animation, keyframes }] : [];
	});
	return nextAnimations.length > 0 ? nextAnimations : undefined;
}

export function findEffectKeyframeAtTime({
	animations,
	parameter,
	time,
	tolerance = 0.001,
}: {
	animations?: readonly AnimatedParameter[];
	parameter: EffectKeyframeParameter;
	time: number;
	tolerance?: number;
}): EffectKeyframe | undefined {
	return animations
		?.find((animation) => animation.parameter === parameter)
		?.keyframes.find((keyframe) => Math.abs(keyframe.time - time) <= tolerance);
}

export function trimEffectAnimations({
	animations,
	startTime,
	duration,
}: {
	animations?: readonly AnimatedParameter[];
	startTime: number;
	duration: number;
}): AnimatedParameter[] | undefined {
	if (!animations || duration <= 0) return;
	const endTime = startTime + duration;
	const trimmed = animations.flatMap((animation) => {
		const startValue = resolveEffectAnimationValue({
			animation,
			time: startTime,
		});
		const endValue = resolveEffectAnimationValue({ animation, time: endTime });
		if (startValue === undefined || endValue === undefined) return [];
		const interior = animation.keyframes
			.filter(
				(keyframe) => keyframe.time > startTime && keyframe.time < endTime
			)
			.map((keyframe) => ({
				...keyframe,
				time: keyframe.time - startTime,
			}));
		const keyframes: EffectKeyframe[] = [
			{ time: 0, value: startValue, easing: "linear" },
			...interior,
		];
		if (duration > 0.001) {
			keyframes.push({ time: duration, value: endValue });
		}
		return [{ ...animation, keyframes }];
	});
	return trimmed.length > 0 ? trimmed : undefined;
}
