import type { VideoVisual } from "./types";
import type { VideoColorPropertyKeyframe } from "./color-settings";

interface RuntimeProperty {
	property: string;
	fallback: number;
}

function easingExpression({
	progress,
	easing,
}: {
	progress: string;
	easing: string;
}) {
	if (easing === "easeIn") return `(${progress})*(${progress})`;
	if (easing === "easeOut") return `1-(1-(${progress}))*(1-(${progress}))`;
	if (easing === "easeInOut")
		return `(${progress})*(${progress})*(3-2*(${progress}))`;
	if (easing === "spring")
		return `${progress}+sin(${progress}*PI)*0.15*(1-${progress})`;
	return progress;
}

function sortedKeyframes({
	visual,
	property,
}: {
	visual: VideoVisual;
	property: string;
}): VideoColorPropertyKeyframe[] {
	return [...(visual.color?.keyframes?.[property] ?? [])].sort(
		(left, right) => left.frame - right.frame
	);
}

function interpolateNumeric({
	from,
	to,
	frame,
}: {
	from: VideoColorPropertyKeyframe;
	to: VideoColorPropertyKeyframe;
	frame: number;
}): number {
	const progress = Math.min(
		1,
		Math.max(0, (frame - from.frame) / Math.max(1, to.frame - from.frame))
	);
	let eased = progress;
	if (to.easing === "easeIn") eased = progress ** 2;
	if (to.easing === "easeOut") eased = 1 - (1 - progress) ** 2;
	if (to.easing === "easeInOut") eased = progress ** 2 * (3 - 2 * progress);
	if (to.easing === "spring") {
		eased = progress + Math.sin(progress * Math.PI) * 0.15 * (1 - progress);
	}
	return from.value + (to.value - from.value) * eased;
}

export function colorValueAtFrame({
	visual,
	property,
	fallback,
	frame,
}: {
	visual: VideoVisual;
	property: string;
	fallback: number;
	frame: number;
}): number {
	const keyframes = sortedKeyframes({ visual, property });
	if (keyframes.length === 0) return fallback;
	if (frame <= keyframes[0].frame) return keyframes[0].value;
	for (let index = 1; index < keyframes.length; index += 1) {
		const to = keyframes[index];
		if (frame > to.frame) continue;
		return interpolateNumeric({ from: keyframes[index - 1], to, frame });
	}
	return keyframes[keyframes.length - 1].value;
}

export function hasColorKeyframes({
	visual,
	property,
}: {
	visual: VideoVisual;
	property: string;
}): boolean {
	return (visual.color?.keyframes?.[property]?.length ?? 0) > 0;
}

export function buildColorKeyframeExpression({
	visual,
	property,
	fallback,
	timeVariable = "t",
}: {
	visual: VideoVisual;
	property: string;
	fallback: number;
	timeVariable?: string;
}): string {
	const keyframes = sortedKeyframes({ visual, property });
	if (keyframes.length === 0) return String(fallback);
	if (keyframes.length === 1) return String(keyframes[0].value);
	const fps = Math.max(1, visual.keyframeFps || 30);
	const timeAt = (frame: number) => frame / fps;
	let expression = String(keyframes[keyframes.length - 1].value);
	for (let index = keyframes.length - 2; index >= 0; index -= 1) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		const end = timeAt(to.frame);
		const progress = `(${timeVariable}-${timeAt(from.frame)})/${Math.max(0.001, end - timeAt(from.frame))}`;
		const eased = easingExpression({ progress, easing: to.easing });
		const value = `(${from.value})+((${to.value})-(${from.value}))*(${eased})`;
		expression = `if(lt(${timeVariable},${end}),${value},${expression})`;
	}
	return `if(lt(${timeVariable},${timeAt(keyframes[0].frame)}),${keyframes[0].value},${expression})`;
}

function segmentEasing({
	visual,
	properties,
	endFrame,
}: {
	visual: VideoVisual;
	properties: RuntimeProperty[];
	endFrame: number;
}): string {
	for (const property of properties) {
		const keyframe = sortedKeyframes({
			visual,
			property: property.property,
		}).find((item) => item.frame === endFrame);
		if (keyframe) return keyframe.easing;
	}
	return "linear";
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	return String(Math.round(value * 1_000_000) / 1_000_000);
}

export function buildRuntimeColorFilter({
	visual,
	filterName,
	instanceId,
	properties,
	fixedOptions = {},
	optionsAtFrame,
}: {
	visual: VideoVisual;
	filterName: string;
	instanceId: string;
	properties: RuntimeProperty[];
	fixedOptions?: Record<string, string | number>;
	optionsAtFrame: ({
		frame,
		value,
	}: {
		frame: number;
		value: ({ property, fallback }: RuntimeProperty) => number;
	}) => Record<string, number>;
}): string {
	const fps = Math.max(1, visual.keyframeFps || 30);
	const frames = new Set<number>([0]);
	for (const property of properties) {
		for (const keyframe of sortedKeyframes({
			visual,
			property: property.property,
		})) {
			frames.add(keyframe.frame);
		}
	}
	const sortedFrames = [...frames].sort((left, right) => left - right);
	const valuesAt = (frame: number) =>
		optionsAtFrame({
			frame,
			value: ({ property, fallback }) =>
				colorValueAtFrame({ visual, property, fallback, frame }),
		});
	const initialOptions = valuesAt(0);
	const target = `${filterName}@${instanceId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
	const optionString = Object.entries({ ...fixedOptions, ...initialOptions })
		.map(([option, value]) => `${option}=${value}`)
		.join(":");
	const commands: string[] = [];
	for (let index = 1; index < sortedFrames.length; index += 1) {
		const startFrame = sortedFrames[index - 1];
		const endFrame = sortedFrames[index];
		if (endFrame <= startFrame) continue;
		const startOptions = valuesAt(startFrame);
		const endOptions = valuesAt(endFrame);
		const progress = easingExpression({
			progress: "TI",
			easing: segmentEasing({ visual, properties, endFrame }),
		});
		for (const [option, startValue] of Object.entries(startOptions)) {
			const endValue = endOptions[option] ?? startValue;
			const argument =
				`${formatNumber(startValue)}+` +
				`(${formatNumber(endValue)}-${formatNumber(startValue)})*(${progress})`;
			commands.push(
				`${formatNumber(startFrame / fps)}-${formatNumber(endFrame / fps)} ` +
					`[expr] ${target} ${option} ${argument}`
			);
			commands.push(
				`${formatNumber(endFrame / fps)} ${target} ${option} ${formatNumber(endValue)}`
			);
		}
	}
	if (commands.length === 0) return `${filterName}=${optionString}`;
	return `sendcmd=c='${commands.join(";")}',${target}=${optionString}`;
}
