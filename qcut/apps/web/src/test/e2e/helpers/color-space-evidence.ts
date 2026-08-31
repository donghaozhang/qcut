/**
 * Color-space export evidence helpers.
 *
 * Fixtures are deterministic color bars rendered with explicit BT.601 or
 * BT.709 coding AND matching container/VUI tags, so an export can be judged
 * by decoding through the file's own tags: a truthful pipeline reproduces
 * the bar colors on every frame, while a coded-vs-tagged matrix mismatch
 * shows up as a 20+ level error. Everything runs through the app's bundled
 * FFmpeg/FFprobe, the same binaries the export pipeline uses.
 */

import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";

const execFileAsync = promisify(execFile);

/** Two rows of eight bars: saturated primaries plus mid tones. */
export const COLOR_BAR_ROWS: ReadonlyArray<
	ReadonlyArray<readonly [number, number, number]>
> = [
	[
		[255, 255, 255],
		[255, 255, 0],
		[0, 255, 255],
		[0, 255, 0],
		[255, 0, 255],
		[255, 0, 0],
		[0, 0, 255],
		[0, 0, 0],
	],
	[
		[128, 128, 128],
		[192, 160, 64],
		[31, 189, 95],
		[32, 96, 255],
		[224, 172, 105],
		[60, 120, 180],
		[200, 40, 80],
		[16, 16, 16],
	],
];

export type ColorBarsMatrix = "bt601" | "bt709";

/** swscale matrix name and the FFmpeg tag written for each variant. */
const MATRIX_VARIANTS: Record<
	ColorBarsMatrix,
	{ scaleMatrix: string; tag: string }
> = {
	bt601: { scaleMatrix: "bt601", tag: "smpte170m" },
	bt709: { scaleMatrix: "bt709", tag: "bt709" },
};

const MEASURE_WIDTH = 128;
const MEASURE_HEIGHT = 72;

function buildColorBarsPpm({
	width,
	height,
}: {
	width: number;
	height: number;
}): Buffer {
	const rows = COLOR_BAR_ROWS.length;
	const cols = COLOR_BAR_ROWS[0].length;
	const pixels = Buffer.alloc(width * height * 3);
	for (let y = 0; y < height; y += 1) {
		const row =
			COLOR_BAR_ROWS[Math.min(rows - 1, Math.floor((y * rows) / height))];
		for (let x = 0; x < width; x += 1) {
			const [r, g, b] = row[Math.min(cols - 1, Math.floor((x * cols) / width))];
			const offset = (y * width + x) * 3;
			pixels[offset] = r;
			pixels[offset + 1] = g;
			pixels[offset + 2] = b;
		}
	}
	return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`), pixels]);
}

/**
 * Renders a color-bar clip coded with the given matrix and carrying the
 * matching container and bitstream tags (verified: decoding per tags
 * reproduces the bars within ~3 levels).
 */
export async function generateColorBarsClip({
	filePath,
	matrix,
	seconds,
	fps = 30,
	width = 1280,
	height = 720,
}: {
	filePath: string;
	matrix: ColorBarsMatrix;
	seconds: number;
	fps?: number;
	width?: number;
	height?: number;
}): Promise<void> {
	const { scaleMatrix, tag } = MATRIX_VARIANTS[matrix];
	const ppmPath = `${filePath}.ppm`;
	await writeFile(ppmPath, buildColorBarsPpm({ width, height }));
	try {
		await execFileAsync(getFFmpegPath(), [
			"-y",
			"-v",
			"error",
			"-loop",
			"1",
			"-framerate",
			String(fps),
			"-t",
			String(seconds),
			"-i",
			ppmPath,
			"-vf",
			`scale=out_color_matrix=${scaleMatrix}:out_range=tv,format=yuv420p,setparams=range=tv:color_primaries=${tag}:color_trc=${tag}:colorspace=${tag}`,
			"-c:v",
			"libx264",
			"-crf",
			"10",
			"-g",
			"15",
			"-pix_fmt",
			"yuv420p",
			"-colorspace",
			tag,
			"-color_primaries",
			tag,
			"-color_trc",
			tag,
			"-color_range",
			"tv",
			"-an",
			filePath,
		]);
	} finally {
		await rm(ppmPath, { force: true });
	}
}

export interface ColorTagProbe {
	colorPrimaries: string | null;
	colorRange: string | null;
	colorSpace: string | null;
	colorTransfer: string | null;
	pixelFormat: string | null;
}

/** Reads the video stream's color tags; missing tags come back as null. */
export async function probeColorTags({
	filePath,
}: {
	filePath: string;
}): Promise<ColorTagProbe> {
	const { stdout } = await execFileAsync(await getFFprobePath(), [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=color_space,color_primaries,color_transfer,color_range,pix_fmt",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as {
		streams?: Array<{
			color_primaries?: string;
			color_range?: string;
			color_space?: string;
			color_transfer?: string;
			pix_fmt?: string;
		}>;
	};
	const stream = probe.streams?.[0];
	if (!stream) throw new Error(`No video stream in ${filePath}`);
	const clean = (value?: string) =>
		value && value !== "unknown" ? value : null;
	return {
		colorPrimaries: clean(stream.color_primaries),
		colorRange: clean(stream.color_range),
		colorSpace: clean(stream.color_space),
		colorTransfer: clean(stream.color_transfer),
		pixelFormat: clean(stream.pix_fmt),
	};
}

export type DecodeMatrix = "auto" | ColorBarsMatrix;

export interface ColorBarsMeasurement {
	/** Worst bar error (max abs channel diff, 0-255) for each frame. */
	perFrame: number[];
	maxErr: number;
	meanErr: number;
}

/**
 * Decodes every frame and reports, per frame, the worst absolute channel
 * error of the bar centers against COLOR_BAR_ROWS. `decodeMatrix: "auto"`
 * honors the file's own tags; forcing a matrix shows what a player using
 * that matrix would see, so a correct file scores small on "auto" and
 * large on the wrong forced matrix.
 */
export async function measureColorBarsFrames({
	filePath,
	decodeMatrix,
}: {
	filePath: string;
	decodeMatrix: DecodeMatrix;
}): Promise<ColorBarsMeasurement> {
	const scaleArgs =
		decodeMatrix === "auto"
			? `scale=${MEASURE_WIDTH}:${MEASURE_HEIGHT}:flags=area`
			: `scale=${MEASURE_WIDTH}:${MEASURE_HEIGHT}:flags=area:in_color_matrix=${MATRIX_VARIANTS[decodeMatrix].scaleMatrix}:in_range=tv`;
	const { stdout } = await execFileAsync(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-i",
			filePath,
			"-vf",
			scaleArgs,
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 256 * 1024 * 1024 }
	);
	const pixels = Buffer.from(stdout);
	const frameBytes = MEASURE_WIDTH * MEASURE_HEIGHT * 3;
	const frameCount = Math.floor(pixels.length / frameBytes);
	if (frameCount === 0) {
		throw new Error(`Decoded no frames from ${filePath}`);
	}
	const rows = COLOR_BAR_ROWS.length;
	const cols = COLOR_BAR_ROWS[0].length;
	const perFrame: number[] = [];
	for (let frame = 0; frame < frameCount; frame += 1) {
		const base = frame * frameBytes;
		let worst = 0;
		for (let r = 0; r < rows; r += 1) {
			for (let c = 0; c < cols; c += 1) {
				const x0 = Math.floor((c + 0.3) * (MEASURE_WIDTH / cols));
				const x1 = Math.floor((c + 0.7) * (MEASURE_WIDTH / cols));
				const y0 = Math.floor((r + 0.3) * (MEASURE_HEIGHT / rows));
				const y1 = Math.floor((r + 0.7) * (MEASURE_HEIGHT / rows));
				let sumR = 0;
				let sumG = 0;
				let sumB = 0;
				let count = 0;
				for (let y = y0; y < y1; y += 1) {
					for (let x = x0; x < x1; x += 1) {
						const offset = base + (y * MEASURE_WIDTH + x) * 3;
						sumR += pixels[offset];
						sumG += pixels[offset + 1];
						sumB += pixels[offset + 2];
						count += 1;
					}
				}
				const expected = COLOR_BAR_ROWS[r][c];
				const error = Math.max(
					Math.abs(Math.round(sumR / count) - expected[0]),
					Math.abs(Math.round(sumG / count) - expected[1]),
					Math.abs(Math.round(sumB / count) - expected[2])
				);
				if (error > worst) worst = error;
			}
		}
		perFrame.push(worst);
	}
	const maxErr = Math.max(...perFrame);
	const meanErr =
		perFrame.reduce((total, value) => total + value, 0) / perFrame.length;
	return { perFrame, maxErr, meanErr: Number(meanErr.toFixed(2)) };
}
