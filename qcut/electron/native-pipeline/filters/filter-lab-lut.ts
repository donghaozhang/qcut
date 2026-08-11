/**
 * Reads the 3D LUTs that Jianying caches locally and compares them with QCut's
 * own filter cubes, so recipe work can be measured against a reference instead
 * of eyeballed.
 *
 * Only reads what Jianying itself downloaded during normal use — nothing is
 * fetched from their servers, and no LUT is copied into QCut. The decoded
 * values are decoded on demand for local scoring or an editor session; cached
 * files are never bundled with QCut.
 *
 * @module electron/native-pipeline/filters/filter-lab-lut
 */

import { open, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	inspectTextCubeFile,
	loadTextCubeFile,
} from "./filter-lab-text-cube.js";

/** A cube sampled on a uniform grid, values normalised to 0..1. */
export interface FilterLabCube {
	size: number;
	/** Interleaved RGB, red fastest then green then blue. */
	values: Float64Array;
	domainMin?: [number, number, number];
	domainMax?: [number, number, number];
}

export type JianyingLutRole = "single" | "background" | "skin";

export interface JianyingLutReference {
	lutId: string;
	resourceId: string;
	version: string;
	fileName: string;
	filePath: string;
	role: JianyingLutRole;
	size: number;
}

export interface JianyingLutEntry extends JianyingLutReference {
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

export function createJianyingLutId({
	resourceId,
	version,
	fileName,
}: {
	resourceId: string;
	version: string;
	fileName: string;
}): string {
	return `${resourceId}/${version}/${fileName}`;
}

export function classifyJianyingLutRole({
	fileName,
}: {
	fileName: string;
}): JianyingLutRole {
	const normalized = fileName.toLowerCase();
	if (normalized.includes("skin")) return "skin";
	if (normalized.includes("bg")) return "background";
	return "single";
}

function decodeVfSize({
	header,
	byteLength,
}: {
	header: Buffer;
	byteLength: number;
}): number | null {
	if (header.length < VF_HEADER_BYTES) return null;
	if (header.toString("ascii", 0, 4) !== VF_MAGIC) return null;
	const width = header.readUInt16LE(4);
	const height = header.readUInt16LE(6);
	const depth = header.readUInt16LE(8);
	if (width !== height || height !== depth || width < 2 || width > 256) {
		return null;
	}
	const expected = VF_HEADER_BYTES + width * height * depth * 3 * 4;
	return byteLength === expected ? width : null;
}

/**
 * Decodes Jianying's `.vf` cube: the ASCII magic `VF_V`, three uint16
 * dimensions, then float32 RGB triples ordered red fastest.
 */
export function decodeVfCube({ data }: { data: Buffer }): FilterLabCube | null {
	const width = decodeVfSize({
		header: data.subarray(0, VF_HEADER_BYTES),
		byteLength: data.length,
	});
	if (!width) return null;

	const values = new Float64Array(width ** 3 * 3);
	for (let index = 0; index < values.length; index += 1) {
		values[index] = data.readFloatLE(VF_HEADER_BYTES + index * 4);
	}
	return { size: width, values };
}

export function measureCubeChroma({ cube }: { cube: FilterLabCube }): number {
	let total = 0;
	const entries = cube.values.length / 3;
	for (let index = 0; index < cube.values.length; index += 3) {
		total +=
			Math.abs(cube.values[index] - cube.values[index + 1]) +
			Math.abs(cube.values[index + 1] - cube.values[index + 2]);
	}
	return total / entries;
}

async function readDirectory({ directory }: { directory: string }) {
	try {
		return await readdir(directory);
	} catch {
		return [] as string[];
	}
}

async function inspectVfFile({ filePath }: { filePath: string }) {
	try {
		const handle = await open(filePath, "r");
		try {
			const header = Buffer.alloc(VF_HEADER_BYTES);
			const [{ bytesRead }, stats] = await Promise.all([
				handle.read(header, 0, VF_HEADER_BYTES, 0),
				handle.stat(),
			]);
			if (bytesRead !== VF_HEADER_BYTES) return null;
			return decodeVfSize({ header, byteLength: stats.size });
		} finally {
			await handle.close();
		}
	} catch {
		return null;
	}
}

async function listTextCubeReferences({
	directory,
	resourceId,
	version,
}: {
	directory: string;
	resourceId: string;
	version: string;
}) {
	const fileNames = (await readDirectory({ directory })).filter((fileName) =>
		fileName.toLowerCase().endsWith(".cube")
	);
	const references = await Promise.all(
		fileNames.map(async (fileName) => {
			const filePath = join(directory, fileName);
			const size = await inspectTextCubeFile({ filePath });
			if (!size) return null;
			return {
				lutId: createJianyingLutId({ resourceId, version, fileName }),
				resourceId,
				version,
				fileName,
				filePath,
				role: classifyJianyingLutRole({ fileName }),
				size,
			} satisfies JianyingLutReference;
		})
	);
	return references.filter(
		(reference): reference is JianyingLutReference => reference !== null
	);
}

async function listVersionLuts({
	root,
	resourceId,
	version,
}: {
	root: string;
	resourceId: string;
	version: string;
}): Promise<JianyingLutReference[]> {
	const versionRoot = join(root, resourceId, version);
	const textureDirectory = join(versionRoot, "AmazingFeature", "texture");
	const files = await readDirectory({ directory: textureDirectory });
	const candidates = files
		.filter((fileName) => fileName.toLowerCase().endsWith(".vf"))
		.map(async (fileName) => {
			const filePath = join(textureDirectory, fileName);
			const size = await inspectVfFile({ filePath });
			if (!size) return null;
			return {
				lutId: createJianyingLutId({ resourceId, version, fileName }),
				resourceId,
				version,
				fileName,
				filePath,
				role: classifyJianyingLutRole({ fileName }),
				size,
			} satisfies JianyingLutReference;
		});
	const inspected = await Promise.all(candidates);
	const vfReferences = inspected.filter(
		(reference): reference is JianyingLutReference => reference !== null
	);
	const featureDirectories = (
		await readDirectory({ directory: versionRoot })
	).filter((name) => name.startsWith("AmazingFeature"));
	const textCubeGroups = await Promise.all(
		featureDirectories.map((featureDirectory) =>
			listTextCubeReferences({
				directory: join(versionRoot, featureDirectory, "texture"),
				resourceId,
				version,
			})
		)
	);
	return [...vfReferences, ...textCubeGroups.flat()];
}

async function listResourceLuts({
	root,
	resourceId,
}: {
	root: string;
	resourceId: string;
}): Promise<JianyingLutReference[]> {
	const versions = await readDirectory({ directory: join(root, resourceId) });
	const references = await Promise.all(
		versions.map((version) => listVersionLuts({ root, resourceId, version }))
	);
	return references.flat();
}

function compareLutReferences(
	left: JianyingLutReference,
	right: JianyingLutReference
) {
	return (
		left.resourceId.localeCompare(right.resourceId) ||
		left.version.localeCompare(right.version) ||
		left.fileName.localeCompare(right.fileName)
	);
}

/** Lists valid local LUT files without decoding their full cube payloads. */
export async function listJianyingLutReferences({
	root = jianyingEffectCacheRoot(),
}: {
	root?: string;
} = {}): Promise<JianyingLutReference[]> {
	const resourceIds = await readDirectory({ directory: root });
	const references = await Promise.all(
		resourceIds.map((resourceId) => listResourceLuts({ root, resourceId }))
	);
	return references.flat().sort(compareLutReferences);
}

export async function loadJianyingLut({
	reference,
}: {
	reference: JianyingLutReference;
}): Promise<JianyingLutEntry | null> {
	try {
		const cube = reference.fileName.toLowerCase().endsWith(".cube")
			? await loadTextCubeFile({ filePath: reference.filePath })
			: decodeVfCube({ data: await readFile(reference.filePath) });
		if (!cube || cube.size !== reference.size) return null;
		return { ...reference, cube, chroma: measureCubeChroma({ cube }) };
	} catch {
		return null;
	}
}

/** Lists and decodes every Jianying LUT currently in the local effect cache. */
export async function listJianyingLuts({
	root = jianyingEffectCacheRoot(),
}: {
	root?: string;
} = {}): Promise<JianyingLutEntry[]> {
	const references = await listJianyingLutReferences({ root });
	const loaded = await Promise.all(
		references.map((reference) => loadJianyingLut({ reference }))
	);
	return loaded.filter((entry): entry is JianyingLutEntry => entry !== null);
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
	const scale = ({ value, axis }: { value: number; axis: 0 | 1 | 2 }) => {
		const minimum = cube.domainMin?.[axis] ?? 0;
		const maximum = cube.domainMax?.[axis] ?? 1;
		const normalized =
			(value - minimum) / Math.max(0.000001, maximum - minimum);
		return Math.min(1, Math.max(0, normalized)) * last;
	};
	const rf = scale({ value: red, axis: 0 });
	const gf = scale({ value: green, axis: 1 });
	const bf = scale({ value: blue, axis: 2 });
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
