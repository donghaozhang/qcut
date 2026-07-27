/**
 * Pure FFmpeg/FFprobe argument builders and output parsers for reference-film
 * analysis. Nothing here touches the filesystem or spawns a process, so the
 * graphs can be asserted in unit tests; `analyze.ts` owns the execution.
 */

import type { PacingProfile } from "./types";

/** Shape of the reference film, as reported by ffprobe. */
export interface VideoProbe {
	durationSeconds: number;
	width: number;
	height: number;
	fps: number;
	hasAudio: boolean;
}

function requirePositive({
	value,
	name,
}: {
	value: number;
	name: string;
}): number {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${name} must be a positive number`);
	}
	return value;
}

function requirePositiveInteger({
	value,
	name,
}: {
	value: number;
	name: string;
}): number {
	requirePositive({ value, name });
	if (!Number.isInteger(value)) {
		throw new Error(`${name} must be an integer`);
	}
	return value;
}

/** Render a number for a filter string without exponent notation. */
function formatNumber({ value }: { value: number }): string {
	return String(Number(value.toFixed(6)));
}

/**
 * Quote a value for an FFmpeg filter option so `:` and `,` inside paths are
 * not read as option or filter separators.
 */
function quoteFilterValue({ value }: { value: string }): string {
	return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Build the contact-sheet command.
 *
 * `fps=<frames>/<duration>` samples exactly `frames` stills across the film and
 * `tile` packs them `columns x rows` per sheet, so `frames` must divide evenly
 * into a whole number of sheets — otherwise the trailing sheet is padded and
 * tile indexes stop lining up with {@link tileTimestamp}.
 *
 * Timestamps are deliberately NOT burned in: the staged FFmpeg build in this
 * repo ships without the `drawtext` filter. Use {@link buildTileTimestamps} to
 * label the tiles instead.
 */
export function buildContactSheetArgs({
	input,
	durationSeconds,
	frames,
	columns,
	rows,
	outputPattern,
}: {
	input: string;
	durationSeconds: number;
	frames: number;
	columns: number;
	rows: number;
	outputPattern: string;
}): string[] {
	requirePositive({ value: durationSeconds, name: "durationSeconds" });
	requirePositiveInteger({ value: frames, name: "frames" });
	requirePositiveInteger({ value: columns, name: "columns" });
	requirePositiveInteger({ value: rows, name: "rows" });
	const perSheet = columns * rows;
	if (frames % perSheet !== 0) {
		throw new Error(
			`frames (${frames}) must be a multiple of columns x rows (${perSheet})`
		);
	}
	const rate = `${frames}/${formatNumber({ value: durationSeconds })}`;
	return [
		"-y",
		"-i",
		input,
		"-vf",
		`fps=${rate},scale=384:-2,tile=${columns}x${rows}`,
		"-q:v",
		"2",
		outputPattern,
	];
}

/**
 * Timestamp of one contact-sheet tile, in seconds.
 *
 * `fps=frames/duration` emits its Nth frame at `N / rate`, so tile `index`
 * (0-based, counted across every sheet in reading order) shows the film at
 * `index * durationSeconds / frames`. Tile 0 is the opening frame; the last
 * tile sits one sampling interval short of the end.
 *
 * For a tile inside sheet `s` (1-based) at slot `k` (0-based):
 * `index = (s - 1) * columns * rows + k`.
 */
export function tileTimestamp({
	index,
	frames,
	durationSeconds,
}: {
	index: number;
	frames: number;
	durationSeconds: number;
}): number {
	requirePositiveInteger({ value: frames, name: "frames" });
	requirePositive({ value: durationSeconds, name: "durationSeconds" });
	if (!Number.isInteger(index) || index < 0) {
		throw new Error("index must be a non-negative integer");
	}
	if (index >= frames) {
		throw new Error(`index must be below frames (${frames})`);
	}
	return (index * durationSeconds) / frames;
}

/** Every tile timestamp in reading order. */
export function buildTileTimestamps({
	frames,
	durationSeconds,
}: {
	frames: number;
	durationSeconds: number;
}): number[] {
	requirePositiveInteger({ value: frames, name: "frames" });
	const timestamps: number[] = [];
	for (let index = 0; index < frames; index += 1) {
		timestamps.push(tileTimestamp({ index, frames, durationSeconds }));
	}
	return timestamps;
}

/**
 * Build the scene-detection command.
 *
 * The graph downscales first (scene scoring is unchanged at 480px and far
 * cheaper), keeps frames whose scene score exceeds `threshold`, and dumps one
 * metadata block per kept frame to `metadataFile`. The single quotes around
 * `gt(scene,N)` are part of the filter string, not shell quoting: without them
 * FFmpeg reads the comma as a filter separator.
 */
export function buildSceneDetectArgs({
	input,
	threshold,
	metadataFile,
}: {
	input: string;
	threshold: number;
	metadataFile: string;
}): string[] {
	if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
		throw new Error("threshold must be between 0 and 1");
	}
	const scene = formatNumber({ value: threshold });
	const target = quoteFilterValue({ value: metadataFile });
	return [
		"-i",
		input,
		"-vf",
		`scale=480:-2,select='gt(scene,${scene})',metadata=print:file=${target}`,
		"-an",
		"-f",
		"null",
		"-",
	];
}

/**
 * Extract narration audio as MP3.
 *
 * FAL's speech-to-text endpoint rejects video containers, so the audio has to
 * be pulled out before transcription rather than uploading the film itself.
 */
export function extractAudioArgs({
	input,
	output,
}: {
	input: string;
	output: string;
}): string[] {
	return [
		"-y",
		"-i",
		input,
		"-vn",
		"-acodec",
		"libmp3lame",
		"-q:a",
		"4",
		output,
	];
}

/**
 * Turn `metadata=print` output into a pacing profile.
 *
 * Each detected cut prints a `pts_time:<seconds>` line; anything else in the
 * file is ignored, so an empty or truncated log yields a zero-cut profile
 * instead of throwing.
 */
export function parsePacing({
	metadataText,
	durationSeconds,
}: {
	metadataText: string;
	durationSeconds: number;
}): PacingProfile {
	requirePositive({ value: durationSeconds, name: "durationSeconds" });
	const times: number[] = [];
	for (const match of metadataText.matchAll(/pts_time:\s*(\d+(?:\.\d+)?)/g)) {
		const seconds = Number(match[1]);
		if (Number.isFinite(seconds)) times.push(seconds);
	}

	let minutes = Math.max(1, Math.ceil(durationSeconds / 60));
	for (const seconds of times) {
		minutes = Math.max(minutes, Math.floor(seconds / 60) + 1);
	}
	const cutsPerMinute = new Array<number>(minutes).fill(0);
	for (const seconds of times) {
		cutsPerMinute[Math.floor(seconds / 60)] += 1;
	}

	return {
		durationSeconds,
		cutCount: times.length,
		cutsPerMinute,
		averageShotSeconds: durationSeconds / Math.max(1, times.length),
	};
}

function parseFrameRate({ value }: { value?: string }): number {
	if (!value) return 0;
	const [numerator, denominator] = value.split("/");
	const top = Number(numerator);
	const bottom = denominator === undefined ? 1 : Number(denominator);
	if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom === 0) {
		return 0;
	}
	const fps = top / bottom;
	return Number.isFinite(fps) && fps > 0 ? fps : 0;
}

interface ProbeStream {
	codec_type?: string;
	width?: number;
	height?: number;
	avg_frame_rate?: string;
	r_frame_rate?: string;
}

/** Pure half of `probeVideo`: read ffprobe's JSON into a {@link VideoProbe}. */
export function parseProbeJson({ stdout }: { stdout: string }): VideoProbe {
	let parsed: { streams?: ProbeStream[]; format?: { duration?: string } };
	try {
		parsed = JSON.parse(stdout);
	} catch {
		throw new Error("ffprobe did not return JSON");
	}
	const streams = parsed.streams ?? [];
	const video = streams.find((stream) => stream.codec_type === "video");
	if (!video) throw new Error("No video stream found");
	const durationSeconds = Number(parsed.format?.duration);
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("Could not determine duration");
	}
	return {
		durationSeconds,
		width: Number(video.width ?? 0),
		height: Number(video.height ?? 0),
		fps:
			parseFrameRate({ value: video.avg_frame_rate }) ||
			parseFrameRate({ value: video.r_frame_rate }),
		hasAudio: streams.some((stream) => stream.codec_type === "audio"),
	};
}

/** FFprobe argv for {@link parseProbeJson}. */
export function buildProbeArgs({ input }: { input: string }): string[] {
	return [
		"-v",
		"error",
		"-of",
		"json",
		"-show_entries",
		"format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate",
		input,
	];
}
