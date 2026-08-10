import type {
	ColorCubeLut,
	ColorCurvePoint,
	ColorWheelSettings,
} from "@/types/timeline";
import { sampleSmoothCurve } from "./color-curve-math";

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface HslColor {
	h: number;
	s: number;
	l: number;
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function luminance({ r, g, b }: RgbColor): number {
	return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
	const maximum = Math.max(r, g, b);
	const minimum = Math.min(r, g, b);
	const delta = maximum - minimum;
	const lightness = (maximum + minimum) / 2;
	if (delta === 0) return { h: 0, s: 0, l: lightness };
	const saturation = delta / (1 - Math.abs(2 * lightness - 1));
	let hue = 0;
	if (maximum === r) hue = ((g - b) / delta) % 6;
	if (maximum === g) hue = (b - r) / delta + 2;
	if (maximum === b) hue = (r - g) / delta + 4;
	return {
		h: ((hue * 60 + 360) % 360) / 360,
		s: saturation,
		l: lightness,
	};
}

function hueChannel({ p, q, t }: { p: number; q: number; t: number }): number {
	let hue = t;
	if (hue < 0) hue += 1;
	if (hue > 1) hue -= 1;
	if (hue < 1 / 6) return p + (q - p) * 6 * hue;
	if (hue < 1 / 2) return q;
	if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
	return p;
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
	if (s === 0) return { r: l, g: l, b: l };
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return {
		r: hueChannel({ p, q, t: h + 1 / 3 }),
		g: hueChannel({ p, q, t: h }),
		b: hueChannel({ p, q, t: h - 1 / 3 }),
	};
}

export function circularHueDistance(left: number, right: number): number {
	const distance = Math.abs(left - right);
	return Math.min(distance, 1 - distance);
}

/** Soft window: 1 inside [low, high], ramping to 0 across `feather` either side. */
function softWindow({
	value,
	low,
	high,
	feather,
}: {
	value: number;
	low: number;
	high: number;
	feather: number;
}): number {
	return Math.min(
		1,
		Math.max(0, Math.min((value - low) / feather, (high - value) / feather))
	);
}

/**
 * Weight for how skin-like a colour is, used to blend a portrait recipe over the
 * base recipe. Chrominance separates skin far better than hue alone: hue admits
 * any warm surface, while the Cb/Cr skin cluster rejects most wood, fabric and
 * warm walls. Measured against a reference portrait segmentation over 45 frames,
 * this raises IoU from 0.405 to 0.519 and lowers MAE from 0.094 to 0.081.
 *
 * It stays a per-colour heuristic — it has no spatial information, so it cannot
 * match true segmentation (IoU 0.785 on the same material).
 */
export function skinToneWeight({ color }: { color: RgbColor }): number {
	const red = color.r * 255;
	const green = color.g * 255;
	const blue = color.b * 255;
	const chromaBlue = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
	const chromaRed = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
	const chromaWeight =
		softWindow({ value: chromaBlue, low: 77, high: 127, feather: 12 }) *
		softWindow({ value: chromaRed, low: 133, high: 173, feather: 12 });
	if (chromaWeight <= 0) return 0;

	const hsl = rgbToHsl(color);
	return (
		chromaWeight *
		Math.min(1, hsl.s * 3) *
		Math.min(1, hsl.l * 4) *
		Math.min(1, (1 - hsl.l) * 3)
	);
}

export function sampleCurve({
	points,
	value,
}: {
	points: ColorCurvePoint[];
	value: number;
}): number {
	return sampleSmoothCurve({ points, value });
}

function cubeColor({
	cube,
	red,
	green,
	blue,
}: {
	cube: ColorCubeLut;
	red: number;
	green: number;
	blue: number;
}): RgbColor {
	// .cube files enumerate red fastest, then green, then blue.
	const index = ((blue * cube.size + green) * cube.size + red) * 3;
	return {
		r: cube.values[index] ?? 0,
		g: cube.values[index + 1] ?? 0,
		b: cube.values[index + 2] ?? 0,
	};
}

function mixRgb(left: RgbColor, right: RgbColor, amount: number): RgbColor {
	return {
		r: left.r + (right.r - left.r) * amount,
		g: left.g + (right.g - left.g) * amount,
		b: left.b + (right.b - left.b) * amount,
	};
}

export function sampleCubeLut({
	cube,
	color,
}: {
	cube: ColorCubeLut;
	color: RgbColor;
}): RgbColor {
	const domain = (channel: keyof RgbColor, axis: 0 | 1 | 2) =>
		clamp01(
			(color[channel] - cube.domainMin[axis]) /
				Math.max(0.000001, cube.domainMax[axis] - cube.domainMin[axis])
		) *
		(cube.size - 1);
	const red = domain("r", 0);
	const green = domain("g", 1);
	const blue = domain("b", 2);
	const r0 = Math.floor(red);
	const g0 = Math.floor(green);
	const b0 = Math.floor(blue);
	const r1 = Math.min(cube.size - 1, r0 + 1);
	const g1 = Math.min(cube.size - 1, g0 + 1);
	const b1 = Math.min(cube.size - 1, b0 + 1);
	const rMix = red - r0;
	const gMix = green - g0;
	const bMix = blue - b0;
	const c00 = mixRgb(
		cubeColor({ cube, red: r0, green: g0, blue: b0 }),
		cubeColor({ cube, red: r1, green: g0, blue: b0 }),
		rMix
	);
	const c10 = mixRgb(
		cubeColor({ cube, red: r0, green: g1, blue: b0 }),
		cubeColor({ cube, red: r1, green: g1, blue: b0 }),
		rMix
	);
	const c01 = mixRgb(
		cubeColor({ cube, red: r0, green: g0, blue: b1 }),
		cubeColor({ cube, red: r1, green: g0, blue: b1 }),
		rMix
	);
	const c11 = mixRgb(
		cubeColor({ cube, red: r0, green: g1, blue: b1 }),
		cubeColor({ cube, red: r1, green: g1, blue: b1 }),
		rMix
	);
	return mixRgb(mixRgb(c00, c10, gMix), mixRgb(c01, c11, gMix), bMix);
}

export function wheelRgbOffset({
	wheel,
}: {
	wheel: ColorWheelSettings;
}): RgbColor {
	const red = wheel.x * 0.8 - wheel.y * 0.25;
	const green = -wheel.x * 0.45 - wheel.y * 0.25;
	const blue = wheel.y * 0.8 - wheel.x * 0.15;
	return { r: red, g: green, b: blue };
}
