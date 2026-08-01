import type { ColorCubeLut } from "@/types/timeline";
import { clamp01, luminance, type RgbColor } from "./color-space-math";

export const COLOR_LUT_PRESETS = [
	{ id: "none", name: "无" },
	{ id: "cinematic", name: "电影青橙" },
	{ id: "warm-film", name: "暖色胶片" },
	{ id: "cool-clean", name: "冷调清透" },
	{ id: "vintage", name: "复古褪色" },
	{ id: "monochrome", name: "黑白" },
] as const;

export type ColorLutPresetId = (typeof COLOR_LUT_PRESETS)[number]["id"];

export interface ParsedCubeLut {
	name: string;
	cube: ColorCubeLut;
}

export interface ParsedLutFile {
	name: string;
	cube: ColorCubeLut;
}

function lutNameFromFile({ fallbackName }: { fallbackName: string }): string {
	return fallbackName.replace(/\.(cube|3dl)$/i, "");
}

function parseTriplet({
	line,
	label,
}: {
	line: string;
	label: string;
}): [number, number, number] {
	const values = line.trim().split(/\s+/).slice(1).map(Number);
	if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
		throw new Error(`Invalid ${label} declaration`);
	}
	return [values[0], values[1], values[2]];
}

export function parseCubeLut({
	text,
	fallbackName,
}: {
	text: string;
	fallbackName: string;
}): ParsedCubeLut {
	let name = lutNameFromFile({ fallbackName });
	let size = 0;
	let domainMin: [number, number, number] = [0, 0, 0];
	let domainMax: [number, number, number] = [1, 1, 1];
	const values: number[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (!line) continue;
		if (line.startsWith("TITLE")) {
			name = line.slice(5).trim().replace(/^"|"$/g, "") || name;
			continue;
		}
		if (line.startsWith("LUT_1D_SIZE")) {
			throw new Error("1D LUT files are not supported; choose a 3D .cube LUT");
		}
		if (line.startsWith("LUT_3D_SIZE")) {
			size = Number(line.split(/\s+/)[1]);
			if (!Number.isInteger(size) || size < 2 || size > 65) {
				throw new Error("LUT_3D_SIZE must be between 2 and 65");
			}
			continue;
		}
		if (line.startsWith("DOMAIN_MIN")) {
			domainMin = parseTriplet({ line, label: "DOMAIN_MIN" });
			continue;
		}
		if (line.startsWith("DOMAIN_MAX")) {
			domainMax = parseTriplet({ line, label: "DOMAIN_MAX" });
			continue;
		}
		const channels = line.split(/\s+/).map(Number);
		if (
			channels.length !== 3 ||
			channels.some((value) => !Number.isFinite(value))
		) {
			throw new Error(`Invalid LUT data row: ${line.slice(0, 80)}`);
		}
		values.push(...channels);
	}
	if (size === 0) throw new Error("Missing LUT_3D_SIZE declaration");
	const expected = size ** 3 * 3;
	if (values.length !== expected) {
		throw new Error(
			`Expected ${expected / 3} LUT rows, found ${values.length / 3}`
		);
	}
	return { name, cube: { size, domainMin, domainMax, values } };
}

function cubeSizeFromRowCount({ rowCount }: { rowCount: number }): number {
	const size = Math.round(Math.cbrt(rowCount));
	if (size ** 3 !== rowCount || size < 2 || size > 65) {
		throw new Error("3DL data must contain a complete 3D LUT grid");
	}
	return size;
}

function parseThreeDlBitDepth({ line }: { line: string }): number | undefined {
	const [, , outputBits] = line.match(/^Mesh\s+(\d+)\s+(\d+)/i) ?? [];
	const bits = Number(outputBits);
	if (!Number.isInteger(bits) || bits < 8 || bits > 16) return;
	return bits;
}

export function parseThreeDlLut({
	text,
	fallbackName,
}: {
	text: string;
	fallbackName: string;
}): ParsedLutFile {
	let outputScale = 0;
	const rows: number[][] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		if (!line) continue;
		const bitDepth = parseThreeDlBitDepth({ line });
		if (bitDepth) {
			outputScale = 2 ** bitDepth - 1;
			continue;
		}
		const numbers = line.split(/\s+/).map(Number);
		if (numbers.some((value) => !Number.isFinite(value))) continue;
		if (numbers.length === 3) {
			rows.push(numbers);
			continue;
		}
		if (numbers.length >= 6) {
			rows.push(numbers.slice(-3));
		}
	}
	if (rows.length === 0) throw new Error("Missing 3DL color data");
	const size = cubeSizeFromRowCount({ rowCount: rows.length });
	const maxValue = Math.max(...rows.flat());
	const normalizer = outputScale || (maxValue > 1 ? maxValue : 1);
	const values = rows.flatMap((row) =>
		row.map((value) => clamp01(value / normalizer))
	);
	return {
		name: lutNameFromFile({ fallbackName }),
		cube: {
			size,
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
			values,
		},
	};
}

export function parseLutFile({
	text,
	fallbackName,
}: {
	text: string;
	fallbackName: string;
}): ParsedLutFile {
	const firstContentLine = text
		.split(/\r?\n/)
		.map((line) => line.replace(/#.*$/, "").trim())
		.find(Boolean);
	if (
		/\.3dl$/i.test(fallbackName) ||
		/^3DMESH$/i.test(firstContentLine ?? "")
	) {
		return parseThreeDlLut({ text, fallbackName });
	}
	return parseCubeLut({ text, fallbackName });
}

function presetTransform({
	id,
	color,
}: {
	id: Exclude<ColorLutPresetId, "none">;
	color: RgbColor;
}): RgbColor {
	const luma = luminance(color);
	if (id === "monochrome") return { r: luma, g: luma, b: luma };
	if (id === "warm-film") {
		return {
			r: color.r * 1.08 + 0.015,
			g: color.g * 1.01,
			b: color.b * 0.9 + 0.01,
		};
	}
	if (id === "cool-clean") {
		return {
			r: color.r * 0.94,
			g: color.g * 1.01 + 0.01,
			b: color.b * 1.08 + 0.015,
		};
	}
	if (id === "vintage") {
		return {
			r: color.r * 0.88 + luma * 0.12 + 0.06,
			g: color.g * 0.84 + luma * 0.16 + 0.045,
			b: color.b * 0.75 + luma * 0.25 + 0.035,
		};
	}
	const shadows = (1 - luma) ** 2;
	const highlights = luma ** 2;
	return {
		r: (color.r - 0.5) * 1.12 + 0.5 - shadows * 0.035 + highlights * 0.07,
		g: (color.g - 0.5) * 1.08 + 0.5 + shadows * 0.025 + highlights * 0.025,
		b: (color.b - 0.5) * 1.12 + 0.5 + shadows * 0.07 - highlights * 0.035,
	};
}

export function buildPresetCube({
	id,
	size = 17,
}: {
	id: Exclude<ColorLutPresetId, "none">;
	size?: number;
}): ColorCubeLut {
	const values: number[] = [];
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				const transformed = presetTransform({
					id,
					color: {
						r: red / (size - 1),
						g: green / (size - 1),
						b: blue / (size - 1),
					},
				});
				values.push(
					clamp01(transformed.r),
					clamp01(transformed.g),
					clamp01(transformed.b)
				);
			}
		}
	}
	return { size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], values };
}

export function serializeCubeLut({
	name,
	cube,
}: {
	name: string;
	cube: ColorCubeLut;
}): string {
	const rows = [
		`TITLE "${name.replaceAll('"', "")}"`,
		`LUT_3D_SIZE ${cube.size}`,
	];
	rows.push(`DOMAIN_MIN ${cube.domainMin.join(" ")}`);
	rows.push(`DOMAIN_MAX ${cube.domainMax.join(" ")}`);
	for (let index = 0; index < cube.values.length; index += 3) {
		rows.push(
			`${cube.values[index]} ${cube.values[index + 1]} ${cube.values[index + 2]}`
		);
	}
	return `${rows.join("\n")}\n`;
}
