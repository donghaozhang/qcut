import type { ColorHslRangeName, MediaColorSettings } from "@/types/timeline";
import {
	circularHueDistance,
	clamp01,
	hslToRgb,
	luminance,
	rgbToHsl,
	sampleCubeLut,
	sampleCurve,
	skinToneWeight,
	wheelRgbOffset,
	type RgbColor,
} from "./color-space-math";
import {
	applyColorManagementInput,
	applyColorManagementOutput,
} from "./color-management";
import { applySecondaryCurves } from "./color-secondary-curves";
import { applyColorMultiPass } from "./multi-pass-pixel-processor";

const HSL_CENTERS: Record<ColorHslRangeName, number> = {
	red: 0,
	orange: 30 / 360,
	yellow: 60 / 360,
	green: 120 / 360,
	cyan: 180 / 360,
	blue: 240 / 360,
	purple: 275 / 360,
	magenta: 315 / 360,
};

function mix(left: number, right: number, amount: number): number {
	return left + (right - left) * amount;
}

function applyBasic(color: RgbColor, settings: MediaColorSettings): RgbColor {
	if (!settings.basic.enabled) return color;
	const basic = settings.basic;
	const exposure = 2 ** basic.exposure;
	let result = {
		r: color.r * exposure,
		g: color.g * exposure,
		b: color.b * exposure,
	};
	const initialLuma = luminance(result);
	const shadowWeight = (1 - initialLuma) ** 2;
	const highlightWeight = initialLuma ** 2;
	const blackWeight = (1 - initialLuma) ** 4;
	const whiteWeight = initialLuma ** 4;
	const tonalOffset =
		basic.brightness / 100 +
		(basic.shadows / 100) * shadowWeight * 0.35 +
		(basic.highlights / 100) * highlightWeight * 0.35 +
		(basic.blacks / 100) * blackWeight * 0.25 +
		(basic.whites / 100) * whiteWeight * 0.25;
	result = {
		r: result.r + tonalOffset,
		g: result.g + tonalOffset,
		b: result.b + tonalOffset,
	};
	const temperature = basic.temperature / 100;
	const tint = basic.tint / 100;
	result.r *= 1 + temperature * 0.18 + tint * 0.04;
	result.g *= 1 - tint * 0.12;
	result.b *= 1 - temperature * 0.18 + tint * 0.04;
	const contrast = 1 + basic.contrast / 100;
	result = {
		r: (result.r - 0.5) * contrast + 0.5,
		g: (result.g - 0.5) * contrast + 0.5,
		b: (result.b - 0.5) * contrast + 0.5,
	};
	const luma = luminance(result);
	const saturation = Math.max(0, 1 + basic.saturation / 100);
	result = {
		r: mix(luma, result.r, saturation),
		g: mix(luma, result.g, saturation),
		b: mix(luma, result.b, saturation),
	};
	const currentHsl = rgbToHsl(result);
	const vibrance = basic.vibrance / 100;
	const vibranceFactor = Math.max(0, 1 + vibrance * (1 - currentHsl.s) * 1.5);
	result = hslToRgb({
		...currentHsl,
		s: clamp01(currentHsl.s * vibranceFactor),
	});
	const fade = Math.max(0, basic.fade / 100) * 0.35;
	return {
		r: mix(result.r, 0.5, fade),
		g: mix(result.g, 0.5, fade),
		b: mix(result.b, 0.5, fade),
	};
}

function applySmart(color: RgbColor, settings: MediaColorSettings): RgbColor {
	const correction = settings.smart.correction;
	if (
		!settings.smart.enabled ||
		settings.smart.status !== "ready" ||
		!correction
	) {
		return color;
	}
	const amount = settings.smart.intensity / 100;
	const exposure = settings.smart.autoTone ? correction.exposure * amount : 0;
	const contrast = settings.smart.autoTone ? correction.contrast * amount : 0;
	const saturation = settings.smart.autoTone
		? correction.saturation * amount
		: 0;
	const temperature = settings.smart.autoWhiteBalance
		? correction.temperature * amount
		: 0;
	const tint = settings.smart.autoWhiteBalance ? correction.tint * amount : 0;
	let result = {
		r: color.r * 2 ** exposure,
		g: color.g * 2 ** exposure,
		b: color.b * 2 ** exposure,
	};
	result.r *= 1 + temperature * 0.0018 + tint * 0.0004;
	result.g *= 1 - tint * 0.0012;
	result.b *= 1 - temperature * 0.0018 + tint * 0.0004;
	const contrastFactor = 1 + contrast / 100;
	result = {
		r: (result.r - 0.5) * contrastFactor + 0.5,
		g: (result.g - 0.5) * contrastFactor + 0.5,
		b: (result.b - 0.5) * contrastFactor + 0.5,
	};
	const luma = luminance(result);
	const saturationFactor = Math.max(0, 1 + saturation / 100);
	return {
		r: mix(luma, result.r, saturationFactor),
		g: mix(luma, result.g, saturationFactor),
		b: mix(luma, result.b, saturationFactor),
	};
}

function applyLut(color: RgbColor, settings: MediaColorSettings): RgbColor {
	if (!settings.lut.enabled || !settings.lut.cube) return color;
	const background = sampleCubeLut({ cube: settings.lut.cube, color });
	const transformed = settings.lut.dual
		? (() => {
				const skin = sampleCubeLut({
					cube: settings.lut.dual.skinCube,
					color,
				});
				const skinMask = skinToneWeight({ color });
				return {
					r: mix(background.r, skin.r, skinMask),
					g: mix(background.g, skin.g, skinMask),
					b: mix(background.b, skin.b, skinMask),
				};
			})()
		: background;
	const amount =
		(settings.lut.intensity / 100) *
		(settings.lut.dual
			? 1
			: 1 - skinToneWeight({ color }) * (settings.lut.skinProtection / 100));
	return {
		r: mix(color.r, transformed.r, amount),
		g: mix(color.g, transformed.g, amount),
		b: mix(color.b, transformed.b, amount),
	};
}

function applyHsl(color: RgbColor, settings: MediaColorSettings): RgbColor {
	if (!settings.hsl.enabled) return color;
	const original = rgbToHsl(color);
	let hueShift = 0;
	let saturationShift = 0;
	let luminanceShift = 0;
	for (const [range, values] of Object.entries(settings.hsl.ranges) as Array<
		[ColorHslRangeName, MediaColorSettings["hsl"]["ranges"][ColorHslRangeName]]
	>) {
		const distance = circularHueDistance(original.h, HSL_CENTERS[range]);
		const weight = Math.max(0, 1 - distance / (50 / 360)) ** 2;
		hueShift += (values.hue / 100) * (30 / 360) * weight;
		saturationShift += (values.saturation / 100) * weight;
		luminanceShift += (values.luminance / 100) * 0.5 * weight;
	}
	return hslToRgb({
		h: (original.h + hueShift + 1) % 1,
		s: clamp01(original.s * (1 + saturationShift)),
		l: clamp01(original.l + luminanceShift),
	});
}

function applyCurves(color: RgbColor, settings: MediaColorSettings): RgbColor {
	if (!settings.curves.enabled) return color;
	const amount = settings.curves.mix / 100;
	const master = (value: number) =>
		sampleCurve({ points: settings.curves.master, value });
	const transformed = {
		r: sampleCurve({ points: settings.curves.red, value: master(color.r) }),
		g: sampleCurve({ points: settings.curves.green, value: master(color.g) }),
		b: sampleCurve({ points: settings.curves.blue, value: master(color.b) }),
	};
	return {
		r: mix(color.r, transformed.r, amount),
		g: mix(color.g, transformed.g, amount),
		b: mix(color.b, transformed.b, amount),
	};
}

function applyWheels(color: RgbColor, settings: MediaColorSettings): RgbColor {
	if (!settings.wheels.enabled) return color;
	const strength = Math.max(0, Math.min(1, settings.wheels.strength / 100));
	const offset = wheelRgbOffset({ wheel: settings.wheels.offset });
	const offsetLuma = (settings.wheels.offset.luminance / 100) * 0.3;
	if (settings.wheels.mode === "lift-gamma-gain") {
		const lift = wheelRgbOffset({ wheel: settings.wheels.shadows });
		const gamma = wheelRgbOffset({ wheel: settings.wheels.midtones });
		const gain = wheelRgbOffset({ wheel: settings.wheels.highlights });
		const liftLuma = (settings.wheels.shadows.luminance / 100) * 0.3;
		const gammaLuma = (settings.wheels.midtones.luminance / 100) * 0.5;
		const gainLuma = (settings.wheels.highlights.luminance / 100) * 0.5;
		const channel = ({
			value,
			liftOffset,
			gammaOffset,
			gainOffset,
		}: {
			value: number;
			liftOffset: number;
			gammaOffset: number;
			gainOffset: number;
		}) => {
			const lifted = Math.max(0, value + liftOffset * 0.35 + liftLuma);
			const gammaValue = Math.max(
				0.2,
				Math.min(3, 1 + gammaOffset * 0.8 + gammaLuma)
			);
			const gainValue = Math.max(0, 1 + gainOffset * 0.8 + gainLuma);
			return lifted ** (1 / gammaValue) * gainValue;
		};
		const mixChannel = ({
			source,
			graded,
			channelOffset,
		}: {
			source: number;
			graded: number;
			channelOffset: number;
		}) => source + (graded - source + channelOffset + offsetLuma) * strength;
		return {
			r: mixChannel({
				source: color.r,
				graded: channel({
					value: color.r,
					liftOffset: lift.r,
					gammaOffset: gamma.r,
					gainOffset: gain.r,
				}),
				channelOffset: offset.r,
			}),
			g: mixChannel({
				source: color.g,
				graded: channel({
					value: color.g,
					liftOffset: lift.g,
					gammaOffset: gamma.g,
					gainOffset: gain.g,
				}),
				channelOffset: offset.g,
			}),
			b: mixChannel({
				source: color.b,
				graded: channel({
					value: color.b,
					liftOffset: lift.b,
					gammaOffset: gamma.b,
					gainOffset: gain.b,
				}),
				channelOffset: offset.b,
			}),
		};
	}
	const luma = clamp01(luminance(color));
	const balance = settings.wheels.balance / 100;
	const shadowWeight = clamp01((0.65 + balance * 0.25 - luma) * 2);
	const highlightWeight = clamp01((luma - (0.35 + balance * 0.25)) * 2);
	const midtoneWeight = clamp01(
		1 - Math.abs(luma - (0.5 + balance * 0.15)) * 2
	);
	const shadows = wheelRgbOffset({ wheel: settings.wheels.shadows });
	const midtones = wheelRgbOffset({ wheel: settings.wheels.midtones });
	const highlights = wheelRgbOffset({ wheel: settings.wheels.highlights });
	const lumaOffset =
		(settings.wheels.shadows.luminance / 100) * shadowWeight * 0.3 +
		(settings.wheels.midtones.luminance / 100) * midtoneWeight * 0.3 +
		(settings.wheels.highlights.luminance / 100) * highlightWeight * 0.3;
	return {
		r:
			color.r +
			(shadows.r * shadowWeight +
				midtones.r * midtoneWeight +
				highlights.r * highlightWeight +
				offset.r +
				lumaOffset +
				offsetLuma) *
				strength,
		g:
			color.g +
			(shadows.g * shadowWeight +
				midtones.g * midtoneWeight +
				highlights.g * highlightWeight +
				offset.g +
				lumaOffset +
				offsetLuma) *
				strength,
		b:
			color.b +
			(shadows.b * shadowWeight +
				midtones.b * midtoneWeight +
				highlights.b * highlightWeight +
				offset.b +
				lumaOffset +
				offsetLuma) *
				strength,
	};
}

export function transformColorPixel({
	color,
	settings,
}: {
	color: RgbColor;
	settings: MediaColorSettings;
}): RgbColor {
	if (!settings.enabled) return color;
	const transformed = applyColorManagementOutput({
		settings,
		color: applyWheels(
			applySecondaryCurves({
				color: applyCurves(
					applyHsl(
						applyLut(
							applyBasic(
								applySmart(
									applyColorManagementInput({ color, settings }),
									settings
								),
								settings
							),
							settings
						),
						settings
					),
					settings
				),
				settings: settings.secondaryCurves,
			}),
			settings
		),
	});
	return {
		r: clamp01(transformed.r),
		g: clamp01(transformed.g),
		b: clamp01(transformed.b),
	};
}

function noiseAt(index: number, seed: number): number {
	const value = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
	return (value - Math.floor(value)) * 2 - 1;
}

function sharpenPixels({
	data,
	width,
	height,
	amount,
}: {
	data: Uint8ClampedArray;
	width: number;
	height: number;
	amount: number;
}): Uint8ClampedArray {
	if (amount <= 0 || width < 3 || height < 3) return data;
	const source = new Uint8ClampedArray(data);
	const result = new Uint8ClampedArray(data);
	const strength = Math.min(2, amount / 50);
	for (let y = 1; y < height - 1; y += 1) {
		for (let x = 1; x < width - 1; x += 1) {
			const index = (y * width + x) * 4;
			for (let channel = 0; channel < 3; channel += 1) {
				const average =
					(source[index - width * 4 + channel] +
						source[index + width * 4 + channel] +
						source[index - 4 + channel] +
						source[index + 4 + channel]) /
					4;
				result[index + channel] =
					source[index + channel] +
					(source[index + channel] - average) * strength;
			}
		}
	}
	return result;
}

export function processColorImageData({
	imageData,
	settings,
	maskData,
	frameSeed = 0,
}: {
	imageData: ImageData;
	settings: MediaColorSettings;
	maskData?: Uint8ClampedArray;
	frameSeed?: number;
}): ImageData {
	const source = new Uint8ClampedArray(imageData.data);
	const graded = new Uint8ClampedArray(source);
	const vignette = settings.basic.enabled ? settings.basic.vignette / 100 : 0;
	const grain = settings.basic.enabled ? settings.basic.grain / 100 : 0;
	for (let index = 0; index < source.length; index += 4) {
		const pixel = index / 4;
		const x = (pixel % imageData.width) / Math.max(1, imageData.width - 1);
		const y =
			Math.floor(pixel / imageData.width) / Math.max(1, imageData.height - 1);
		let transformed = transformColorPixel({
			color: {
				r: source[index] / 255,
				g: source[index + 1] / 255,
				b: source[index + 2] / 255,
			},
			settings,
		});
		if (vignette > 0) {
			const distance = Math.hypot((x - 0.5) * 1.25, y - 0.5) / 0.72;
			const factor = 1 - Math.max(0, distance - 0.45) ** 1.7 * vignette * 0.85;
			transformed = {
				r: transformed.r * factor,
				g: transformed.g * factor,
				b: transformed.b * factor,
			};
		}
		if (grain > 0) {
			const sample = noiseAt(pixel, frameSeed) * grain * 0.1;
			transformed = {
				r: transformed.r + sample,
				g: transformed.g + sample,
				b: transformed.b + sample,
			};
		}
		graded[index] = clamp01(transformed.r) * 255;
		graded[index + 1] = clamp01(transformed.g) * 255;
		graded[index + 2] = clamp01(transformed.b) * 255;
	}
	const sharpened = sharpenPixels({
		data: graded,
		width: imageData.width,
		height: imageData.height,
		amount: settings.basic.enabled ? settings.basic.sharpness : 0,
	});
	const effected = applyColorMultiPass({
		data: sharpened,
		width: imageData.width,
		height: imageData.height,
		settings: settings.multiPass,
	});
	const output = new ImageData(
		new Uint8ClampedArray(source),
		imageData.width,
		imageData.height
	);
	for (let index = 0; index < source.length; index += 4) {
		const mask = maskData ? maskData[index + 3] / 255 : 1;
		output.data[index] = mix(source[index], effected[index], mask);
		output.data[index + 1] = mix(source[index + 1], effected[index + 1], mask);
		output.data[index + 2] = mix(source[index + 2], effected[index + 2], mask);
	}
	return output;
}
