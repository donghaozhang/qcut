/**
 * Frame, probe, and audio evidence helpers for clip transition export E2E.
 *
 * Everything decodes through the app's bundled FFmpeg/FFprobe so the
 * evidence is produced by the same binaries the export pipeline uses.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";

const execFileAsync = promisify(execFile);
const EVIDENCE_WIDTH = 64;
const EVIDENCE_HEIGHT = 36;

export interface DecodedFrame {
	height: number;
	/** Interleaved RGB bytes, row-major. */
	pixels: Buffer;
	timeSeconds: number;
	width: number;
}

export interface RgbMean {
	b: number;
	g: number;
	r: number;
}

export interface VideoProbe {
	/** Audio stream duration; AAC priming/padding makes it run a few frames long. */
	audioDurationSeconds: number | null;
	/** Container duration (the longest stream). */
	durationSeconds: number;
	frameCount: number;
	fps: number;
	hasAudio: boolean;
	height: number;
	videoDurationSeconds: number;
	width: number;
}

interface FfprobeStream {
	avg_frame_rate?: string;
	codec_type?: string;
	duration?: string;
	height?: number;
	nb_read_frames?: string;
	width?: number;
}

/**
 * Renders a synthetic clip with a sine tone so seams have unmistakable
 * content. `pattern` is a lavfi video source such as `testsrc2` or
 * `color=c=0x2060ff`; size, rate, and duration are appended. The video is
 * explicitly coded and tagged BT.709 limited range: untagged files are
 * interpreted as BT.601 by FFmpeg but BT.709 by Chromium's decoder, which
 * would skew any cross-engine color comparison.
 */
export async function generateToneClip({
	filePath,
	pattern,
	toneHz,
	seconds,
	fps = 30,
	width = 1280,
	height = 720,
}: {
	filePath: string;
	pattern: string;
	toneHz: number;
	seconds: number;
	fps?: number;
	width?: number;
	height?: number;
}): Promise<void> {
	const separator = pattern.includes("=") ? ":" : "=";
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		`${pattern}${separator}s=${width}x${height}:r=${fps}:d=${seconds}`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${toneHz}:sample_rate=48000:duration=${seconds}`,
		"-vf",
		"scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-g",
		"15",
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709",
		"-color_range",
		"tv",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-shortest",
		filePath,
	]);
}

export async function probeVideo({
	filePath,
}: {
	filePath: string;
}): Promise<VideoProbe> {
	const { stdout } = await execFileAsync(await getFFprobePath(), [
		"-v",
		"error",
		"-count_frames",
		"-show_entries",
		"stream=codec_type,width,height,avg_frame_rate,nb_read_frames,duration:format=duration",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as {
		format?: { duration?: string };
		streams?: FfprobeStream[];
	};
	const video = probe.streams?.find((stream) => stream.codec_type === "video");
	if (!video) throw new Error(`No video stream in ${filePath}`);
	const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
	const [numerator = "0", denominator = "1"] = (
		video.avg_frame_rate ?? "0/1"
	).split("/");
	return {
		audioDurationSeconds: audio ? Number(audio.duration ?? 0) : null,
		durationSeconds: Number(probe.format?.duration ?? 0),
		frameCount: Number(video.nb_read_frames ?? 0),
		fps:
			Number(denominator) === 0 ? 0 : Number(numerator) / Number(denominator),
		hasAudio: audio !== undefined,
		height: video.height ?? 0,
		videoDurationSeconds: Number(video.duration ?? 0),
		width: video.width ?? 0,
	};
}

export async function decodeFrame({
	filePath,
	timeSeconds,
}: {
	filePath: string;
	timeSeconds: number;
}): Promise<DecodedFrame> {
	const { stdout } = await execFileAsync(
		getFFmpegPath(),
		[
			"-v",
			"error",
			"-ss",
			String(timeSeconds),
			"-i",
			filePath,
			"-frames:v",
			"1",
			"-vf",
			`scale=${EVIDENCE_WIDTH}:${EVIDENCE_HEIGHT}`,
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		{ encoding: "buffer", maxBuffer: 4 * 1024 * 1024 }
	);
	const pixels = Buffer.from(stdout);
	if (pixels.length !== EVIDENCE_WIDTH * EVIDENCE_HEIGHT * 3) {
		throw new Error(
			`Decoded ${pixels.length} bytes at ${timeSeconds}s from ${filePath}`
		);
	}
	return {
		height: EVIDENCE_HEIGHT,
		pixels,
		timeSeconds,
		width: EVIDENCE_WIDTH,
	};
}

/** Saves a full-resolution PNG of one frame for human review. */
export async function savePngFrame({
	filePath,
	timeSeconds,
	outputPath,
}: {
	filePath: string;
	timeSeconds: number;
	outputPath: string;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-v",
		"error",
		"-ss",
		String(timeSeconds),
		"-i",
		filePath,
		"-frames:v",
		"1",
		outputPath,
	]);
}

export type FrameRegion = "all" | "left" | "right";

function regionColumns({
	region,
	width,
}: {
	region: FrameRegion;
	width: number;
}): { from: number; to: number } {
	const half = Math.floor(width / 2);
	if (region === "left") return { from: 0, to: half };
	if (region === "right") return { from: half, to: width };
	return { from: 0, to: width };
}

export function meanColor({
	frame,
	region = "all",
}: {
	frame: DecodedFrame;
	region?: FrameRegion;
}): RgbMean {
	const { from, to } = regionColumns({ region, width: frame.width });
	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;
	for (let y = 0; y < frame.height; y += 1) {
		for (let x = from; x < to; x += 1) {
			const offset = (y * frame.width + x) * 3;
			r += frame.pixels[offset];
			g += frame.pixels[offset + 1];
			b += frame.pixels[offset + 2];
			count += 1;
		}
	}
	return { r: r / count, g: g / count, b: b / count };
}

/** Mean absolute per-channel difference (0-255) between two frames. */
export function meanAbsDiff({
	a,
	b,
	region = "all",
}: {
	a: DecodedFrame;
	b: DecodedFrame;
	region?: FrameRegion;
}): number {
	const { from, to } = regionColumns({ region, width: a.width });
	let total = 0;
	let count = 0;
	for (let y = 0; y < a.height; y += 1) {
		for (let x = from; x < to; x += 1) {
			const offset = (y * a.width + x) * 3;
			for (let channel = 0; channel < 3; channel += 1) {
				total += Math.abs(
					a.pixels[offset + channel] - b.pixels[offset + channel]
				);
				count += 1;
			}
		}
	}
	return total / count;
}

/** Per-pixel 50/50 blend of two frames, for dissolve midpoint checks. */
export function blendFrames({
	a,
	b,
}: {
	a: DecodedFrame;
	b: DecodedFrame;
}): DecodedFrame {
	const pixels = Buffer.alloc(a.pixels.length);
	for (let index = 0; index < pixels.length; index += 1) {
		pixels[index] = Math.round((a.pixels[index] + b.pixels[index]) / 2);
	}
	return { ...a, pixels };
}

export function colorDistance({ a, b }: { a: RgbMean; b: RgbMean }): number {
	return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

/** Overall RMS level in dBFS for a window; -Infinity for digital silence. */
export async function audioRmsDb({
	filePath,
	startSeconds,
	durationSeconds,
}: {
	filePath: string;
	startSeconds: number;
	durationSeconds: number;
}): Promise<number> {
	const { stderr } = await execFileAsync(getFFmpegPath(), [
		"-v",
		"info",
		"-ss",
		String(startSeconds),
		"-t",
		String(durationSeconds),
		"-i",
		filePath,
		"-map",
		"0:a:0",
		"-af",
		"astats=measure_perchannel=none:measure_overall=RMS_level",
		"-f",
		"null",
		"-",
	]);
	const match = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(stderr);
	if (!match) throw new Error(`No RMS level in astats output for ${filePath}`);
	return match[1] === "-inf" ? Number.NEGATIVE_INFINITY : Number(match[1]);
}

export interface ExportJobSnapshot {
	engine?: string;
	error?: string;
	outputPath?: string;
	progress: number;
	status: "queued" | "exporting" | "completed" | "failed";
}

function apiHeaders({ token }: { token?: string }): Record<string, string> {
	return {
		"Content-Type": "application/json",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
}

/** Starts a native (utility-process FFmpeg) export through the editor HTTP API. */
export async function startNativeExport({
	apiPort,
	projectId,
	outputPath,
	width,
	height,
	fps,
	token,
}: {
	apiPort: number;
	projectId: string;
	outputPath: string;
	width: number;
	height: number;
	fps: number;
	token?: string;
}): Promise<{ jobId: string }> {
	const response = await fetch(
		`http://127.0.0.1:${apiPort}/api/claude/export/${projectId}/start`,
		{
			method: "POST",
			headers: apiHeaders({ token }),
			body: JSON.stringify({
				engine: "auto",
				outputPath,
				settings: { width, height, fps, format: "mp4" },
			}),
		}
	);
	const payload = (await response.json()) as {
		data?: { jobId?: string };
		error?: string;
		jobId?: string;
		success?: boolean;
	};
	const jobId = payload.jobId ?? payload.data?.jobId;
	if (!response.ok || !jobId) {
		throw new Error(
			`Native export did not start (${response.status}): ${payload.error ?? JSON.stringify(payload)}`
		);
	}
	return { jobId };
}

export async function waitForExportJob({
	apiPort,
	projectId,
	jobId,
	token,
	timeoutMs,
}: {
	apiPort: number;
	projectId: string;
	jobId: string;
	token?: string;
	timeoutMs: number;
}): Promise<ExportJobSnapshot> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const response = await fetch(
			`http://127.0.0.1:${apiPort}/api/claude/export/${projectId}/jobs/${jobId}`,
			{ headers: apiHeaders({ token }) }
		);
		const payload = (await response.json()) as {
			data?: ExportJobSnapshot;
		} & Partial<ExportJobSnapshot>;
		const job = payload.data ?? (payload as ExportJobSnapshot);
		if (job.status === "completed" || job.status === "failed") return job;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Export job ${jobId} did not finish within ${timeoutMs}ms`);
}
