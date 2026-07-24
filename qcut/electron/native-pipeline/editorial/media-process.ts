import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import {
	getFFmpegPath as resolveFFmpegPath,
	getFFprobePath as resolveFFprobePath,
} from "../../ffmpeg/paths.js";
import type { MediaProbe } from "./types.js";

const execFileAsync = promisify(execFile);
const VIDEO_EXTENSIONS = new Set([
	".avi",
	".m2ts",
	".m4v",
	".mkv",
	".mov",
	".mp4",
	".mpeg",
	".mpg",
	".mts",
	".webm",
]);
let cachedFFmpegPath: string | undefined;
let cachedFFprobePath: Promise<string> | undefined;

function getEditorialFFmpegPath(): string {
	cachedFFmpegPath ??= resolveFFmpegPath();
	return cachedFFmpegPath;
}

function getEditorialFFprobePath(): Promise<string> {
	cachedFFprobePath ??= resolveFFprobePath();
	return cachedFFprobePath;
}

interface ProcessOutput {
	stdout: Buffer;
	stderr: string;
}

function parseFrameRate({ value }: { value?: string }): number {
	if (!value) return 0;
	if (!value.includes("/")) {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	const [numeratorText, denominatorText] = value.split("/");
	const numerator = Number.parseFloat(numeratorText ?? "");
	const denominator = Number.parseFloat(denominatorText ?? "");
	if (
		!Number.isFinite(numerator) ||
		!Number.isFinite(denominator) ||
		denominator <= 0
	) {
		return 0;
	}
	return numerator / denominator;
}

function parseProbeJson({ value }: { value: string }): MediaProbe {
	const parsed = JSON.parse(value) as {
		format?: { duration?: string };
		streams?: Array<{
			codec_type?: string;
			codec_name?: string;
			width?: number;
			height?: number;
			avg_frame_rate?: string;
			r_frame_rate?: string;
			duration?: string;
			sample_rate?: string;
			channels?: number;
		}>;
	};
	const video = parsed.streams?.find((stream) => stream.codec_type === "video");
	if (!video) throw new Error("Media has no video stream");
	const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
	const duration = Number.parseFloat(
		video.duration || parsed.format?.duration || "0"
	);
	const fps = parseFrameRate({
		value: video.avg_frame_rate || video.r_frame_rate,
	});
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Unable to determine media duration");
	}
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error("Unable to determine video frame rate");
	}
	if (!video.width || !video.height) {
		throw new Error("Unable to determine video dimensions");
	}
	const sampleRate = Number.parseInt(audio?.sample_rate || "", 10);
	return {
		duration,
		width: video.width,
		height: video.height,
		fps,
		videoCodec: video.codec_name,
		audioCodec: audio?.codec_name,
		hasAudio: Boolean(audio),
		sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
		channels: audio?.channels,
	};
}

async function runProcess({
	command,
	args,
	signal,
	maxOutputBytes = 64 * 1024 * 1024,
}: {
	command: string;
	args: string[];
	signal?: AbortSignal;
	maxOutputBytes?: number;
}): Promise<ProcessOutput> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let outputBytes = 0;
		let settled = false;

		const finishWithError = ({ error }: { error: Error }): void => {
			if (settled) return;
			settled = true;
			child.kill("SIGKILL");
			rejectPromise(error);
		};
		const abort = (): void =>
			finishWithError({ error: new Error("Media processing cancelled") });
		signal?.addEventListener("abort", abort, { once: true });

		child.stdout.on("data", (chunk: Buffer) => {
			outputBytes += chunk.length;
			if (outputBytes > maxOutputBytes) {
				finishWithError({
					error: new Error(
						`Media process output exceeded ${maxOutputBytes} bytes`
					),
				});
				return;
			}
			stdoutChunks.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderrChunks.push(chunk);
		});
		child.on("error", (error) => finishWithError({ error }));
		child.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			if (settled) return;
			settled = true;
			const stderr = Buffer.concat(stderrChunks).toString("utf8");
			if (code !== 0) {
				rejectPromise(
					new Error(
						`${command} exited with code ${code}: ${stderr.trim().slice(-2000)}`
					)
				);
				return;
			}
			resolvePromise({
				stdout: Buffer.concat(stdoutChunks),
				stderr,
			});
		});
	});
}

async function readDirectoryVideos({
	directory,
	recursive,
}: {
	directory: string;
	recursive: boolean;
}): Promise<string[]> {
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const files = entries.flatMap((entry) => {
		const path = join(directory, entry.name);
		if (
			!entry.name.startsWith(".") &&
			entry.isFile() &&
			VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())
		) {
			return [path];
		}
		return [];
	});
	if (!recursive) return files;
	const childDirectories = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(directory, entry.name));
	const nested = await Promise.all(
		childDirectories.map((childDirectory) =>
			readDirectoryVideos({ directory: childDirectory, recursive: true })
		)
	);
	return [...files, ...nested.flat()];
}

export async function discoverVideoFiles({
	directory,
	recursive,
}: {
	directory: string;
	recursive: boolean;
}): Promise<string[]> {
	const root = resolve(directory);
	const stat = await fs.stat(root);
	if (!stat.isDirectory()) throw new Error(`${root} is not a directory`);
	const files = await readDirectoryVideos({ directory: root, recursive });
	return files.sort((left, right) => left.localeCompare(right));
}

export async function fingerprintFile({
	path,
}: {
	path: string;
}): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		const hash = createHash("sha256");
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", rejectPromise);
		stream.on("end", () => resolvePromise(hash.digest("hex")));
	});
}

export async function probeMedia({
	path,
}: {
	path: string;
}): Promise<MediaProbe> {
	const ffprobePath = await getEditorialFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,duration,sample_rate,channels",
			"-of",
			"json",
			path,
		],
		{ maxBuffer: 8 * 1024 * 1024 }
	);
	return parseProbeJson({ value: stdout });
}

export async function probeDuration({
	path,
}: {
	path: string;
}): Promise<number> {
	const ffprobePath = await getEditorialFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			path,
		],
		{ maxBuffer: 1024 * 1024 }
	);
	const duration = Number.parseFloat(stdout.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Unable to determine media duration");
	}
	return duration;
}

export async function detectSceneBoundaries({
	path,
	duration,
	threshold,
	signal,
}: {
	path: string;
	duration: number;
	threshold: number;
	signal?: AbortSignal;
}): Promise<number[]> {
	const filter = `select='eq(n\\,0)+gt(scene\\,${threshold})',showinfo`;
	const { stderr } = await runProcess({
		command: getEditorialFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"info",
			"-i",
			path,
			"-map",
			"0:v:0",
			"-vf",
			filter,
			"-an",
			"-f",
			"null",
			"-",
		],
		signal,
		maxOutputBytes: 2 * 1024 * 1024,
	});
	const timestamps = [...stderr.matchAll(/pts_time:([0-9.]+)/g)]
		.map((match) => Number.parseFloat(match[1]))
		.filter(
			(value) => Number.isFinite(value) && value >= 0 && value < duration - 0.05
		);
	return [
		...new Set([0, ...timestamps.map((value) => Number(value.toFixed(3)))]),
	].sort((left, right) => left - right);
}

export async function extractGrayscaleSamples({
	path,
	fps,
	width,
	height,
	signal,
}: {
	path: string;
	fps: number;
	width: number;
	height: number;
	signal?: AbortSignal;
}): Promise<Buffer[]> {
	const frameBytes = width * height;
	const { stdout } = await runProcess({
		command: getEditorialFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			path,
			"-map",
			"0:v:0",
			"-vf",
			`fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=gray`,
			"-an",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"gray",
			"-",
		],
		signal,
		maxOutputBytes: 512 * 1024 * 1024,
	});
	const frameCount = Math.floor(stdout.length / frameBytes);
	return Array.from({ length: frameCount }, (_, index) => {
		const start = index * frameBytes;
		return stdout.subarray(start, start + frameBytes);
	});
}

async function extractRgbFrame({
	path,
	time,
	width,
	height,
	signal,
}: {
	path: string;
	time: number;
	width: number;
	height: number;
	signal?: AbortSignal;
}): Promise<Buffer> {
	const { stdout } = await runProcess({
		command: getEditorialFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			String(Math.max(0, time)),
			"-i",
			path,
			"-map",
			"0:v:0",
			"-frames:v",
			"1",
			"-vf",
			`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,format=rgb24`,
			"-an",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-",
		],
		signal,
		maxOutputBytes: width * height * 3 + 1024,
	});
	const expectedBytes = width * height * 3;
	if (stdout.length < expectedBytes) {
		throw new Error(`Unable to extract frame at ${time.toFixed(3)}s`);
	}
	return stdout.subarray(0, expectedBytes);
}

async function extractJpegFrame({
	path,
	time,
	width,
	height,
	signal,
}: {
	path: string;
	time: number;
	width: number;
	height: number;
	signal?: AbortSignal;
}): Promise<Buffer> {
	const { stdout } = await runProcess({
		command: getEditorialFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			String(Math.max(0, time)),
			"-i",
			path,
			"-map",
			"0:v:0",
			"-frames:v",
			"1",
			"-vf",
			`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
			"-an",
			"-q:v",
			"5",
			"-c:v",
			"mjpeg",
			"-f",
			"image2pipe",
			"-",
		],
		signal,
		maxOutputBytes: 2 * 1024 * 1024,
	});
	if (stdout.length < 4 || stdout[0] !== 0xff || stdout[1] !== 0xd8) {
		throw new Error(`Unable to extract JPEG frame at ${time.toFixed(3)}s`);
	}
	return stdout;
}

export async function extractJpegDataUrls({
	path,
	times,
	width = 640,
	height = 360,
	signal,
}: {
	path: string;
	times: number[];
	width?: number;
	height?: number;
	signal?: AbortSignal;
}): Promise<string[]> {
	const frames = await Promise.all(
		times.map((time) => extractJpegFrame({ path, time, width, height, signal }))
	);
	return frames.map(
		(frame) => `data:image/jpeg;base64,${frame.toString("base64")}`
	);
}

export async function extractRgbFrames({
	path,
	times,
	width,
	height,
	signal,
}: {
	path: string;
	times: number[];
	width: number;
	height: number;
	signal?: AbortSignal;
}): Promise<Buffer[]> {
	return Promise.all(
		times.map((time) => extractRgbFrame({ path, time, width, height, signal }))
	);
}

export async function extractMonoPcm({
	path,
	start,
	end,
	sampleRate = 8000,
	signal,
}: {
	path: string;
	start: number;
	end: number;
	sampleRate?: number;
	signal?: AbortSignal;
}): Promise<Int16Array> {
	if (end <= start) return new Int16Array();
	const { stdout } = await runProcess({
		command: getEditorialFFmpegPath(),
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			String(Math.max(0, start)),
			"-i",
			path,
			"-t",
			String(end - start),
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(sampleRate),
			"-f",
			"s16le",
			"-",
		],
		signal,
		maxOutputBytes: Math.ceil((end - start) * sampleRate * 2) + 4096,
	});
	return new Int16Array(
		stdout.buffer,
		stdout.byteOffset,
		Math.floor(stdout.byteLength / 2)
	);
}

export async function encodeRgbPng({
	rgb,
	width,
	height,
	outputPath,
	signal,
}: {
	rgb: Buffer;
	width: number;
	height: number;
	outputPath: string;
	signal?: AbortSignal;
}): Promise<void> {
	await fs.mkdir(dirname(resolve(outputPath)), { recursive: true });
	await new Promise<void>((resolvePromise, rejectPromise) => {
		const child = spawn(
			getEditorialFFmpegPath(),
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgb24",
				"-s",
				`${width}x${height}`,
				"-i",
				"-",
				"-frames:v",
				"1",
				"-y",
				outputPath,
			],
			{ stdio: ["pipe", "ignore", "pipe"] }
		);
		const errors: Buffer[] = [];
		const abort = (): void => {
			child.kill("SIGKILL");
		};
		signal?.addEventListener("abort", abort, { once: true });
		child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
		child.on("error", rejectPromise);
		child.on("close", (code) => {
			signal?.removeEventListener("abort", abort);
			if (code === 0) {
				resolvePromise();
				return;
			}
			rejectPromise(
				new Error(
					`Failed to encode PNG: ${Buffer.concat(errors).toString("utf8").trim()}`
				)
			);
		});
		child.stdin.end(rgb);
	});
}

export const mediaProcessInternals = {
	parseFrameRate,
	parseProbeJson,
};
