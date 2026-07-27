/**
 * Renders the qcut-cityfilm audio bed and proves it landed.
 *
 * The picture comes out of QCut (it carries the source clips' ambience) and
 * this module lays music + narration over it with one ffmpeg pass, then
 * measures the result. Graph construction lives in mix-graph.ts; everything
 * here is process execution and output parsing.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildMixArgs, buildMixGraph } from "./mix-graph";
import type { CityFilmPlan, MixLevels } from "./types";

export {
	assertLabelsConsumed,
	buildMixArgs,
	buildMixGraph,
	computeTimelineDuration,
	resolveVoFile,
} from "./mix-graph";
export type { MixGraph } from "./mix-graph";

/** One stretch of the finished file to measure. */
export interface LevelWindow {
	/** Reporting label, e.g. `"act2"` or `"vo-t04"`. */
	label: string;
	startSeconds: number;
	endSeconds: number;
}

/** What `volumedetect` reported for one window. */
export interface LevelReading {
	label: string;
	startSeconds: number;
	endSeconds: number;
	/** RMS mean in dBFS; `-Infinity` for digital silence. */
	meanDb: number;
	maxDb: number;
	silent: boolean;
}

export interface MixOptions {
	plan: CityFilmPlan;
	/** Picture exported from QCut; must carry an audio track for ambience. */
	videoPath: string;
	outputPath: string;
	levels?: MixLevels;
	videoInputIndex?: number;
	ffmpegPath?: string;
	ffprobePath?: string;
	/** Optional file to receive the command line and ffmpeg's stderr. */
	logPath?: string;
}

export interface MixResult {
	outputPath: string;
	durationSeconds: number;
}

function formatSeconds({ value }: { value: number }): string {
	if (!Number.isFinite(value)) {
		throw new Error(`Expected a finite number, received ${value}`);
	}
	return String(Math.round(value * 1000) / 1000);
}

/** ffmpeg argv that measures one window with `volumedetect`. */
export function buildVolumeDetectArgs({
	file,
	window,
}: {
	file: string;
	window: LevelWindow;
}): string[] {
	const length = window.endSeconds - window.startSeconds;
	if (length <= 0) {
		throw new Error(
			`Level window ${window.label} has a non-positive length (${window.startSeconds}..${window.endSeconds})`
		);
	}
	return [
		"-hide_banner",
		"-nostats",
		"-ss",
		formatSeconds({ value: window.startSeconds }),
		"-t",
		formatSeconds({ value: length }),
		"-i",
		file,
		"-vn",
		"-af",
		"volumedetect",
		"-f",
		"null",
		"-",
	];
}

function parseDecibels({ value }: { value: string }): number {
	if (value === "-inf") return Number.NEGATIVE_INFINITY;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Could not parse a dB value from "${value}"`);
	}
	return parsed;
}

/** Reads `mean_volume` / `max_volume` out of an ffmpeg `volumedetect` run. */
export function parseVolumeDetect({ stderr }: { stderr: string }): {
	meanDb: number;
	maxDb: number;
} {
	const mean = stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)\s*dB/);
	const max = stderr.match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/);
	if (!mean || !max) {
		throw new Error(
			"volumedetect printed no mean_volume/max_volume line; the window is probably past the end of the file"
		);
	}
	return {
		meanDb: parseDecibels({ value: mean[1] }),
		maxDb: parseDecibels({ value: max[1] }),
	};
}

function resolveBinary({
	value,
	name,
}: {
	value?: string;
	name: string;
}): string {
	if (value) return value;
	return Bun.which(name) ?? name;
}

async function runProcess({
	executable,
	args,
}: {
	executable: string;
	args: string[];
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const child = Bun.spawn([executable, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { stdout, stderr, exitCode: await child.exited };
}

async function probeDuration({
	ffprobePath,
	filePath,
}: {
	ffprobePath: string;
	filePath: string;
}): Promise<number> {
	const result = await runProcess({
		executable: ffprobePath,
		args: [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"json",
			filePath,
		],
	});
	if (result.exitCode !== 0) {
		throw new Error(`ffprobe failed for ${filePath}: ${result.stderr.trim()}`);
	}
	const parsed = JSON.parse(result.stdout) as {
		format?: { duration?: string };
	};
	const duration = Number(parsed.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not determine duration: ${filePath}`);
	}
	return duration;
}

/** Builds the graph, renders it, and reports the finished file's duration. */
export async function runMix(options: MixOptions): Promise<MixResult> {
	const graph = buildMixGraph({
		plan: options.plan,
		levels: options.levels,
		videoInputIndex: options.videoInputIndex,
	});
	const missing = [options.videoPath, ...graph.inputs].filter(
		(file) => !existsSync(file)
	);
	if (missing.length > 0) {
		throw new Error(`Mix inputs are missing:\n  ${missing.join("\n  ")}`);
	}

	const args = buildMixArgs({
		videoPath: options.videoPath,
		outputPath: options.outputPath,
		graph,
	});
	const ffmpegPath = resolveBinary({
		value: options.ffmpegPath,
		name: "ffmpeg",
	});
	mkdirSync(dirname(resolve(options.outputPath)), { recursive: true });
	const result = await runProcess({ executable: ffmpegPath, args });
	if (options.logPath) {
		mkdirSync(dirname(resolve(options.logPath)), { recursive: true });
		writeFileSync(
			options.logPath,
			`$ ${[ffmpegPath, ...args].join(" ")}\n${result.stderr}`,
			"utf8"
		);
	}
	if (result.exitCode !== 0) {
		const detail = result.stderr.trim().split("\n").slice(-3).join(" | ");
		throw new Error(`ffmpeg mix failed (${result.exitCode}): ${detail}`);
	}

	return {
		outputPath: options.outputPath,
		durationSeconds: await probeDuration({
			ffprobePath: resolveBinary({
				value: options.ffprobePath,
				name: "ffprobe",
			}),
			filePath: options.outputPath,
		}),
	};
}

/**
 * Measures mean/max level per window on a rendered file. The hand-run once
 * shipped a silent cut because only the timeline was inspected — always prove
 * the audio landed in the exported file itself.
 */
export async function measureLevels({
	file,
	windows,
	ffmpegPath,
	silenceFloorDb = -60,
}: {
	file: string;
	windows: LevelWindow[];
	ffmpegPath?: string;
	silenceFloorDb?: number;
}): Promise<LevelReading[]> {
	if (!existsSync(file)) {
		throw new Error(`Cannot measure a missing file: ${file}`);
	}
	const executable = resolveBinary({ value: ffmpegPath, name: "ffmpeg" });
	const readings: LevelReading[] = [];
	for (const window of windows) {
		const result = await runProcess({
			executable,
			args: buildVolumeDetectArgs({ file, window }),
		});
		if (result.exitCode !== 0) {
			const detail = result.stderr.trim().split("\n").slice(-2).join(" | ");
			throw new Error(
				`volumedetect failed for window ${window.label}: ${detail}`
			);
		}
		let meanDb: number;
		let maxDb: number;
		try {
			({ meanDb, maxDb } = parseVolumeDetect({ stderr: result.stderr }));
		} catch (error) {
			throw new Error(
				`Could not measure window ${window.label} (${window.startSeconds}..${window.endSeconds}s) of ${file}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		readings.push({
			label: window.label,
			startSeconds: window.startSeconds,
			endSeconds: window.endSeconds,
			meanDb,
			maxDb,
			silent: !(meanDb > silenceFloorDb),
		});
	}
	return readings;
}
