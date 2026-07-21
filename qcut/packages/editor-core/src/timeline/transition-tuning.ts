import type {
	ClipTransition,
	ClipTransitionTuning,
	ClipTransitionTuningKeyframe,
	ClipTransitionTuningKeyframes,
	ClipTransitionTuningProperty,
	ClipTransitionType,
} from "../types/timeline.js";

export interface ClipTransitionTuningControl {
	property: ClipTransitionTuningProperty;
	label: string;
	kind: "number" | "color";
	defaultValue: number | string;
	min?: number;
	max?: number;
	step?: number;
}

export interface ResolvedClipTransitionTuning {
	intensity: number;
	frequency: number;
	tint?: string;
}

const INTENSITY_CONTROL = {
	property: "intensity",
	kind: "number",
	defaultValue: 1,
	min: 0.1,
	max: 2,
	step: 0.05,
} as const;

const FREQUENCY_CONTROL = {
	property: "frequency",
	kind: "number",
	defaultValue: 1,
	min: 0.1,
	max: 4,
	step: 0.1,
} as const;

const TUNING_CONTROLS: Partial<
	Record<ClipTransitionType, ClipTransitionTuningControl[]>
> = {
	"zoom-blur": [{ ...INTENSITY_CONTROL, label: "模糊强度" }],
	"whip-pan": [{ ...INTENSITY_CONTROL, label: "甩镜强度" }],
	flash: [
		{ ...INTENSITY_CONTROL, label: "闪光强度" },
		{
			property: "tint",
			label: "闪光颜色",
			kind: "color",
			defaultValue: "#ffffff",
		},
	],
	"light-leak": [
		{ ...INTENSITY_CONTROL, label: "漏光强度" },
		{ ...FREQUENCY_CONTROL, label: "色彩变化" },
		{
			property: "tint",
			label: "漏光颜色",
			kind: "color",
			defaultValue: "#ff5a1f",
		},
	],
	"rgb-glitch": [
		{ ...INTENSITY_CONTROL, label: "错位强度" },
		{ ...FREQUENCY_CONTROL, label: "故障频率" },
	],
	shake: [
		{ ...INTENSITY_CONTROL, label: "抖动强度" },
		{ ...FREQUENCY_CONTROL, label: "抖动频率" },
	],
	"motion-blur": [{ ...INTENSITY_CONTROL, label: "拖影强度" }],
	pixelate: [{ ...INTENSITY_CONTROL, label: "马赛克大小" }],
	"water-ripple": [
		{ ...INTENSITY_CONTROL, label: "波纹强度" },
		{ ...FREQUENCY_CONTROL, label: "波纹频率" },
	],
	"particle-dissolve": [
		{ ...INTENSITY_CONTROL, label: "溶解范围" },
		{ ...FREQUENCY_CONTROL, label: "粒子密度" },
	],
	"glass-refraction": [
		{ ...INTENSITY_CONTROL, label: "折射强度" },
		{ ...FREQUENCY_CONTROL, label: "玻璃分片" },
	],
	"page-flip": [{ ...INTENSITY_CONTROL, label: "立体阴影" }],
	"texture-mask": [{ ...FREQUENCY_CONTROL, label: "纹理密度" }],
	vortex: [{ ...INTENSITY_CONTROL, label: "旋转强度" }],
	cube: [{ ...INTENSITY_CONTROL, label: "立体阴影" }],
	"color-swipe": [
		{
			property: "tint",
			label: "色块颜色",
			kind: "color",
			defaultValue: "#ffd233",
		},
	],
	shockwave: [
		{ ...INTENSITY_CONTROL, label: "冲击强度" },
		{ ...FREQUENCY_CONTROL, label: "波纹密度" },
	],
	"lens-flare": [
		{ ...INTENSITY_CONTROL, label: "光斑强度" },
		{
			property: "tint",
			label: "光斑颜色",
			kind: "color",
			defaultValue: "#ffd6a1",
		},
	],
};

const DIRECTIONAL_TYPES = new Set<ClipTransitionType>([
	"slide",
	"wipe",
	"push",
	"whip-pan",
	"motion-blur",
	"glass-refraction",
	"page-flip",
]);

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

function normalizedPosition({ position }: { position: number }): number {
	return clamp({ value: position, min: 0, max: 1 });
}

function easeKeyframeProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: ClipTransitionTuningKeyframe["easing"];
}): number {
	const value = clamp({ value: progress, min: 0, max: 1 });
	switch (easing) {
		case "easeIn":
			return value ** 3;
		case "easeOut":
			return 1 - (1 - value) ** 3;
		case "easeInOut":
			return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
		case "linear":
			return value;
	}
}

function sortedKeyframes<T extends ClipTransitionTuningKeyframe>({
	keyframes,
}: {
	keyframes: T[];
}): T[] {
	return [...keyframes].sort(
		(left, right) =>
			normalizedPosition({ position: left.position }) -
			normalizedPosition({ position: right.position })
	);
}

function surroundingKeyframes<T extends ClipTransitionTuningKeyframe>({
	keyframes,
	position,
}: {
	keyframes: T[];
	position: number;
}): [T, T] | null {
	const sorted = sortedKeyframes({ keyframes });
	if (sorted.length === 0) return null;
	const current = normalizedPosition({ position });
	if (current <= normalizedPosition({ position: sorted[0].position })) {
		return [sorted[0], sorted[0]];
	}
	const last = sorted.at(-1)!;
	if (current >= normalizedPosition({ position: last.position })) {
		return [last, last];
	}
	const nextIndex = sorted.findIndex(
		(keyframe) => normalizedPosition({ position: keyframe.position }) >= current
	);
	return [sorted[nextIndex - 1], sorted[nextIndex]];
}

function segmentProgress({
	from,
	to,
	position,
}: {
	from: ClipTransitionTuningKeyframe;
	to: ClipTransitionTuningKeyframe;
	position: number;
}) {
	const fromPosition = normalizedPosition({ position: from.position });
	const toPosition = normalizedPosition({ position: to.position });
	if (fromPosition === toPosition) return 0;
	return easeKeyframeProgress({
		progress: (position - fromPosition) / (toPosition - fromPosition),
		easing: to.easing,
	});
}

function numericKeyframeValue({
	keyframes,
	position,
	fallback,
}: {
	keyframes: ClipTransitionTuningKeyframe[] | undefined;
	position: number;
	fallback: number;
}): number {
	const numeric = (keyframes ?? []).filter(
		(keyframe): keyframe is ClipTransitionTuningKeyframe & { value: number } =>
			typeof keyframe.value === "number" && Number.isFinite(keyframe.value)
	);
	const surrounding = surroundingKeyframes({ keyframes: numeric, position });
	if (!surrounding) return fallback;
	const [from, to] = surrounding;
	const progress = segmentProgress({ from, to, position });
	return from.value + (to.value - from.value) * progress;
}

function parseHexColor({
	color,
}: {
	color: string;
}): [number, number, number] | null {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
	if (!match) return null;
	return [
		Number.parseInt(match[1], 16),
		Number.parseInt(match[2], 16),
		Number.parseInt(match[3], 16),
	];
}

function colorKeyframeValue({
	keyframes,
	position,
	fallback,
}: {
	keyframes: ClipTransitionTuningKeyframe[] | undefined;
	position: number;
	fallback: string | undefined;
}): string | undefined {
	const colors = (keyframes ?? []).filter(
		(keyframe): keyframe is ClipTransitionTuningKeyframe & { value: string } =>
			typeof keyframe.value === "string" &&
			parseHexColor({ color: keyframe.value }) !== null
	);
	const surrounding = surroundingKeyframes({ keyframes: colors, position });
	if (!surrounding) return fallback;
	const [from, to] = surrounding;
	const fromColor = parseHexColor({ color: from.value })!;
	const toColor = parseHexColor({ color: to.value })!;
	const progress = segmentProgress({ from, to, position });
	const channel = ({ index }: { index: number }) =>
		Math.round(
			fromColor[index] + (toColor[index] - fromColor[index]) * progress
		)
			.toString(16)
			.padStart(2, "0");
	return `#${channel({ index: 0 })}${channel({ index: 1 })}${channel({ index: 2 })}`;
}

export function getClipTransitionTuningControls({
	type,
}: {
	type: ClipTransitionType;
}): ClipTransitionTuningControl[] {
	return TUNING_CONTROLS[type] ?? [];
}

export function clipTransitionSupportsDirection({
	type,
}: {
	type: ClipTransitionType;
}): boolean {
	return DIRECTIONAL_TYPES.has(type);
}

export function resolveClipTransitionTuning({
	transition,
	progress,
}: {
	transition: ClipTransition;
	progress: number;
}): ResolvedClipTransitionTuning {
	const keyframes = transition.tuningKeyframes;
	const intensity = numericKeyframeValue({
		keyframes: keyframes?.intensity,
		position: progress,
		fallback: transition.tuning?.intensity ?? 1,
	});
	const frequency = numericKeyframeValue({
		keyframes: keyframes?.frequency,
		position: progress,
		fallback: transition.tuning?.frequency ?? 1,
	});
	return {
		intensity: clamp({ value: intensity, min: 0.1, max: 2 }),
		frequency: clamp({ value: frequency, min: 0.1, max: 4 }),
		tint: colorKeyframeValue({
			keyframes: keyframes?.tint,
			position: progress,
			fallback: transition.tuning?.tint,
		}),
	};
}

export function getClipTransitionTuningValue({
	transition,
	property,
	progress,
	defaultValue,
}: {
	transition: ClipTransition;
	property: ClipTransitionTuningProperty;
	progress: number;
	defaultValue: number | string;
}): number | string {
	const resolved = resolveClipTransitionTuning({ transition, progress });
	return resolved[property] ?? defaultValue;
}

export function upsertClipTransitionTuningKeyframe({
	keyframes,
	property,
	keyframe,
}: {
	keyframes: ClipTransitionTuningKeyframes | undefined;
	property: ClipTransitionTuningProperty;
	keyframe: ClipTransitionTuningKeyframe;
}): ClipTransitionTuningKeyframes {
	const position = normalizedPosition({ position: keyframe.position });
	const current = keyframes?.[property] ?? [];
	const existingIndex = current.findIndex(
		(item) => Math.abs(item.position - position) < 1e-6
	);
	const next = [...current];
	if (existingIndex >= 0) {
		next[existingIndex] = { ...keyframe, position };
	} else {
		next.push({ ...keyframe, position });
	}
	return {
		...keyframes,
		[property]: sortedKeyframes({ keyframes: next }),
	};
}

export function removeClipTransitionTuningKeyframe({
	keyframes,
	property,
	position,
}: {
	keyframes: ClipTransitionTuningKeyframes | undefined;
	property: ClipTransitionTuningProperty;
	position: number;
}): ClipTransitionTuningKeyframes {
	return {
		...keyframes,
		[property]: (keyframes?.[property] ?? []).filter(
			(keyframe) => Math.abs(keyframe.position - position) >= 1e-6
		),
	};
}

export function transitionTuningDefaults({
	type,
}: {
	type: ClipTransitionType;
}): ClipTransitionTuning {
	const tuning: ClipTransitionTuning = {};
	for (const control of getClipTransitionTuningControls({ type })) {
		switch (control.property) {
			case "intensity":
				tuning.intensity = Number(control.defaultValue);
				break;
			case "frequency":
				tuning.frequency = Number(control.defaultValue);
				break;
			case "tint":
				tuning.tint = String(control.defaultValue);
				break;
		}
	}
	return tuning;
}
