import type {
	TextElement,
	TextKeyframeProperty,
	TextPropertyKeyframe,
} from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";

export const TEXT_KEYFRAME_PROPERTIES: Array<{
	value: TextKeyframeProperty;
	label: string;
}> = [
	{ value: "x", label: "X position" },
	{ value: "y", label: "Y position" },
	{ value: "rotation", label: "Rotation" },
	{ value: "opacity", label: "Opacity" },
	{ value: "fontSize", label: "Font size" },
];

export function getTextKeyframeValue({
	element,
	property,
	currentTime,
	fps,
}: {
	element: TextElement;
	property: TextKeyframeProperty;
	currentTime: number;
	fps: number;
}): number {
	const keyframes = element.keyframes?.[property];
	if (!keyframes || keyframes.length === 0) return element[property];
	const localFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	return interpolateNumber(keyframes as Keyframe[], localFrame);
}

export function resolveTextKeyframes(
	element: TextElement,
	currentTime: number,
	fps: number
): TextElement {
	if (!element.keyframes) return element;
	return {
		...element,
		x: getTextKeyframeValue({ element, property: "x", currentTime, fps }),
		y: getTextKeyframeValue({ element, property: "y", currentTime, fps }),
		rotation: getTextKeyframeValue({
			element,
			property: "rotation",
			currentTime,
			fps,
		}),
		opacity: getTextKeyframeValue({
			element,
			property: "opacity",
			currentTime,
			fps,
		}),
		fontSize: getTextKeyframeValue({
			element,
			property: "fontSize",
			currentTime,
			fps,
		}),
	};
}

export function upsertTextKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: TextPropertyKeyframe[];
	keyframe: TextPropertyKeyframe;
}): TextPropertyKeyframe[] {
	// Drop the entry being replaced and any other keyframe already sitting on
	// the target frame: two keyframes on one frame make interpolation ambiguous.
	const next = keyframes.filter(
		(item) => item.id !== keyframe.id && item.frame !== keyframe.frame
	);
	next.push(keyframe);
	return next.sort((a, b) => a.frame - b.frame);
}

function easingExpression(
	progress: string,
	easing: TextPropertyKeyframe["easing"]
): string {
	if (easing === "easeIn") return `pow(${progress},2)`;
	if (easing === "easeOut") return `1-pow(1-${progress},2)`;
	if (easing === "easeInOut") {
		return `if(lt(${progress},0.5),2*pow(${progress},2),1-pow(-2*${progress}+2,2)/2)`;
	}
	if (easing === "spring") {
		return `${progress}+sin(${progress}*PI)*0.15*(1-${progress})`;
	}
	return progress;
}

export function buildFFmpegKeyframeExpression({
	element,
	property,
	fps,
}: {
	element: TextElement;
	property: TextKeyframeProperty;
	fps: number;
}): string | undefined {
	const keyframes = [...(element.keyframes?.[property] ?? [])].sort(
		(a, b) => a.frame - b.frame
	);
	if (keyframes.length === 0) return undefined;
	if (keyframes.length === 1) return String(keyframes[0].value);

	const timeAt = (frame: number) => element.startTime + frame / fps;
	let expression = String(keyframes.at(-1)?.value ?? element[property]);
	for (let index = keyframes.length - 2; index >= 0; index--) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const start = timeAt(from.frame);
		const end = timeAt(to.frame);
		const duration = Math.max(0.001, end - start);
		const progress = `(t-${start})/${duration}`;
		const eased = easingExpression(progress, to.easing);
		const value = `${from.value}+(${to.value}-${from.value})*(${eased})`;
		expression = `if(lt(t,${end}),${value},${expression})`;
	}
	return `if(lt(t,${timeAt(keyframes[0].frame)}),${keyframes[0].value},${expression})`;
}
