import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoColorSettings } from "./color-settings";

type VideoCubeLut = NonNullable<VideoColorSettings["lut"]["cube"]>;

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

function hueDistance(left: number, right: number): number {
	const distance = Math.abs(left - right);
	return Math.min(distance, 1 - distance);
}

function adjustedCube({
	cube,
	intensity,
	skinProtection,
}: {
	cube: VideoCubeLut;
	intensity: number;
	skinProtection: number;
}): VideoCubeLut {
	const values: number[] = [];
	let valueIndex = 0;
	for (let blue = 0; blue < cube.size; blue += 1) {
		for (let green = 0; green < cube.size; green += 1) {
			for (let red = 0; red < cube.size; red += 1) {
				const input = {
					r: red / (cube.size - 1),
					g: green / (cube.size - 1),
					b: blue / (cube.size - 1),
				};
				const output = {
					r: cube.values[valueIndex] ?? input.r,
					g: cube.values[valueIndex + 1] ?? input.g,
					b: cube.values[valueIndex + 2] ?? input.b,
				};
				const hsl = rgbToHsl(input);
				const hueWeight = Math.max(0, 1 - hueDistance(hsl.h, 28 / 360) / 0.09);
				const skinWeight =
					hueWeight *
					Math.min(1, hsl.s * 2) *
					Math.min(1, hsl.l * 4) *
					Math.min(1, (1 - hsl.l) * 4);
				const amount =
					(intensity / 100) * (1 - skinWeight * (skinProtection / 100));
				values.push(
					clamp01(input.r + (output.r - input.r) * amount),
					clamp01(input.g + (output.g - input.g) * amount),
					clamp01(input.b + (output.b - input.b) * amount)
				);
				valueIndex += 3;
			}
		}
	}
	return { ...cube, values };
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

export function materializeVideoCubeLut({
	name,
	cube,
	intensity,
	skinProtection,
}: {
	name: string;
	cube: VideoCubeLut;
	intensity: number;
	skinProtection: number;
}): string {
	if (cube.values.length !== cube.size ** 3 * 3) {
		throw new Error("Invalid 3D LUT payload");
	}
	const content = serializeCube({
		name,
		cube: adjustedCube({ cube, intensity, skinProtection }),
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
