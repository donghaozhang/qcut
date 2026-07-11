import type { ColorSpace, MediaColorSettings } from "@/types/timeline";
import { clamp01, type RgbColor } from "./color-space-math";

type ColorMatrix = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

const REC709_TO_XYZ: ColorMatrix = [
	[0.4124564, 0.3575761, 0.1804375],
	[0.2126729, 0.7151522, 0.072175],
	[0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_REC709: ColorMatrix = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.969266, 1.8760108, 0.041556],
	[0.0556434, -0.2040259, 1.0572252],
];
const P3_TO_XYZ: ColorMatrix = [
	[0.4865709, 0.2656677, 0.1982173],
	[0.2289746, 0.6917385, 0.0792869],
	[0, 0.0451134, 1.0439444],
];
const XYZ_TO_P3: ColorMatrix = [
	[2.493497, -0.9313836, -0.4027108],
	[-0.829489, 1.762664, 0.0236247],
	[0.0358458, -0.0761724, 0.9568845],
];
const REC2020_TO_XYZ: ColorMatrix = [
	[0.636958, 0.1446169, 0.168881],
	[0.2627002, 0.6779981, 0.0593017],
	[0, 0.0280727, 1.0609851],
];
const XYZ_TO_REC2020: ColorMatrix = [
	[1.7166512, -0.3556708, -0.2533663],
	[-0.6666844, 1.6164812, 0.0157685],
	[0.0176399, -0.0427706, 0.9421031],
];
const ACESCG_TO_XYZ: ColorMatrix = [
	[0.6624542, 0.1340042, 0.1561877],
	[0.2722287, 0.6740818, 0.0536895],
	[-0.0055746, 0.0040607, 1.0103391],
];
const XYZ_TO_ACESCG: ColorMatrix = [
	[1.6410234, -0.3248033, -0.2364247],
	[-0.6636629, 1.6153316, 0.0167563],
	[0.0117219, -0.0082844, 0.9883949],
];

function decodeTransfer({
	value,
	space,
	peakNits,
}: {
	value: number;
	space: ColorSpace;
	peakNits: number;
}) {
	if (space === "logc3")
		return clamp01((10 ** ((value - 0.3855) / 0.2472) - 0.0523) / 5.5556);
	if (space === "slog3")
		return clamp01((10 ** ((value - 0.6166) / 0.255) - 0.0376) / 4.5);
	if (space === "vlog")
		return clamp01((10 ** ((value - 0.5982) / 0.2415) - 0.00873) / 5.6);
	const hdrPeakScale = Math.max(1, peakNits) / 100;
	if (space === "pq") return value ** 2.4 * hdrPeakScale;
	if (space === "hlg")
		return (
			(value <= 0.5
				? (value * value) / 3
				: (Math.exp((value - 0.5599) / 0.1788) + 0.2847) / 12) * hdrPeakScale
		);
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function encodeTransfer({
	value,
	space,
	peakNits,
}: {
	value: number;
	space: ColorSpace;
	peakNits: number;
}) {
	const hdrPeakScale = Math.max(1, peakNits) / 100;
	const channel =
		Math.max(0, value) / (space === "pq" || space === "hlg" ? hdrPeakScale : 1);
	if (space === "pq") return clamp01(channel ** (1 / 2.4));
	if (space === "hlg")
		return clamp01(
			channel <= 1 / 12
				? Math.sqrt(3 * channel)
				: 0.1788 * Math.log(12 * channel - 0.2847) + 0.5599
		);
	return channel <= 0.0031308
		? channel * 12.92
		: 1.055 * channel ** (1 / 2.4) - 0.055;
}

function toneMap({
	value,
	mode,
}: {
	value: number;
	mode: MediaColorSettings["management"]["toneMapping"];
}): number {
	if (mode === "none") return value;
	if (mode === "reinhard") return value / (1 + value);
	if (mode === "hable") {
		const numerator = value * (0.15 * value + 0.05) + 0.004;
		const denominator = value * (0.15 * value + 0.5) + 0.06;
		return numerator / denominator - 0.0667;
	}
	const numerator = value * (2.51 * value + 0.03);
	const denominator = value * (2.43 * value + 0.59) + 0.14;
	return numerator / denominator;
}

function multiplyMatrix({
	matrix,
	color,
}: {
	matrix: ColorMatrix;
	color: RgbColor;
}): RgbColor {
	return {
		r: matrix[0][0] * color.r + matrix[0][1] * color.g + matrix[0][2] * color.b,
		g: matrix[1][0] * color.r + matrix[1][1] * color.g + matrix[1][2] * color.b,
		b: matrix[2][0] * color.r + matrix[2][1] * color.g + matrix[2][2] * color.b,
	};
}

function inputToXyzMatrix({ space }: { space: ColorSpace }): ColorMatrix {
	if (space === "display-p3") return P3_TO_XYZ;
	if (space === "rec2020" || space === "hlg" || space === "pq")
		return REC2020_TO_XYZ;
	return REC709_TO_XYZ;
}

function xyzToOutputMatrix({ space }: { space: ColorSpace }): ColorMatrix {
	if (space === "display-p3") return XYZ_TO_P3;
	if (space === "rec2020" || space === "hlg" || space === "pq")
		return XYZ_TO_REC2020;
	return XYZ_TO_REC709;
}

export function applyColorManagementInput({
	color,
	settings,
}: {
	color: RgbColor;
	settings: MediaColorSettings;
}): RgbColor {
	if (!settings.management.enabled) return color;
	const decoded = {
		r: decodeTransfer({
			value: color.r,
			space: settings.management.inputSpace,
			peakNits: settings.management.peakNits,
		}),
		g: decodeTransfer({
			value: color.g,
			space: settings.management.inputSpace,
			peakNits: settings.management.peakNits,
		}),
		b: decodeTransfer({
			value: color.b,
			space: settings.management.inputSpace,
			peakNits: settings.management.peakNits,
		}),
	};
	const xyz = multiplyMatrix({
		matrix: inputToXyzMatrix({ space: settings.management.inputSpace }),
		color: decoded,
	});
	return multiplyMatrix({
		matrix:
			settings.management.workingSpace === "acescg"
				? XYZ_TO_ACESCG
				: XYZ_TO_REC709,
		color: xyz,
	});
}

export function applyColorManagementOutput({
	color,
	settings,
}: {
	color: RgbColor;
	settings: MediaColorSettings;
}): RgbColor {
	if (!settings.management.enabled) return color;
	const mappedWorking = {
		r: toneMap({ value: color.r, mode: settings.management.toneMapping }),
		g: toneMap({ value: color.g, mode: settings.management.toneMapping }),
		b: toneMap({ value: color.b, mode: settings.management.toneMapping }),
	};
	const xyz = multiplyMatrix({
		matrix:
			settings.management.workingSpace === "acescg"
				? ACESCG_TO_XYZ
				: REC709_TO_XYZ,
		color: mappedWorking,
	});
	const mapped = multiplyMatrix({
		matrix: xyzToOutputMatrix({ space: settings.management.outputSpace }),
		color: xyz,
	});
	return {
		r: encodeTransfer({
			value: mapped.r,
			space: settings.management.outputSpace,
			peakNits: settings.management.peakNits,
		}),
		g: encodeTransfer({
			value: mapped.g,
			space: settings.management.outputSpace,
			peakNits: settings.management.peakNits,
		}),
		b: encodeTransfer({
			value: mapped.b,
			space: settings.management.outputSpace,
			peakNits: settings.management.peakNits,
		}),
	};
}
