/**
 * Reads the 3D LUTs that Jianying caches locally and compares them with QCut's
 * own filter cubes, so recipe work can be measured against a reference instead
 * of eyeballed.
 *
 * Only reads what Jianying itself downloaded during normal use — nothing is
 * fetched from their servers, and no LUT is copied into QCut. The decoded
 * values exist to score our recipes, not to ship.
 *
 * @module electron/native-pipeline/filters/filter-lab-lut
 */

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** A cube sampled on a uniform grid, values normalised to 0..1. */
export interface FilterLabCube {
	size: number;
	/** Interleaved RGB, red fastest then green then blue. */
	values: Float64Array;
}

export interface JianyingLutEntry {
	resourceId: string;
	fileName: string;
	filePath: string;
	cube: FilterLabCube;
	/** Mean |r-g| + |g-b| across the cube; near zero means a monochrome look. */
	chroma: number;
}

const VF_MAGIC = "VF_V";
const VF_HEADER_BYTES = 10;

export function jianyingEffectCacheRoot(): string {
	return join(
		homedir(),
		"Movies",
		"JianyingPro",
		"User Data",
		"Cache",
		"artistEffect"
	);
}

/**
 * Decodes Jianying's `.vf` cube: the ASCII magic `VF_V`, three uint16
 * dimensions, then float32 RGB triples ordered red fastest.
 */
export function decodeVfCube({ data }: { data: Buffer }): FilterLabCube | null {
	if (data.length < VF_HEADER_BYTES) return null;
	if (data.toString("ascii", 0, 4) !== VF_MAGIC) return null;
	const width = data.readUInt16LE(4);
	const height = data.readUInt16LE(6);
	const depth = data.readUInt16LE(8);
	if (width !== height || height !== depth || width < 2 || width > 256) {
		return null;
	}
	const expected = width * height * depth * 3 * 4;
	if (data.length - VF_HEADER_BYTES !== expected) return null;

	const values = new Float64Array(width * height * depth * 3);
	for (let index = 0; index < values.length; index += 1) {
		values[index] = data.readFloatLE(VF_HEADER_BYTES + index * 4);
	}
	return { size: width, values };
}

function cubeChroma({ cube }: { cube: FilterLabCube }): number {
	let total = 0;
	const entries = cube.values.length / 3;
	for (let index = 0; index < cube.values.length; index += 3) {
		total +=
			Math.abs(cube.values[index] - cube.values[index + 1]) +
			Math.abs(cube.values[index + 1] - cube.values[index + 2]);
	}
	return total / entries;
}

/** Lists every Jianying LUT currently sitting in the local effect cache. */
export async function listJianyingLuts(): Promise<JianyingLutEntry[]> {
	const root = jianyingEffectCacheRoot();
	let resourceDirs: string[];
	try {
		resourceDirs = await readdir(root);
	} catch {
		return [];
	}

	const entries: JianyingLutEntry[] = [];
	for (const resourceId of resourceDirs) {
		let versionDirs: string[];
		try {
			versionDirs = await readdir(join(root, resourceId));
		} catch {
			continue;
		}
		for (const version of versionDirs) {
			const textureDir = join(
				root,
				resourceId,
				version,
				"AmazingFeature",
				"texture"
			);
			let files: string[];
			try {
				files = await readdir(textureDir);
			} catch {
				continue;
			}
			for (const fileName of files) {
				if (!fileName.endsWith(".vf")) continue;
				const filePath = join(textureDir, fileName);
				const cube = decodeVfCube({ data: readFileSync(filePath) });
				if (!cube) continue;
				entries.push({
					resourceId,
					fileName,
					filePath,
					cube,
					chroma: cubeChroma({ cube }),
				});
			}
		}
	}
	return entries.sort((left, right) =>
		left.resourceId.localeCompare(right.resourceId)
	);
}

/** Trilinear sample, matching the tetrahedral-free path used for scoring. */
export function sampleCube({
	cube,
	red,
	green,
	blue,
}: {
	cube: FilterLabCube;
	red: number;
	green: number;
	blue: number;
}): [number, number, number] {
	const last = cube.size - 1;
	const scale = (value: number) => Math.min(last, Math.max(0, value)) * last;
	const rf = scale(red);
	const gf = scale(green);
	const bf = scale(blue);
	const r0 = Math.floor(rf);
	const g0 = Math.floor(gf);
	const b0 = Math.floor(bf);
	const r1 = Math.min(last, r0 + 1);
	const g1 = Math.min(last, g0 + 1);
	const b1 = Math.min(last, b0 + 1);
	const rd = rf - r0;
	const gd = gf - g0;
	const bd = bf - b0;

	const at = (r: number, g: number, b: number, channel: number) =>
		cube.values[((b * cube.size + g) * cube.size + r) * 3 + channel];

	const out: [number, number, number] = [0, 0, 0];
	for (let channel = 0; channel < 3; channel += 1) {
		const c00 =
			at(r0, g0, b0, channel) * (1 - rd) + at(r1, g0, b0, channel) * rd;
		const c10 =
			at(r0, g1, b0, channel) * (1 - rd) + at(r1, g1, b0, channel) * rd;
		const c01 =
			at(r0, g0, b1, channel) * (1 - rd) + at(r1, g0, b1, channel) * rd;
		const c11 =
			at(r0, g1, b1, channel) * (1 - rd) + at(r1, g1, b1, channel) * rd;
		out[channel] =
			(c00 * (1 - gd) + c10 * gd) * (1 - bd) + (c01 * (1 - gd) + c11 * gd) * bd;
	}
	return out;
}

/**
 * Colours to score over. A uniform grid covers the whole cube, including
 * saturated corners real footage never contains; sampling an actual frame
 * weights the score by what a viewer would see. The two disagree substantially
 * — grid scoring reported a median 18.9 levels where frame scoring reported
 * 6.3 on the same libraries — so the caller picks deliberately.
 */
export type ScoreColours = { red: number; green: number; blue: number }[];

/** Uniform grid over the colour cube. */
export function gridColours({ steps = 16 }: { steps?: number }): ScoreColours {
	const out: ScoreColours = [];
	for (let r = 0; r < steps; r += 1) {
		for (let g = 0; g < steps; g += 1) {
			for (let b = 0; b < steps; b += 1) {
				out.push({
					red: r / (steps - 1),
					green: g / (steps - 1),
					blue: b / (steps - 1),
				});
			}
		}
	}
	return out;
}

/**
 * Colours taken from an actual frame, so the score reflects what the footage
 * contains. Uses ffmpeg to decode one frame to raw RGB and keeps every Nth
 * pixel.
 */
export async function frameColours({
	videoOrImage,
	maxSamples = 20000,
}: {
	videoOrImage: string;
	maxSamples?: number;
}): Promise<ScoreColours> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const { getFFmpegPath } = await import("../../ffmpeg/paths.js");
	const run = promisify(execFile);
	const { stdout } = await run(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-i",
			videoOrImage,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
	);
	const pixels = Math.floor(stdout.length / 3);
	if (pixels === 0) {
		throw new Error(`No frame decoded from ${videoOrImage}`);
	}
	const stride = Math.max(1, Math.floor(pixels / maxSamples));
	const out: ScoreColours = [];
	for (let index = 0; index < pixels; index += stride) {
		const offset = index * 3;
		out.push({
			red: stdout[offset] / 255,
			green: stdout[offset + 1] / 255,
			blue: stdout[offset + 2] / 255,
		});
	}
	return out;
}

export interface CubeDistance {
	/** RMSE in 0-255 channel levels over the sampled colours. */
	rmse: number;
	/** Largest single-channel difference, in 0-255 levels. */
	maxDelta: number;
}

/** Scores two cubes over the supplied colours, in 0-255 channel levels. */
export function compareCubes({
	left,
	right,
	colours,
}: {
	left: FilterLabCube;
	right: FilterLabCube;
	colours: ScoreColours;
}): CubeDistance {
	let squared = 0;
	let count = 0;
	let maxDelta = 0;
	for (const { red, green, blue } of colours) {
		const a = sampleCube({ cube: left, red, green, blue });
		const c = sampleCube({ cube: right, red, green, blue });
		for (let channel = 0; channel < 3; channel += 1) {
			const delta = (a[channel] - c[channel]) * 255;
			squared += delta * delta;
			count += 1;
			maxDelta = Math.max(maxDelta, Math.abs(delta));
		}
	}
	return { rmse: Math.sqrt(squared / count), maxDelta };
}
