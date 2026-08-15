import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface PixelDifferenceMetrics {
	width: number;
	height: number;
	channelCount: number;
	sampleCount: number;
	mae: number;
	rmse: number;
	maxAbsoluteError: number;
	p95AbsoluteError: number;
}

export interface RawPixels {
	data: Uint8Array;
	width: number;
	height: number;
	channels: number;
}

function ppmToken({ bytes, cursor }: { bytes: Uint8Array; cursor: number }) {
	let position = cursor;
	while (position < bytes.length) {
		const byte = bytes[position];
		if (byte === 35) {
			while (position < bytes.length && bytes[position] !== 10) position += 1;
			continue;
		}
		if (byte > 32) break;
		position += 1;
	}
	const start = position;
	while (position < bytes.length && bytes[position] > 32) position += 1;
	return {
		value: new TextDecoder().decode(bytes.slice(start, position)),
		cursor: position,
	};
}

function parsePpm({ bytes }: { bytes: Uint8Array }): RawPixels {
	const magic = ppmToken({ bytes, cursor: 0 });
	const width = ppmToken({ bytes, cursor: magic.cursor });
	const height = ppmToken({ bytes, cursor: width.cursor });
	const maxValue = ppmToken({ bytes, cursor: height.cursor });
	if (magic.value !== "P6" || maxValue.value !== "255") {
		throw new Error("FFmpeg returned an unsupported PPM frame");
	}
	const resolvedWidth = Number(width.value);
	const resolvedHeight = Number(height.value);
	if (!(resolvedWidth > 0 && resolvedHeight > 0)) {
		throw new Error("FFmpeg returned invalid frame dimensions");
	}
	let dataStart = maxValue.cursor;
	if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) dataStart += 2;
	else if ((bytes[dataStart] ?? 255) <= 32) dataStart += 1;
	const expectedLength = resolvedWidth * resolvedHeight * 3;
	const data = bytes.slice(dataStart, dataStart + expectedLength);
	if (data.length !== expectedLength) {
		throw new Error(
			`FFmpeg returned ${data.length} RGB bytes; expected ${expectedLength}`
		);
	}
	return {
		data,
		width: resolvedWidth,
		height: resolvedHeight,
		channels: 3,
	};
}

export function resolveFfmpegExecutable({
	explicitPath,
}: {
	explicitPath?: string;
}) {
	const platformDirectory =
		process.platform === "darwin"
			? `darwin-${process.arch === "arm64" ? "arm64" : "x64"}`
			: process.platform === "win32"
				? "win32-x64"
				: "linux-x64";
	const candidates = [
		explicitPath ?? "",
		process.env.FFMPEG_PATH ?? "",
		path.join(
			process.cwd(),
			"electron/resources/ffmpeg",
			platformDirectory,
			process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
		),
		Bun.which("ffmpeg") ?? "",
	];
	const executable = candidates.find(
		(candidate) => candidate && existsSync(candidate)
	);
	if (!executable) {
		throw new Error(
			"FFmpeg was not found; pass --ffmpeg-path or set FFMPEG_PATH"
		);
	}
	return path.resolve(executable);
}

async function decodeWithFfmpeg({
	filePath,
	ffmpegPath,
}: {
	filePath: string;
	ffmpegPath: string;
}) {
	const child = Bun.spawn(
		[
			ffmpegPath,
			"-v",
			"error",
			"-i",
			filePath,
			"-frames:v",
			"1",
			"-pix_fmt",
			"rgb24",
			"-f",
			"image2pipe",
			"-vcodec",
			"ppm",
			"pipe:1",
		],
		{ stdout: "pipe", stderr: "pipe" }
	);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).arrayBuffer(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || `FFmpeg exited with code ${exitCode}`);
	}
	return new Uint8Array(stdout);
}

export async function rawPixels({
	filePath,
	ffmpegPath,
}: {
	filePath: string;
	ffmpegPath?: string;
}): Promise<RawPixels> {
	if ([".ppm", ".pnm"].includes(path.extname(filePath).toLowerCase())) {
		return parsePpm({ bytes: readFileSync(filePath) });
	}
	const executable = resolveFfmpegExecutable({ explicitPath: ffmpegPath });
	return parsePpm({
		bytes: await decodeWithFfmpeg({ filePath, ffmpegPath: executable }),
	});
}

function percentileFromHistogram({
	histogram,
	sampleCount,
	percentile,
}: {
	histogram: number[];
	sampleCount: number;
	percentile: number;
}) {
	const target = Math.ceil(sampleCount * percentile);
	let cumulative = 0;
	for (const [value, count] of histogram.entries()) {
		cumulative += count;
		if (cumulative >= target) return value;
	}
	return histogram.length - 1;
}

export async function compareCaptureImages({
	referencePath,
	candidatePath,
	ffmpegPath,
}: {
	referencePath: string;
	candidatePath: string;
	ffmpegPath?: string;
}): Promise<PixelDifferenceMetrics> {
	const [reference, candidate] = await Promise.all([
		rawPixels({ filePath: referencePath, ffmpegPath }),
		rawPixels({ filePath: candidatePath, ffmpegPath }),
	]);
	if (
		reference.width !== candidate.width ||
		reference.height !== candidate.height ||
		reference.channels !== candidate.channels
	) {
		throw new Error(
			`Capture dimensions differ: ${reference.width}x${reference.height}x${reference.channels} vs ${candidate.width}x${candidate.height}x${candidate.channels}`
		);
	}
	const histogram = Array.from({ length: 256 }, () => 0);
	let absoluteErrorSum = 0;
	let squaredErrorSum = 0;
	let maxAbsoluteError = 0;
	for (let index = 0; index < reference.data.length; index += 1) {
		const difference = Math.abs(reference.data[index] - candidate.data[index]);
		absoluteErrorSum += difference;
		squaredErrorSum += difference * difference;
		maxAbsoluteError = Math.max(maxAbsoluteError, difference);
		histogram[difference] += 1;
	}
	const sampleCount = reference.data.length;
	return {
		width: reference.width,
		height: reference.height,
		channelCount: reference.channels,
		sampleCount,
		mae: absoluteErrorSum / sampleCount,
		rmse: Math.sqrt(squaredErrorSum / sampleCount),
		maxAbsoluteError,
		p95AbsoluteError: percentileFromHistogram({
			histogram,
			sampleCount,
			percentile: 0.95,
		}),
	};
}
