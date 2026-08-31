/**
 * Fixtures and metrics for the sequential-decode parity E2E.
 *
 * The ramp clips encode the source frame number into per-frame solid colors
 * so a decoded export frame identifies exactly which source frame produced
 * it: G = (n % 20) * 12 and B = 234 - G move in opposite directions by 24
 * levels per frame (far above codec noise), while R steps every 20 frames
 * to disambiguate the cycle and identify the clip. Everything is coded and
 * tagged BT.709 limited range like the other export fixtures.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";
import type { DecodedFrame, RgbMean } from "./transition-export-evidence";

const execFileAsync = promisify(execFile);

export const RAMP_CYCLE_FRAMES = 20;
export const RAMP_INDEX_STEP = 12;
export const RAMP_RED_CYCLE_STEP = 8;

const BT709_TAG_FILTER =
	"scale=out_color_matrix=bt709:out_range=tv,format=yuv420p," +
	"setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709";

const BT709_TAG_ARGS = [
	"-colorspace",
	"bt709",
	"-color_primaries",
	"bt709",
	"-color_trc",
	"bt709",
	"-color_range",
	"tv",
];

/** Expected sRGB color of ramp source frame `n` (pre-codec). */
export function rampColorForIndex({
	frameIndex,
	redBase,
}: {
	frameIndex: number;
	redBase: number;
}): RgbMean {
	const phase =
		((frameIndex % RAMP_CYCLE_FRAMES) + RAMP_CYCLE_FRAMES) % RAMP_CYCLE_FRAMES;
	const g = phase * RAMP_INDEX_STEP;
	return {
		r:
			redBase +
			Math.floor(frameIndex / RAMP_CYCLE_FRAMES) * RAMP_RED_CYCLE_STEP,
		g,
		b: 234 - g,
	};
}

/**
 * Recovers the ramp phase (source frame index modulo the cycle) from a
 * decoded mean color. G and 234-B are two independent measurements of the
 * same value; averaging halves the decode error.
 */
export function rampPhaseFromColor({ color }: { color: RgbMean }): number {
	return (color.g + (234 - color.b)) / (2 * RAMP_INDEX_STEP);
}

/** Circular distance between two ramp phases, in frames. */
export function rampPhaseDistance({ a, b }: { a: number; b: number }): number {
	const raw = Math.abs(a - b) % RAMP_CYCLE_FRAMES;
	return Math.min(raw, RAMP_CYCLE_FRAMES - raw);
}

/**
 * Renders a frame-index ramp clip with a sine tone. Every frame is a solid
 * color derived from the source frame number (see module docs), CRF 12 so
 * the index survives two encode generations.
 */
export async function generateRampClip({
	filePath,
	redBase,
	toneHz,
	seconds,
	fps = 30,
	width = 1280,
	height = 720,
	gopSize = 90,
}: {
	filePath: string;
	redBase: number;
	toneHz: number;
	seconds: number;
	fps?: number;
	width?: number;
	height?: number;
	gopSize?: number;
}): Promise<void> {
	const geq =
		`geq=r='${redBase}+floor(N/${RAMP_CYCLE_FRAMES})*${RAMP_RED_CYCLE_STEP}'` +
		`:g='mod(N\\,${RAMP_CYCLE_FRAMES})*${RAMP_INDEX_STEP}'` +
		`:b='234-mod(N\\,${RAMP_CYCLE_FRAMES})*${RAMP_INDEX_STEP}'`;
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		`color=c=black:s=${width}x${height}:r=${fps}:d=${seconds},format=rgb24,${geq}`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${toneHz}:sample_rate=48000:duration=${seconds}`,
		"-vf",
		BT709_TAG_FILTER,
		"-c:v",
		"libx264",
		"-crf",
		"12",
		"-pix_fmt",
		"yuv420p",
		"-g",
		String(gopSize),
		...BT709_TAG_ARGS,
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-shortest",
		filePath,
	]);
}

/** Solid colors of the animated sticker GIF, one per 0.5s frame. */
export const GIF_FRAME_COLORS: readonly { name: string; rgb: RgbMean }[] = [
	{ name: "red", rgb: { r: 255, g: 0, b: 0 } },
	{ name: "lime", rgb: { r: 0, g: 255, b: 0 } },
	{ name: "blue", rgb: { r: 0, g: 0, b: 255 } },
	{ name: "yellow", rgb: { r: 255, g: 255, b: 0 } },
];

export const GIF_FRAME_SECONDS = 0.5;

/**
 * Renders a 4-frame color-cycling GIF (0.5s per frame, infinite loop).
 * A single geq source picks the color from the frame number; the palette
 * filters are avoided because their pal8 output makes the GIF encoder in
 * the bundled FFmpeg collapse frames.
 */
export async function generateColorCycleGif({
	filePath,
	size = 96,
}: {
	filePath: string;
	size?: number;
}): Promise<void> {
	const rate = 1 / GIF_FRAME_SECONDS;
	const seconds = GIF_FRAME_SECONDS * GIF_FRAME_COLORS.length;
	const geq =
		"geq=r='255*(eq(mod(N\\,4)\\,0)+eq(mod(N\\,4)\\,3))'" +
		":g='255*(eq(mod(N\\,4)\\,1)+eq(mod(N\\,4)\\,3))'" +
		":b='255*eq(mod(N\\,4)\\,2)'";
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		`color=c=black:s=${size}x${size}:r=${rate}:d=${seconds},format=rgb24,${geq}`,
		"-loop",
		"0",
		filePath,
	]);
}

/** Renders a mono PCM sine-tone WAV for the audio track. */
export async function generateToneWav({
	filePath,
	toneHz,
	seconds,
}: {
	filePath: string;
	toneHz: number;
	seconds: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${toneHz}:sample_rate=48000:duration=${seconds}`,
		"-c:a",
		"pcm_s16le",
		filePath,
	]);
}

/**
 * Decode timestamp that selects exactly `frameIndex` with FFmpeg's `-ss`
 * semantics (first frame whose pts is >= the target): a quarter frame below
 * the frame's pts, clear of any float rounding in either direction.
 */
export function frameSelectTime({
	frameIndex,
	fps,
}: {
	frameIndex: number;
	fps: number;
}): number {
	return Math.max(0, (frameIndex - 0.25) / fps);
}

export interface NormalizedRect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Mean color inside a normalized [0,1] rect of a decoded frame. */
export function meanColorRect({
	frame,
	rect,
}: {
	frame: DecodedFrame;
	rect: NormalizedRect;
}): RgbMean {
	const fromX = Math.max(0, Math.floor(rect.x0 * frame.width));
	const toX = Math.min(frame.width, Math.ceil(rect.x1 * frame.width));
	const fromY = Math.max(0, Math.floor(rect.y0 * frame.height));
	const toY = Math.min(frame.height, Math.ceil(rect.y1 * frame.height));
	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;
	for (let y = fromY; y < toY; y += 1) {
		for (let x = fromX; x < toX; x += 1) {
			const offset = (y * frame.width + x) * 3;
			r += frame.pixels[offset];
			g += frame.pixels[offset + 1];
			b += frame.pixels[offset + 2];
			count += 1;
		}
	}
	if (count === 0) throw new Error("meanColorRect: empty rect");
	return { r: r / count, g: g / count, b: b / count };
}

function apiHeaders({ token }: { token?: string }): Record<string, string> {
	return {
		"Content-Type": "application/json",
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
}

/**
 * Starts a renderer muxer export through the editor HTTP API — the same
 * production route the `qcut-pipeline editor:export:start --engine muxer`
 * benchmarks use, with the same profiler and sequential-decode knobs.
 */
export async function startRendererMuxerExport({
	apiPort,
	projectId,
	outputPath,
	profilePath,
	disableSequentialDecode = false,
	width,
	height,
	fps,
	token,
}: {
	apiPort: number;
	projectId: string;
	outputPath: string;
	profilePath: string;
	disableSequentialDecode?: boolean;
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
				engine: "muxer",
				outputPath,
				profilePath,
				...(disableSequentialDecode ? { disableSequentialDecode: true } : {}),
				settings: { width, height, fps, format: "mp4" },
			}),
		}
	);
	const payload = (await response.json()) as {
		data?: { jobId?: string };
		error?: string;
		jobId?: string;
	};
	const jobId = payload.jobId ?? payload.data?.jobId;
	if (!response.ok || !jobId) {
		throw new Error(
			`Renderer export did not start (${response.status}): ${
				payload.error ?? JSON.stringify(payload)
			}`
		);
	}
	return { jobId };
}

export interface ExportProfileSummary {
	counters: Record<string, number>;
	frameCount: number;
	stageCounts: Record<string, number>;
	stageTotalsMs: Record<string, number>;
	wallMs: number;
}

/** Reads the structured export profile written by the renderer profiler. */
export async function readExportProfile({
	filePath,
}: {
	filePath: string;
}): Promise<ExportProfileSummary> {
	const report = JSON.parse(await readFile(filePath, "utf8")) as {
		counters?: Record<string, number>;
		frameCount?: number;
		stages?: Record<string, { count: number; totalMs: number }>;
		wallMs?: number;
	};
	const stageCounts: Record<string, number> = {};
	const stageTotalsMs: Record<string, number> = {};
	for (const [stage, stats] of Object.entries(report.stages ?? {})) {
		stageCounts[stage] = stats.count;
		stageTotalsMs[stage] = stats.totalMs;
	}
	return {
		counters: report.counters ?? {},
		frameCount: report.frameCount ?? 0,
		stageCounts,
		stageTotalsMs,
		wallMs: report.wallMs ?? 0,
	};
}

/** Probes the color tags of the first video stream. */
export async function probeColorTags({
	filePath,
}: {
	filePath: string;
}): Promise<{
	colorSpace: string | null;
	colorTransfer: string | null;
	colorPrimaries: string | null;
	colorRange: string | null;
}> {
	const { stdout } = await execFileAsync(await getFFprobePath(), [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=color_space,color_transfer,color_primaries,color_range",
		"-of",
		"json",
		filePath,
	]);
	const probe = JSON.parse(stdout) as {
		streams?: Array<{
			color_space?: string;
			color_transfer?: string;
			color_primaries?: string;
			color_range?: string;
		}>;
	};
	const stream = probe.streams?.[0];
	return {
		colorSpace: stream?.color_space ?? null,
		colorTransfer: stream?.color_transfer ?? null,
		colorPrimaries: stream?.color_primaries ?? null,
		colorRange: stream?.color_range ?? null,
	};
}
