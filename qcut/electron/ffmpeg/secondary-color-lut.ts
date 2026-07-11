import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoColorSettings, VideoSecondaryCurve } from "./color-settings";

const LUT_SIZE = 33;

interface RgbColor {
	r: number;
	g: number;
	b: number;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function rgbToHsl({ r, g, b }: RgbColor): { h: number; s: number; l: number } {
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

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RgbColor {
	if (s === 0) return { r: l, g: l, b: l };
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return {
		r: hueChannel({ p, q, t: h + 1 / 3 }),
		g: hueChannel({ p, q, t: h }),
		b: hueChannel({ p, q, t: h - 1 / 3 }),
	};
}

function sampleCurve({
	curve,
	value,
}: {
	curve: VideoSecondaryCurve;
	value: number;
}): number {
	const samples = curve.samples;
	if (samples.length === 0) return 0.5;
	if (samples.length === 1) return clamp01(samples[0]);
	const position = clamp01(value) * (samples.length - 1);
	const from = Math.floor(position);
	const to = Math.min(samples.length - 1, from + 1);
	const progress = position - from;
	return clamp01(
		(samples[from] ?? 0.5) +
			((samples[to] ?? 0.5) - (samples[from] ?? 0.5)) * progress
	);
}

function adjustment({
	curve,
	value,
}: {
	curve: VideoSecondaryCurve;
	value: number;
}) {
	return (sampleCurve({ curve, value }) - 0.5) * 2;
}

function hasAdjustments({
	settings,
}: {
	settings: VideoColorSettings["secondaryCurves"];
}): boolean {
	return [
		settings.hueVsSaturation,
		settings.hueVsHue,
		settings.hueVsLuminance,
		settings.luminanceVsSaturation,
		settings.saturationVsSaturation,
	].some((curve) =>
		curve.samples.some((sample) => Math.abs(sample - 0.5) > 0.000001)
	);
}

export function applySecondaryColorCurves({
	color,
	settings,
	mix,
}: {
	color: RgbColor;
	settings: VideoColorSettings["secondaryCurves"];
	mix: number;
}): RgbColor {
	if (mix <= 0 || !hasAdjustments({ settings })) return color;
	const source = rgbToHsl(color);
	const hueShift =
		adjustment({ curve: settings.hueVsHue, value: source.h }) * 0.5;
	const saturationFactor =
		Math.max(
			0,
			1 + adjustment({ curve: settings.hueVsSaturation, value: source.h })
		) *
		Math.max(
			0,
			1 + adjustment({ curve: settings.luminanceVsSaturation, value: source.l })
		) *
		Math.max(
			0,
			1 +
				adjustment({ curve: settings.saturationVsSaturation, value: source.s })
		);
	const transformed = hslToRgb({
		h: (source.h + hueShift + 1) % 1,
		s: clamp01(source.s * saturationFactor),
		l: clamp01(
			source.l +
				adjustment({ curve: settings.hueVsLuminance, value: source.h }) * 0.5
		),
	});
	const amount = clamp01(mix / 100);
	return {
		r: clamp01(color.r + (transformed.r - color.r) * amount),
		g: clamp01(color.g + (transformed.g - color.g) * amount),
		b: clamp01(color.b + (transformed.b - color.b) * amount),
	};
}

function serializeSecondaryLut({
	settings,
	mix,
}: {
	settings: VideoColorSettings["secondaryCurves"];
	mix: number;
}): string {
	const rows = [
		'TITLE "QCut Secondary Curves"',
		`LUT_3D_SIZE ${LUT_SIZE}`,
		"DOMAIN_MIN 0 0 0",
		"DOMAIN_MAX 1 1 1",
	];
	for (let blue = 0; blue < LUT_SIZE; blue += 1) {
		for (let green = 0; green < LUT_SIZE; green += 1) {
			for (let red = 0; red < LUT_SIZE; red += 1) {
				const color = applySecondaryColorCurves({
					color: {
						r: red / (LUT_SIZE - 1),
						g: green / (LUT_SIZE - 1),
						b: blue / (LUT_SIZE - 1),
					},
					settings,
					mix,
				});
				rows.push(
					`${color.r.toFixed(8)} ${color.g.toFixed(8)} ${color.b.toFixed(8)}`
				);
			}
		}
	}
	return `${rows.join("\n")}\n`;
}

export function materializeSecondaryColorLut({
	settings,
	mix = 100,
}: {
	settings: VideoColorSettings["secondaryCurves"];
	mix?: number;
}): string {
	const identity = JSON.stringify({ settings, mix, size: LUT_SIZE });
	const hash = createHash("sha256").update(identity).digest("hex").slice(0, 24);
	const directory = join(tmpdir(), "qcut-secondary-color-luts");
	const filePath = join(directory, `${hash}.cube`);
	if (existsSync(filePath)) return filePath;
	mkdirSync(directory, { recursive: true });
	writeFileSync(filePath, serializeSecondaryLut({ settings, mix }), "utf8");
	return filePath;
}
