import type {
	ColorCurvePoint,
	ColorSecondaryCurve,
	ColorSecondaryCurveName,
	ColorSecondaryCurvesSettings,
} from "@/types/timeline";
import { buildCurveSamples, sampleCurveValues } from "./color-curve-math";
import { clamp01, hslToRgb, rgbToHsl, type RgbColor } from "./color-space-math";

export const SECONDARY_CURVE_SAMPLE_COUNT = 257;

export const COLOR_SECONDARY_CURVE_NAMES: ColorSecondaryCurveName[] = [
	"hueVsSaturation",
	"hueVsHue",
	"hueVsLuminance",
	"luminanceVsSaturation",
	"saturationVsSaturation",
];

export const DEFAULT_SECONDARY_CURVE_POINTS: ColorCurvePoint[] = [
	{ id: "start", x: 0, y: 0.5 },
	{ id: "end", x: 1, y: 0.5 },
];

export function buildSecondaryCurve({
	points,
}: {
	points: ColorCurvePoint[];
}): ColorSecondaryCurve {
	const normalizedPoints = points
		.map((point, index) => ({
			id: point.id || `secondary-curve-${index}`,
			x: clamp01(point.x),
			y: clamp01(point.y),
		}))
		.sort((left, right) => left.x - right.x);
	return {
		points: normalizedPoints,
		samples: buildCurveSamples({
			points: normalizedPoints,
			count: SECONDARY_CURVE_SAMPLE_COUNT,
		}),
	};
}

export function createDefaultSecondaryCurve(): ColorSecondaryCurve {
	return buildSecondaryCurve({
		points: DEFAULT_SECONDARY_CURVE_POINTS.map((point) => ({ ...point })),
	});
}

export function normalizeSecondaryCurve({
	curve,
}: {
	curve: Partial<ColorSecondaryCurve> | undefined;
}): ColorSecondaryCurve {
	return buildSecondaryCurve({
		points:
			curve?.points?.length && curve.points.length >= 2
				? curve.points
				: DEFAULT_SECONDARY_CURVE_POINTS,
	});
}

function adjustment({
	curve,
	input,
}: {
	curve: ColorSecondaryCurve;
	input: number;
}) {
	return (
		(sampleCurveValues({ samples: curve.samples, value: input }) - 0.5) * 2
	);
}

export function hasSecondaryCurveAdjustments({
	settings,
}: {
	settings: ColorSecondaryCurvesSettings;
}): boolean {
	return COLOR_SECONDARY_CURVE_NAMES.some((name) =>
		settings[name].samples.some((sample) => Math.abs(sample - 0.5) > 0.000001)
	);
}

export function applySecondaryCurves({
	color,
	settings,
}: {
	color: RgbColor;
	settings: ColorSecondaryCurvesSettings;
}): RgbColor {
	if (
		!settings.enabled ||
		settings.mix <= 0 ||
		!hasSecondaryCurveAdjustments({ settings })
	) {
		return color;
	}
	const source = rgbToHsl(color);
	const amount = clamp01(settings.mix / 100);
	const hueShift =
		adjustment({ curve: settings.hueVsHue, input: source.h }) * 0.5;
	const hueSaturation = adjustment({
		curve: settings.hueVsSaturation,
		input: source.h,
	});
	const hueLuminance = adjustment({
		curve: settings.hueVsLuminance,
		input: source.h,
	});
	const luminanceSaturation = adjustment({
		curve: settings.luminanceVsSaturation,
		input: source.l,
	});
	const saturationSaturation = adjustment({
		curve: settings.saturationVsSaturation,
		input: source.s,
	});
	const saturationFactor =
		Math.max(0, 1 + hueSaturation) *
		Math.max(0, 1 + luminanceSaturation) *
		Math.max(0, 1 + saturationSaturation);
	const transformed = hslToRgb({
		h: (source.h + hueShift + 1) % 1,
		s: clamp01(source.s * saturationFactor),
		l: clamp01(source.l + hueLuminance * 0.5),
	});
	return {
		r: color.r + (transformed.r - color.r) * amount,
		g: color.g + (transformed.g - color.g) * amount,
		b: color.b + (transformed.b - color.b) * amount,
	};
}
