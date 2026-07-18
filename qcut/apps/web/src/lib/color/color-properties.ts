import type {
	ColorBasicSettings,
	ColorCurvePoint,
	ColorHslRangeName,
	ColorHslRangeSettings,
	ColorKeyframeProperty,
	ColorPropertyKeyframe,
	ColorWheelSettings,
	MediaAdjustments,
	MediaColorSettings,
	MediaElement,
} from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import {
	COLOR_SECONDARY_CURVE_NAMES,
	createDefaultSecondaryCurve,
	normalizeSecondaryCurve,
} from "./color-secondary-curves";
import { resolveColorCurveShapes } from "./color-curve-keyframes";
import {
	DEFAULT_COLOR_FILTER_APPLICATION,
	normalizeColorFilterApplication,
	resolveColorFilterSettings,
} from "@/lib/filters/filter-resolver";

export const COLOR_HSL_RANGES: ColorHslRangeName[] = [
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"magenta",
];

const DEFAULT_HSL_RANGE: ColorHslRangeSettings = {
	hue: 0,
	saturation: 0,
	luminance: 0,
};

const DEFAULT_CURVE: ColorCurvePoint[] = [
	{ id: "black", x: 0, y: 0 },
	{ id: "white", x: 1, y: 1 },
];

const DEFAULT_WHEEL: ColorWheelSettings = { x: 0, y: 0, luminance: 0 };

export const DEFAULT_MEDIA_COLOR_SETTINGS: MediaColorSettings = {
	enabled: true,
	filter: { ...DEFAULT_COLOR_FILTER_APPLICATION },
	basic: {
		enabled: true,
		exposure: 0,
		brightness: 0,
		contrast: 0,
		highlights: 0,
		shadows: 0,
		whites: 0,
		blacks: 0,
		temperature: 0,
		tint: 0,
		saturation: 0,
		vibrance: 0,
		sharpness: 0,
		fade: 0,
		vignette: 0,
		grain: 0,
	},
	lut: {
		enabled: false,
		presetId: "none",
		name: "无",
		intensity: 100,
		skinProtection: 0,
	},
	hsl: {
		enabled: false,
		ranges: Object.fromEntries(
			COLOR_HSL_RANGES.map((range) => [range, { ...DEFAULT_HSL_RANGE }])
		) as Record<ColorHslRangeName, ColorHslRangeSettings>,
	},
	curves: {
		enabled: false,
		mix: 100,
		master: DEFAULT_CURVE.map((point) => ({ ...point })),
		red: DEFAULT_CURVE.map((point) => ({ ...point })),
		green: DEFAULT_CURVE.map((point) => ({ ...point })),
		blue: DEFAULT_CURVE.map((point) => ({ ...point })),
	},
	secondaryCurves: {
		enabled: false,
		mix: 100,
		hueVsSaturation: createDefaultSecondaryCurve(),
		hueVsHue: createDefaultSecondaryCurve(),
		hueVsLuminance: createDefaultSecondaryCurve(),
		luminanceVsSaturation: createDefaultSecondaryCurve(),
		saturationVsSaturation: createDefaultSecondaryCurve(),
	},
	wheels: {
		enabled: false,
		mode: "tonal",
		strength: 100,
		shadows: { ...DEFAULT_WHEEL },
		midtones: { ...DEFAULT_WHEEL },
		highlights: { ...DEFAULT_WHEEL },
		offset: { ...DEFAULT_WHEEL },
		balance: 0,
	},
	smart: {
		enabled: false,
		intensity: 100,
		autoWhiteBalance: true,
		autoTone: true,
		status: "idle",
	},
	mask: { enabled: false, maskIds: [], invert: false },
	management: {
		enabled: false,
		inputSpace: "auto",
		workingSpace: "rec709-linear",
		outputSpace: "rec709",
		toneMapping: "aces",
		peakNits: 100,
	},
	keyframes: {},
	curveShapeKeyframes: {},
};

export interface ColorKeyframeDefinition {
	label: string;
	min: number;
	max: number;
	step: number;
	suffix?: string;
}

export const COLOR_BASIC_KEYFRAME_DEFINITIONS: Partial<
	Record<ColorKeyframeProperty, ColorKeyframeDefinition>
> = {
	"basic.exposure": {
		label: "曝光",
		min: -5,
		max: 5,
		step: 0.1,
		suffix: "EV",
	},
	"basic.brightness": { label: "亮度", min: -100, max: 100, step: 1 },
	"basic.contrast": { label: "对比度", min: -100, max: 100, step: 1 },
	"basic.highlights": { label: "高光", min: -100, max: 100, step: 1 },
	"basic.shadows": { label: "阴影", min: -100, max: 100, step: 1 },
	"basic.whites": { label: "白色色阶", min: -100, max: 100, step: 1 },
	"basic.blacks": { label: "黑色色阶", min: -100, max: 100, step: 1 },
	"basic.temperature": { label: "色温", min: -100, max: 100, step: 1 },
	"basic.tint": { label: "色调", min: -100, max: 100, step: 1 },
	"basic.saturation": { label: "饱和度", min: -100, max: 100, step: 1 },
	"basic.vibrance": { label: "自然饱和度", min: -100, max: 100, step: 1 },
	"basic.sharpness": { label: "锐化", min: 0, max: 100, step: 1 },
	"basic.fade": { label: "褪色", min: 0, max: 100, step: 1 },
	"basic.vignette": { label: "暗角", min: 0, max: 100, step: 1 },
	"basic.grain": { label: "颗粒", min: 0, max: 100, step: 1 },
};

const HSL_KEYFRAME_DEFINITIONS = Object.fromEntries(
	COLOR_HSL_RANGES.flatMap((range) =>
		(["hue", "saturation", "luminance"] as const).map((parameter) => [
			`hsl.${range}.${parameter}`,
			{
				label:
					parameter === "hue"
						? "色相"
						: parameter === "saturation"
							? "饱和度"
							: "明度",
				min: -100,
				max: 100,
				step: 1,
			},
		])
	)
) as Partial<Record<ColorKeyframeProperty, ColorKeyframeDefinition>>;

const WHEEL_KEYFRAME_DEFINITIONS = Object.fromEntries(
	(["shadows", "midtones", "highlights", "offset"] as const).flatMap((wheel) =>
		(["x", "y", "luminance"] as const).map((parameter) => [
			`wheels.${wheel}.${parameter}`,
			{
				label:
					parameter === "luminance"
						? `${wheel[0].toUpperCase()}${wheel.slice(1)} luminance`
						: `${wheel[0].toUpperCase()}${wheel.slice(1)} ${parameter.toUpperCase()}`,
				min: parameter === "luminance" ? -100 : -1,
				max: parameter === "luminance" ? 100 : 1,
				step: parameter === "luminance" ? 1 : 0.01,
			},
		])
	)
) as Partial<Record<ColorKeyframeProperty, ColorKeyframeDefinition>>;

export const COLOR_KEYFRAME_DEFINITIONS: Partial<
	Record<ColorKeyframeProperty, ColorKeyframeDefinition>
> = {
	...COLOR_BASIC_KEYFRAME_DEFINITIONS,
	...HSL_KEYFRAME_DEFINITIONS,
	...WHEEL_KEYFRAME_DEFINITIONS,
	"lut.intensity": {
		label: "强度",
		min: 0,
		max: 100,
		step: 1,
		suffix: "%",
	},
	"lut.skinProtection": {
		label: "肤色保护",
		min: 0,
		max: 100,
		step: 1,
		suffix: "%",
	},
	"curves.mix": { label: "曲线混合", min: 0, max: 100, step: 1, suffix: "%" },
	"secondaryCurves.mix": {
		label: "辅助曲线混合",
		min: 0,
		max: 100,
		step: 1,
		suffix: "%",
	},
	"wheels.strength": { label: "强度", min: 0, max: 100, step: 1 },
	"wheels.balance": { label: "明暗平衡", min: -100, max: 100, step: 1 },
	"smart.intensity": {
		label: "校正混合",
		min: 0,
		max: 100,
		step: 1,
		suffix: "%",
	},
};

type ColorBasicNumericProperty = Exclude<keyof ColorBasicSettings, "enabled">;

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function normalizeCurve({ points }: { points: ColorCurvePoint[] | undefined }) {
	const source = points?.length ? points : DEFAULT_CURVE;
	return source
		.map((point, index) => ({
			id: point.id || `curve-${index}`,
			x: clamp({ value: point.x, min: 0, max: 1 }),
			y: clamp({ value: point.y, min: 0, max: 1 }),
		}))
		.sort((left, right) => left.x - right.x);
}

function legacyBasic({
	adjustments,
}: {
	adjustments: MediaAdjustments | undefined;
}): Partial<ColorBasicSettings> {
	if (!adjustments) return {};
	return {
		brightness: adjustments.brightness,
		contrast: adjustments.contrast,
		saturation: adjustments.saturation,
		temperature: adjustments.temperature,
		tint: adjustments.tint,
		sharpness: adjustments.sharpness,
		fade: adjustments.fade,
		vignette: adjustments.vignette,
	};
}

export function normalizeMediaColorSettings({
	element,
}: {
	element: { color?: MediaColorSettings; adjustments?: MediaAdjustments };
}): MediaColorSettings {
	const stored = element.color as Partial<MediaColorSettings> | undefined;
	const basic = {
		...DEFAULT_MEDIA_COLOR_SETTINGS.basic,
		...legacyBasic({ adjustments: element.adjustments }),
		...stored?.basic,
	};
	const ranges = Object.fromEntries(
		COLOR_HSL_RANGES.map((range) => [
			range,
			{
				...DEFAULT_MEDIA_COLOR_SETTINGS.hsl.ranges[range],
				...stored?.hsl?.ranges?.[range],
			},
		])
	) as Record<ColorHslRangeName, ColorHslRangeSettings>;
	return {
		...DEFAULT_MEDIA_COLOR_SETTINGS,
		...stored,
		filter: normalizeColorFilterApplication({ filter: stored?.filter }),
		basic,
		lut: { ...DEFAULT_MEDIA_COLOR_SETTINGS.lut, ...stored?.lut },
		hsl: { ...DEFAULT_MEDIA_COLOR_SETTINGS.hsl, ...stored?.hsl, ranges },
		curves: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.curves,
			...stored?.curves,
			master: normalizeCurve({ points: stored?.curves?.master }),
			red: normalizeCurve({ points: stored?.curves?.red }),
			green: normalizeCurve({ points: stored?.curves?.green }),
			blue: normalizeCurve({ points: stored?.curves?.blue }),
		},
		secondaryCurves: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.secondaryCurves,
			...stored?.secondaryCurves,
			...Object.fromEntries(
				COLOR_SECONDARY_CURVE_NAMES.map((name) => [
					name,
					normalizeSecondaryCurve({ curve: stored?.secondaryCurves?.[name] }),
				])
			),
		},
		wheels: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.wheels,
			...stored?.wheels,
			shadows: {
				...DEFAULT_MEDIA_COLOR_SETTINGS.wheels.shadows,
				...stored?.wheels?.shadows,
			},
			midtones: {
				...DEFAULT_MEDIA_COLOR_SETTINGS.wheels.midtones,
				...stored?.wheels?.midtones,
			},
			highlights: {
				...DEFAULT_MEDIA_COLOR_SETTINGS.wheels.highlights,
				...stored?.wheels?.highlights,
			},
			offset: {
				...DEFAULT_MEDIA_COLOR_SETTINGS.wheels.offset,
				...stored?.wheels?.offset,
			},
		},
		smart: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.smart,
			...stored?.smart,
			correction: stored?.smart?.correction
				? { ...stored.smart.correction }
				: undefined,
		},
		mask: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.mask,
			...stored?.mask,
			maskIds: [...(stored?.mask?.maskIds ?? [])],
		},
		management: {
			...DEFAULT_MEDIA_COLOR_SETTINGS.management,
			...stored?.management,
		},
		keyframes: Object.fromEntries(
			Object.entries(stored?.keyframes ?? {}).map(([property, keyframes]) => [
				property,
				keyframes?.map((keyframe) => ({ ...keyframe })),
			])
		) as MediaColorSettings["keyframes"],
		curveShapeKeyframes: Object.fromEntries(
			Object.entries(stored?.curveShapeKeyframes ?? {}).map(
				([property, keyframes]) => [
					property,
					keyframes?.map((keyframe) => ({
						...keyframe,
						points: keyframe.points.map((point) => ({ ...point })),
						samples: keyframe.samples ? [...keyframe.samples] : undefined,
					})),
				]
			)
		) as MediaColorSettings["curveShapeKeyframes"],
	};
}

export function buildLegacyColorAdjustments({
	settings,
}: {
	settings: MediaColorSettings;
}): MediaAdjustments {
	return {
		brightness: settings.basic.brightness,
		contrast: settings.basic.contrast,
		saturation: settings.basic.saturation,
		temperature: settings.basic.temperature,
		tint: settings.basic.tint,
		sharpness: settings.basic.sharpness,
		fade: settings.basic.fade,
		vignette: settings.basic.vignette,
	};
}

export function getColorPropertyValue({
	settings,
	property,
}: {
	settings: MediaColorSettings;
	property: ColorKeyframeProperty;
}): number {
	if (property.startsWith("basic.")) {
		return settings.basic[property.slice(6) as ColorBasicNumericProperty];
	}
	if (property.startsWith("hsl.")) {
		const [, range, parameter] = property.split(".") as [
			"hsl",
			ColorHslRangeName,
			keyof ColorHslRangeSettings,
		];
		return settings.hsl.ranges[range][parameter];
	}
	if (property.startsWith("wheels.")) {
		const [, wheel, parameter] = property.split(".");
		if (wheel === "strength") return settings.wheels.strength;
		if (wheel === "balance") return settings.wheels.balance;
		return settings.wheels[
			wheel as "shadows" | "midtones" | "highlights" | "offset"
		][parameter as keyof ColorWheelSettings];
	}
	switch (property) {
		case "lut.intensity":
			return settings.lut.intensity;
		case "lut.skinProtection":
			return settings.lut.skinProtection;
		case "curves.mix":
			return settings.curves.mix;
		case "secondaryCurves.mix":
			return settings.secondaryCurves.mix;
		case "smart.intensity":
			return settings.smart.intensity;
	}
	throw new Error(`Unsupported color property: ${property}`);
}

export function setColorPropertyValue({
	settings,
	property,
	value,
}: {
	settings: MediaColorSettings;
	property: ColorKeyframeProperty;
	value: number;
}): MediaColorSettings {
	if (property.startsWith("basic.")) {
		const basicProperty = property.slice(6) as ColorBasicNumericProperty;
		const definition = COLOR_BASIC_KEYFRAME_DEFINITIONS[property];
		const next = definition
			? clamp({ value, min: definition.min, max: definition.max })
			: value;
		return { ...settings, basic: { ...settings.basic, [basicProperty]: next } };
	}
	if (property.startsWith("hsl.")) {
		const [, range, parameter] = property.split(".") as [
			"hsl",
			ColorHslRangeName,
			keyof ColorHslRangeSettings,
		];
		return {
			...settings,
			hsl: {
				...settings.hsl,
				ranges: {
					...settings.hsl.ranges,
					[range]: { ...settings.hsl.ranges[range], [parameter]: value },
				},
			},
		};
	}
	if (property.startsWith("wheels.")) {
		const [, wheel, parameter] = property.split(".");
		if (wheel === "strength") {
			return { ...settings, wheels: { ...settings.wheels, strength: value } };
		}
		if (wheel === "balance") {
			return { ...settings, wheels: { ...settings.wheels, balance: value } };
		}
		const wheelName = wheel as "shadows" | "midtones" | "highlights" | "offset";
		return {
			...settings,
			wheels: {
				...settings.wheels,
				[wheelName]: {
					...settings.wheels[wheelName],
					[parameter as keyof ColorWheelSettings]: value,
				},
			},
		};
	}
	switch (property) {
		case "lut.intensity":
			return { ...settings, lut: { ...settings.lut, intensity: value } };
		case "lut.skinProtection":
			return { ...settings, lut: { ...settings.lut, skinProtection: value } };
		case "curves.mix":
			return { ...settings, curves: { ...settings.curves, mix: value } };
		case "secondaryCurves.mix":
			return {
				...settings,
				secondaryCurves: { ...settings.secondaryCurves, mix: value },
			};
		case "smart.intensity":
			return { ...settings, smart: { ...settings.smart, intensity: value } };
	}
	throw new Error(`Unsupported color property: ${property}`);
}

export function resolveMediaColorAtTime({
	element,
	currentTime,
	fps,
}: {
	element: {
		startTime: number;
		color?: MediaColorSettings;
		adjustments?: MediaAdjustments;
	};
	currentTime: number;
	fps: number;
}): MediaColorSettings {
	let settings = normalizeMediaColorSettings({ element });
	const localFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	for (const [property, keyframes] of Object.entries(
		settings.keyframes ?? {}
	) as Array<[ColorKeyframeProperty, ColorPropertyKeyframe[] | undefined]>) {
		if (!keyframes?.length) continue;
		settings = setColorPropertyValue({
			settings,
			property,
			value: interpolateNumber(keyframes as Keyframe[], localFrame),
		});
	}
	return resolveColorFilterSettings({
		settings: resolveColorCurveShapes({ settings, frame: localFrame }),
	});
}

export function upsertColorKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: ColorPropertyKeyframe[];
	keyframe: ColorPropertyKeyframe;
}): ColorPropertyKeyframe[] {
	return [
		...keyframes.filter(
			(item) => item.id !== keyframe.id && item.frame !== keyframe.frame
		),
		keyframe,
	].sort((left, right) => left.frame - right.frame);
}

export function removeColorKeyframes({
	settings,
	properties,
}: {
	settings: MediaColorSettings;
	properties: ColorKeyframeProperty[];
}): MediaColorSettings {
	const removed = new Set(properties);
	return {
		...settings,
		keyframes: Object.fromEntries(
			Object.entries(settings.keyframes ?? {}).filter(
				([property]) => !removed.has(property as ColorKeyframeProperty)
			)
		) as MediaColorSettings["keyframes"],
	};
}

export function hasMediaColorEdits({
	settings,
}: {
	settings: MediaColorSettings;
}): boolean {
	if (!settings.enabled) return false;
	const basicChanged = (
		Object.keys(COLOR_BASIC_KEYFRAME_DEFINITIONS) as ColorKeyframeProperty[]
	).some((property) => getColorPropertyValue({ settings, property }) !== 0);
	return (
		(settings.filter.presetId !== "none" && settings.filter.intensity > 0) ||
		(settings.basic.enabled && basicChanged) ||
		settings.lut.enabled ||
		settings.hsl.enabled ||
		settings.curves.enabled ||
		settings.secondaryCurves.enabled ||
		settings.wheels.enabled ||
		settings.smart.enabled ||
		settings.management.enabled
	);
}
