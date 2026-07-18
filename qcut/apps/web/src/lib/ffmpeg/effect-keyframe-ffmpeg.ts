import type { AnimatedParameter, EffectKeyframe } from "@qcut/editor-core";

export type EffectKeyframeValueTransform =
	| "brightness"
	| "contrast"
	| "saturation"
	| "hue"
	| "grayscale";

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

function transformValue({
	value,
	transform,
}: {
	value: number;
	transform: EffectKeyframeValueTransform;
}): number {
	switch (transform) {
		case "brightness":
			return clamp({ value: value / 100, minimum: -1, maximum: 1 });
		case "contrast":
		case "saturation":
			return clamp({ value: 1 + value / 100, minimum: 0, maximum: 3 });
		case "grayscale":
			return clamp({ value: 1 - value / 100, minimum: 0, maximum: 1 });
		case "hue":
			return value;
	}
}

function formatNumber({ value }: { value: number }): string {
	return Number(value.toFixed(6)).toString();
}

function easingExpression({
	progress,
	keyframe,
}: {
	progress: string;
	keyframe: EffectKeyframe;
}): string {
	switch (keyframe.easing) {
		case "ease-in":
			return `(${progress})*(${progress})`;
		case "ease-out":
			return `1-(1-(${progress}))*(1-(${progress}))`;
		case "ease-in-out":
			return `if(lt(${progress},0.5),2*(${progress})*(${progress}),1-pow(-2*(${progress})+2,2)/2)`;
		case "cubic-bezier": {
			const [, firstY, , secondY] = keyframe.controlPoints ?? [0, 0, 1, 1];
			return `3*pow(1-(${progress}),2)*(${progress})*${formatNumber({ value: firstY })}+3*(1-(${progress}))*pow(${progress},2)*${formatNumber({ value: secondY })}+pow(${progress},3)`;
		}
		default:
			return progress;
	}
}

function segmentExpression({
	left,
	right,
	interpolation,
	transform,
	timeOffset,
}: {
	left: EffectKeyframe;
	right: EffectKeyframe;
	interpolation: AnimatedParameter["interpolation"];
	transform: EffectKeyframeValueTransform;
	timeOffset: number;
}): string {
	const leftValue = transformValue({ value: left.value, transform });
	const rightValue = transformValue({ value: right.value, transform });
	if (interpolation === "step" || right.time <= left.time) {
		return formatNumber({ value: leftValue });
	}
	const start = left.time + timeOffset;
	const duration = right.time - left.time;
	const progress = `(t-${formatNumber({ value: start })})/${formatNumber({ value: duration })}`;
	let eased = easingExpression({ progress, keyframe: left });
	if (interpolation === "smooth") {
		eased = `(${eased})*(${eased})*(3-2*(${eased}))`;
	}
	return `${formatNumber({ value: leftValue })}+(${formatNumber({ value: rightValue - leftValue })})*(${eased})`;
}

export function buildEffectKeyframeExpression({
	animation,
	transform,
	timeOffset = 0,
}: {
	animation: AnimatedParameter;
	transform: EffectKeyframeValueTransform;
	timeOffset?: number;
}): string | undefined {
	const keyframes = animation.keyframes
		.filter(
			(keyframe) =>
				Number.isFinite(keyframe.time) && Number.isFinite(keyframe.value)
		)
		.sort((left, right) => left.time - right.time);
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	if (!first || !last) return;
	let expression = formatNumber({
		value: transformValue({ value: last.value, transform }),
	});
	for (let index = keyframes.length - 2; index >= 0; index -= 1) {
		const left = keyframes[index];
		const right = keyframes[index + 1];
		const segment = segmentExpression({
			left,
			right,
			interpolation: animation.interpolation,
			transform,
			timeOffset,
		});
		expression = `if(lt(t,${formatNumber({ value: right.time + timeOffset })}),${segment},${expression})`;
	}
	const firstValue = formatNumber({
		value: transformValue({ value: first.value, transform }),
	});
	return `if(lt(t,${formatNumber({ value: first.time + timeOffset })}),${firstValue},${expression})`;
}
