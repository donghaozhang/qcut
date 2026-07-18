import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";
import {
	listPortraitFilters,
	resolvePortraitFilter,
	type ResolvedPortraitFilter,
} from "../filters/portrait-filter-catalog.js";
import { buildPortraitFilterArgs } from "../filters/portrait-filter-ffmpeg.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const execFileAsync = promisify(execFile);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mkv", ".mov", ".mp4", ".webm"]);

interface PortraitFilterProbe {
	duration: number;
	width: number;
	height: number;
	hasAudio: boolean;
}

export interface PortraitFilterDependencies {
	renderVideo: ({
		args,
		signal,
	}: {
		args: string[];
		signal: AbortSignal;
	}) => Promise<void>;
	probeVideo: ({
		filePath,
		signal,
	}: {
		filePath: string;
		signal: AbortSignal;
	}) => Promise<PortraitFilterProbe>;
}

export interface PortraitFilterPaths {
	input: string;
	output: string;
	filter: ResolvedPortraitFilter;
}

async function renderVideo({
	args,
	signal,
}: {
	args: string[];
	signal: AbortSignal;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), args, {
		signal,
		maxBuffer: 16 * 1024 * 1024,
	});
}

async function probeVideo({
	filePath,
	signal,
}: {
	filePath: string;
	signal: AbortSignal;
}): Promise<PortraitFilterProbe> {
	const ffprobe = await getFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobe,
		[
			"-v",
			"error",
			"-show_entries",
			"stream=codec_type,width,height:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ signal, maxBuffer: 4 * 1024 * 1024 }
	);
	const payload = JSON.parse(String(stdout)) as {
		streams?: Array<{
			codec_type?: string;
			width?: number;
			height?: number;
		}>;
		format?: { duration?: string };
	};
	const video = payload.streams?.find(
		(stream) => stream.codec_type === "video"
	);
	const duration = Number(payload.format?.duration);
	const width = Number(video?.width);
	const height = Number(video?.height);
	if (
		!Number.isFinite(duration) ||
		duration <= 0 ||
		!Number.isFinite(width) ||
		width <= 0 ||
		!Number.isFinite(height) ||
		height <= 0
	) {
		throw new Error(`Unable to probe video: ${filePath}`);
	}
	return {
		duration,
		width,
		height,
		hasAudio:
			payload.streams?.some((stream) => stream.codec_type === "audio") ?? false,
	};
}

const DEFAULT_DEPENDENCIES: PortraitFilterDependencies = {
	renderVideo,
	probeVideo,
};

export function resolvePortraitFilterPaths({
	options,
	cwd = process.cwd(),
}: {
	options: CLIRunOptions;
	cwd?: string;
}): PortraitFilterPaths {
	if (!options.input) throw new Error("Missing --input/-i video path");
	const input = resolve(cwd, options.input);
	if (!VIDEO_EXTENSIONS.has(extname(input).toLowerCase())) {
		throw new Error(`Unsupported input video: ${input}`);
	}
	const filter = resolvePortraitFilter({
		presetId: options.portraitFilter ?? options.preset,
		intensity: options.filterIntensity,
		beauty: options.beauty,
	});
	const output = options.output
		? resolve(cwd, options.output)
		: join(
				resolve(cwd, options.outputDir),
				`${basename(input, extname(input))}_${filter.presetId}.mp4`
			);
	if (extname(output).toLowerCase() !== ".mp4") {
		throw new Error("--output must use .mp4");
	}
	if (input === output) {
		throw new Error("Portrait-filter output cannot replace the input video");
	}
	return { input, output, filter };
}

export async function handlePortraitFilter(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: PortraitFilterDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	if (options.listPresets) {
		return {
			success: true,
			data: { presets: listPortraitFilters() },
		};
	}

	const startedAt = Date.now();
	let paths: PortraitFilterPaths;
	try {
		paths = resolvePortraitFilterPaths({ options });
		if (!existsSync(paths.input)) {
			throw new Error(`Input not found: ${paths.input}`);
		}
		if (existsSync(paths.output) && !options.force) {
			throw new Error(
				`Output already exists: ${paths.output}. Pass --force to replace it.`
			);
		}
		mkdirSync(dirname(paths.output), { recursive: true });
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	onProgress({
		stage: "filtering",
		percent: 10,
		message: `Applying ${paths.filter.presetId} portrait filter...`,
	});
	try {
		const inputProbe = await dependencies.probeVideo({
			filePath: paths.input,
			signal,
		});
		await dependencies.renderVideo({
			args: buildPortraitFilterArgs({
				input: paths.input,
				output: paths.output,
				filter: paths.filter,
			}),
			signal,
		});
		const outputProbe = await dependencies.probeVideo({
			filePath: paths.output,
			signal,
		});
		const durationDifference = Math.abs(
			inputProbe.duration - outputProbe.duration
		);
		if (durationDifference > 0.35) {
			throw new Error(
				`Filtered duration differs from input by ${durationDifference.toFixed(3)}s`
			);
		}
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Portrait filter complete",
		});
		return {
			success: true,
			outputPath: paths.output,
			outputPaths: [paths.output],
			data: {
				input: paths.input,
				output: paths.output,
				preset: paths.filter.presetId,
				intensity: paths.filter.intensity,
				beauty: paths.filter.beauty,
				width: outputProbe.width,
				height: outputProbe.height,
				duration: outputProbe.duration,
				audio_preserved: !inputProbe.hasAudio || outputProbe.hasAudio,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Portrait filter failed: ${error instanceof Error ? error.message : String(error)}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
