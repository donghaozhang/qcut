import type { ColorCubeLut } from "@/types/timeline";
import {
	clamp01,
	hslToRgb,
	luminance,
	rgbToHsl,
	type RgbColor,
} from "@/lib/color/color-space-math";
import type { FilterLutRecipe, FilterPreset } from "./filter-types";

const filterCubeCache = new Map<string, ColorCubeLut>();

function mix({
	left,
	right,
	amount,
}: {
	left: number;
	right: number;
	amount: number;
}) {
	return left + (right - left) * amount;
}

function tintColor({
	color,
	tint,
	weight,
}: {
	color: RgbColor;
	tint: [number, number, number] | undefined;
	weight: number;
}): RgbColor {
	if (!tint) return color;
	return {
		r: color.r + tint[0] * weight,
		g: color.g + tint[1] * weight,
		b: color.b + tint[2] * weight,
	};
}

function dotProduct({
	coefficients,
	terms,
}: {
	coefficients: readonly number[];
	terms: readonly number[];
}) {
	let result = 0;
	for (let index = 0; index < coefficients.length; index += 1) {
		result += (coefficients[index] ?? 0) * (terms[index] ?? 0);
	}
	return result;
}

function applyPolynomialCorrection({
	color,
	recipe,
}: {
	color: RgbColor;
	recipe: FilterLutRecipe;
}): RgbColor {
	const correction = recipe.polynomialCorrection;
	if (!correction) return color;

	const { r, g, b } = color;
	const linearTerms = [r, g, b];
	const squaredTerms = [r * r, g * g, b * b];
	const crossTerms = [r * g, r * b, g * b];
	const cubicPureTerms = [r ** 3, g ** 3, b ** 3];
	// Mixed columns are r2g, r2b, g2r, g2b, b2r, and b2g.
	const cubicMixedTerms = [
		r * r * g,
		r * r * b,
		g * g * r,
		g * g * b,
		b * b * r,
		b * b * g,
	];
	const cubicTripleTerm = r * g * b;
	const evaluateChannel = ({ channel }: { channel: 0 | 1 | 2 }) => {
		const cubic = correction.cubic;
		const cubicValue = cubic
			? dotProduct({
					coefficients: cubic.pure[channel],
					terms: cubicPureTerms,
				}) +
				dotProduct({
					coefficients: cubic.mixed[channel],
					terms: cubicMixedTerms,
				}) +
				cubic.triple[channel] * cubicTripleTerm
			: 0;
		return (
			dotProduct({
				coefficients: correction.linear[channel],
				terms: linearTerms,
			}) +
			dotProduct({
				coefficients: correction.squared[channel],
				terms: squaredTerms,
			}) +
			dotProduct({
				coefficients: correction.cross[channel],
				terms: crossTerms,
			}) +
			cubicValue +
			correction.offset[channel]
		);
	};

	return {
		r: clamp01(evaluateChannel({ channel: 0 })),
		g: clamp01(evaluateChannel({ channel: 1 })),
		b: clamp01(evaluateChannel({ channel: 2 })),
	};
}

export function transformFilterColor({
	color,
	recipe,
}: {
	color: RgbColor;
	recipe: FilterLutRecipe;
}): RgbColor {
	const exposure = 2 ** (recipe.exposure ?? 0);
	const gamma = Math.max(0.2, recipe.gamma ?? 1);
	let result = {
		r: Math.max(0, color.r * exposure) ** (1 / gamma),
		g: Math.max(0, color.g * exposure) ** (1 / gamma),
		b: Math.max(0, color.b * exposure) ** (1 / gamma),
	};

	const sourceLuma = clamp01(luminance(result));
	const blackLift = recipe.blackLift ?? 0;
	result = {
		r: result.r + blackLift * (1 - sourceLuma) ** 3,
		g: result.g + blackLift * (1 - sourceLuma) ** 3,
		b: result.b + blackLift * (1 - sourceLuma) ** 3,
	};
	result = tintColor({
		color: result,
		tint: recipe.shadowTint,
		weight: (1 - sourceLuma) ** 2,
	});
	result = tintColor({
		color: result,
		tint: recipe.highlightTint,
		weight: sourceLuma ** 2,
	});

	const temperature = recipe.temperature ?? 0;
	const tint = recipe.tint ?? 0;
	result = {
		r: result.r * (1 + temperature * 0.16 + tint * 0.035),
		g: result.g * (1 - tint * 0.11),
		b: result.b * (1 - temperature * 0.16 + tint * 0.035),
	};

	const contrast = 1 + (recipe.contrast ?? 0);
	result = {
		r: (result.r - 0.5) * contrast + 0.5,
		g: (result.g - 0.5) * contrast + 0.5,
		b: (result.b - 0.5) * contrast + 0.5,
	};

	const resultLuma = luminance(result);
	const saturation = Math.max(0, recipe.saturation ?? 1);
	result = {
		r: mix({ left: resultLuma, right: result.r, amount: saturation }),
		g: mix({ left: resultLuma, right: result.g, amount: saturation }),
		b: mix({ left: resultLuma, right: result.b, amount: saturation }),
	};

	const hsl = rgbToHsl(result);
	result = hslToRgb({
		...hsl,
		h: (hsl.h + (recipe.hueShift ?? 0) / 360 + 1) % 1,
	});

	const monoAmount = clamp01(recipe.monochrome ?? 0);
	const monoLuma = luminance(result);
	result = {
		r: mix({ left: result.r, right: monoLuma, amount: monoAmount }),
		g: mix({ left: result.g, right: monoLuma, amount: monoAmount }),
		b: mix({ left: result.b, right: monoLuma, amount: monoAmount }),
	};

	const fade = clamp01(recipe.fade ?? 0) * 0.42;
	result = {
		r: clamp01(mix({ left: result.r, right: 0.5, amount: fade })),
		g: clamp01(mix({ left: result.g, right: 0.5, amount: fade })),
		b: clamp01(mix({ left: result.b, right: 0.5, amount: fade })),
	};
	return applyPolynomialCorrection({ color: result, recipe });
}

export function buildFilterCube({
	preset,
	size = 17,
}: {
	preset: FilterPreset;
	size?: number;
}): ColorCubeLut {
	const values: number[] = [];
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				const transformed = transformFilterColor({
					color: {
						r: red / (size - 1),
						g: green / (size - 1),
						b: blue / (size - 1),
					},
					recipe: preset.recipe,
				});
				values.push(transformed.r, transformed.g, transformed.b);
			}
		}
	}
	return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], values };
}

export function getFilterCube({
	preset,
}: {
	preset: FilterPreset;
}): ColorCubeLut {
	const cached = filterCubeCache.get(preset.lutAssetId);
	if (cached) return cached;
	const cube = buildFilterCube({ preset });
	filterCubeCache.set(preset.lutAssetId, cube);
	return cube;
}

export function clearFilterCubeCache() {
	filterCubeCache.clear();
}
