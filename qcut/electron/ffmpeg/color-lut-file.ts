import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoColorSettings } from "./color-settings";

type VideoCubeLut = NonNullable<VideoColorSettings["lut"]["cube"]>;
type VideoDualLut = NonNullable<VideoColorSettings["lut"]["dual"]>;

interface LutRgb {
	r: number;
	g: number;
	b: number;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): {
	h: number;
	s: number;
	l: number;
} {
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
	return { h: ((hue * 60 + 360) % 360) / 360, s: saturation, l: lightness };
}

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
 * Must stay identical to skinToneWeight in
 * apps/web/src/lib/color/color-space-math.ts — the browser preview and this
 * native bake are compared within six channel levels by
 * electron/__tests__/filter-library-parity-real.test.ts, and
 * electron/__tests__/skin-tone-weight-parity.test.ts locks the two copies
 * together directly. Electron cannot import the web module because that file
 * resolves types through the `@/` alias.
 */
function skinToneWeight({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): number {
	const red = r * 255;
	const green = g * 255;
	const blue = b * 255;
	const chromaBlue = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
	const chromaRed = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
	const chromaWeight =
		softWindow({ value: chromaBlue, low: 77, high: 127, feather: 12 }) *
		softWindow({ value: chromaRed, low: 133, high: 173, feather: 12 });
	if (chromaWeight <= 0) return 0;

	const hsl = rgbToHsl({ r, g, b });
	return (
		chromaWeight *
		Math.min(1, hsl.s * 3) *
		Math.min(1, hsl.l * 4) *
		Math.min(1, (1 - hsl.l) * 3)
	);
}

function cubeColor({
	cube,
	red,
	green,
	blue,
}: {
	cube: VideoCubeLut;
	red: number;
	green: number;
	blue: number;
}): LutRgb {
	const index = ((blue * cube.size + green) * cube.size + red) * 3;
	return {
		r: cube.values[index] ?? 0,
		g: cube.values[index + 1] ?? 0,
		b: cube.values[index + 2] ?? 0,
	};
}

function mixRgb({
	left,
	right,
	amount,
}: {
	left: LutRgb;
	right: LutRgb;
	amount: number;
}): LutRgb {
	return {
		r: left.r + (right.r - left.r) * amount,
		g: left.g + (right.g - left.g) * amount,
		b: left.b + (right.b - left.b) * amount,
	};
}

function sampleCube({ cube, color }: { cube: VideoCubeLut; color: LutRgb }) {
	const coordinate = ({ value, axis }: { value: number; axis: 0 | 1 | 2 }) =>
		clamp01(
			(value - cube.domainMin[axis]) /
				Math.max(0.000001, cube.domainMax[axis] - cube.domainMin[axis])
		) *
		(cube.size - 1);
	const red = coordinate({ value: color.r, axis: 0 });
	const green = coordinate({ value: color.g, axis: 1 });
	const blue = coordinate({ value: color.b, axis: 2 });
	const r0 = Math.floor(red);
	const g0 = Math.floor(green);
	const b0 = Math.floor(blue);
	const r1 = Math.min(cube.size - 1, r0 + 1);
	const g1 = Math.min(cube.size - 1, g0 + 1);
	const b1 = Math.min(cube.size - 1, b0 + 1);
	const c00 = mixRgb({
		left: cubeColor({ cube, red: r0, green: g0, blue: b0 }),
		right: cubeColor({ cube, red: r1, green: g0, blue: b0 }),
		amount: red - r0,
	});
	const c10 = mixRgb({
		left: cubeColor({ cube, red: r0, green: g1, blue: b0 }),
		right: cubeColor({ cube, red: r1, green: g1, blue: b0 }),
		amount: red - r0,
	});
	const c01 = mixRgb({
		left: cubeColor({ cube, red: r0, green: g0, blue: b1 }),
		right: cubeColor({ cube, red: r1, green: g0, blue: b1 }),
		amount: red - r0,
	});
	const c11 = mixRgb({
		left: cubeColor({ cube, red: r0, green: g1, blue: b1 }),
		right: cubeColor({ cube, red: r1, green: g1, blue: b1 }),
		amount: red - r0,
	});
	return mixRgb({
		left: mixRgb({ left: c00, right: c10, amount: green - g0 }),
		right: mixRgb({ left: c01, right: c11, amount: green - g0 }),
		amount: blue - b0,
	});
}

function adjustedCube({
	cube,
	dual,
	intensity,
	skinProtection,
}: {
	cube: VideoCubeLut;
	dual?: VideoDualLut;
	intensity: number;
	skinProtection: number;
}): VideoCubeLut {
	const values: number[] = [];
	let valueIndex = 0;
	const size = dual ? Math.max(33, cube.size, dual.skinCube.size) : cube.size;
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				const input = {
					r: red / (size - 1),
					g: green / (size - 1),
					b: blue / (size - 1),
				};
				const background = dual
					? sampleCube({ cube, color: input })
					: {
							r: cube.values[valueIndex] ?? input.r,
							g: cube.values[valueIndex + 1] ?? input.g,
							b: cube.values[valueIndex + 2] ?? input.b,
						};
				// Spatial segmentation is preview-only until native export can consume frame masks.
				const skinWeight = skinToneWeight(input);
				const output = dual
					? mixRgb({
							left: background,
							right: sampleCube({ cube: dual.skinCube, color: input }),
							amount: skinWeight,
						})
					: background;
				const amount =
					(intensity / 100) *
					(dual ? 1 : 1 - skinWeight * (skinProtection / 100));
				values.push(
					clamp01(input.r + (output.r - input.r) * amount),
					clamp01(input.g + (output.g - input.g) * amount),
					clamp01(input.b + (output.b - input.b) * amount)
				);
				valueIndex += 3;
			}
		}
	}
	return dual
		? {
				size,
				domainMin: [0, 0, 0],
				domainMax: [1, 1, 1],
				values,
			}
		: { ...cube, values };
}

function serializeCube({
	name,
	cube,
}: {
	name: string;
	cube: VideoCubeLut;
}): string {
	const rows = [
		`TITLE "${name.replace(/"/g, "")}"`,
		`LUT_3D_SIZE ${cube.size}`,
		`DOMAIN_MIN ${cube.domainMin.join(" ")}`,
		`DOMAIN_MAX ${cube.domainMax.join(" ")}`,
	];
	for (let index = 0; index < cube.values.length; index += 3) {
		rows.push(
			`${cube.values[index]} ${cube.values[index + 1]} ${cube.values[index + 2]}`
		);
	}
	return `${rows.join("\n")}\n`;
}

/** Exported only so the parity test can compare this copy with the web one. */
export const __skinToneWeightForParity = skinToneWeight;

export function __buildAdjustedCubeForParity({
	cube,
	dual,
	intensity,
	skinProtection,
}: {
	cube: VideoCubeLut;
	dual?: VideoDualLut;
	intensity: number;
	skinProtection: number;
}) {
	return adjustedCube({ cube, dual, intensity, skinProtection });
}

export function materializeVideoCubeLut({
	name,
	cube,
	dual,
	intensity,
	skinProtection,
}: {
	name: string;
	cube: VideoCubeLut;
	dual?: VideoDualLut;
	intensity: number;
	skinProtection: number;
}): string {
	if (cube.values.length !== cube.size ** 3 * 3) {
		throw new Error("Invalid 3D LUT payload");
	}
	if (
		dual &&
		dual.maskKind !== "skin-tone-v1" &&
		dual.maskKind !== "skin-segmentation-v1"
	) {
		throw new Error("Invalid dual 3D LUT mask kind");
	}
	if (dual && dual.skinCube.values.length !== dual.skinCube.size ** 3 * 3) {
		throw new Error("Invalid dual 3D LUT payload");
	}
	const content = serializeCube({
		name,
		cube: adjustedCube({ cube, dual, intensity, skinProtection }),
	});
	const directory = join(tmpdir(), "qcut-color-luts");
	mkdirSync(directory, { recursive: true });
	const hash = createHash("sha256").update(content).digest("hex").slice(0, 24);
	const filePath = join(directory, `${hash}.cube`);
	if (!existsSync(filePath)) writeFileSync(filePath, content, "utf8");
	return filePath;
}

export function escapeFfmpegFilterPath(filePath: string): string {
	return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
