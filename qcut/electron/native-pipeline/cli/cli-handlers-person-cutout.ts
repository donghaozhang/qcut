/**
 * Person cutout and background replacement for the native CLI.
 *
 * The cloud step produces a transparent VP9 layer. FFmpeg then composites that
 * layer over a still image while taking audio from the original local video.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";
import {
	callModelApi,
	downloadOutput,
	type ApiCallOptions,
	type ApiCallResult,
	uploadToFalStorage,
} from "../infra/api-caller.js";
import {
	resolvePortraitFilter,
	type ResolvedPortraitFilter,
} from "../filters/portrait-filter-catalog.js";
import { buildAlphaSafePortraitGraph } from "../filters/portrait-filter-ffmpeg.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PERSON_CUTOUT_ENDPOINT = "bria/video/background-removal/v3";
const VIDEO_EXTENSIONS = new Set([".m4v", ".mkv", ".mov", ".mp4", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const BACKGROUND_FITS = ["cover", "contain", "stretch"] as const;

type BackgroundFit = (typeof BACKGROUND_FITS)[number];

export interface PersonCutoutVideoProbe {
	width: number;
	height: number;
	frameRate: number;
	duration: number;
}

export interface PersonCutoutPaths {
	input: string;
	background?: string;
	cutoutOutput: string;
	compositeOutput?: string;
	fit: BackgroundFit;
	portraitFilter: ResolvedPortraitFilter;
}

export interface PersonCutoutDependencies {
	uploadFile: ({ filePath }: { filePath: string }) => Promise<{
		success: boolean;
		url?: string;
		error?: string;
	}>;
	callModel: ({
		options,
	}: {
		options: ApiCallOptions;
	}) => Promise<ApiCallResult>;
	downloadFile: ({
		url,
		outputPath,
	}: {
		url: string;
		outputPath: string;
	}) => Promise<string>;
	probeVideo: ({
		filePath,
		signal,
	}: {
		filePath: string;
		signal: AbortSignal;
	}) => Promise<PersonCutoutVideoProbe>;
	composeVideo: ({
		args,
		signal,
	}: {
		args: string[];
		signal: AbortSignal;
	}) => Promise<void>;
}

interface FFprobePayload {
	streams?: Array<{
		width?: number;
		height?: number;
		avg_frame_rate?: string;
		r_frame_rate?: string;
		tags?: { rotate?: string };
		side_data_list?: Array<{ rotation?: number }>;
	}>;
	format?: { duration?: string };
}

function parseFrameRate({ value }: { value?: string }): number {
	if (!value) return 30;
	const [numerator, denominator = "1"] = value.split("/");
	const parsedNumerator = Number(numerator);
	const parsedDenominator = Number(denominator);
	if (
		!Number.isFinite(parsedNumerator) ||
		!Number.isFinite(parsedDenominator) ||
		parsedDenominator === 0
	) {
		return 30;
	}
	const frameRate = parsedNumerator / parsedDenominator;
	return frameRate > 0 ? Math.min(60, frameRate) : 30;
}

function displayedDimensions({
	width,
	height,
	rotation,
}: {
	width: number;
	height: number;
	rotation: number;
}): { width: number; height: number } {
	const normalizedRotation = Math.abs(rotation) % 180;
	return normalizedRotation === 90
		? { width: height, height: width }
		: { width, height };
}

async function probeVideo({
	filePath,
	signal,
}: {
	filePath: string;
	signal: AbortSignal;
}): Promise<PersonCutoutVideoProbe> {
	const ffprobe = await getFFprobePath();
	const { stdout } = await execFileAsync(
		ffprobe,
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,avg_frame_rate,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
			"-of",
			"json",
			filePath,
		],
		{ signal, maxBuffer: 4 * 1024 * 1024 }
	);
	const payload = JSON.parse(String(stdout)) as FFprobePayload;
	const stream = payload.streams?.[0];
	const width = Number(stream?.width);
	const height = Number(stream?.height);
	const duration = Number(payload.format?.duration);
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0 ||
		!Number.isFinite(duration) ||
		duration <= 0
	) {
		throw new Error(`Unable to probe video geometry: ${filePath}`);
	}
	const sideDataRotation = stream?.side_data_list?.find(
		(item) => typeof item.rotation === "number"
	)?.rotation;
	const rotation = sideDataRotation ?? Number(stream?.tags?.rotate ?? 0);
	const dimensions = displayedDimensions({ width, height, rotation });
	return {
		width: dimensions.width,
		height: dimensions.height,
		frameRate: parseFrameRate({
			value: stream?.avg_frame_rate || stream?.r_frame_rate,
		}),
		duration,
	};
}

async function composeVideo({
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

const DEFAULT_DEPENDENCIES: PersonCutoutDependencies = {
	uploadFile: ({ filePath }) => uploadToFalStorage(filePath),
	callModel: ({ options }) => callModelApi(options),
	downloadFile: ({ url, outputPath }) => downloadOutput(url, outputPath),
	probeVideo,
	composeVideo,
};

function resolveBackgroundFit({ value }: { value?: string }): BackgroundFit {
	const fit = value ?? "cover";
	if (!BACKGROUND_FITS.includes(fit as BackgroundFit)) {
		throw new Error(`--background-fit must be: ${BACKGROUND_FITS.join(", ")}`);
	}
	return fit as BackgroundFit;
}

function assertExtension({
	filePath,
	extensions,
	label,
}: {
	filePath: string;
	extensions: Set<string>;
	label: string;
}): void {
	if (!extensions.has(extname(filePath).toLowerCase())) {
		throw new Error(`${label} has an unsupported extension: ${filePath}`);
	}
}

export function resolvePersonCutoutPaths({
	options,
	cwd = process.cwd(),
}: {
	options: CLIRunOptions;
	cwd?: string;
}): PersonCutoutPaths {
	if (!options.input) throw new Error("Missing --input/-i video path");
	const input = resolve(cwd, options.input);
	const background = options.background
		? resolve(cwd, options.background)
		: undefined;
	const outputDir = resolve(cwd, options.outputDir);
	const stem = basename(input, extname(input));
	const cutoutOutput = options.cutoutOutput
		? resolve(cwd, options.cutoutOutput)
		: join(outputDir, `${stem}_cutout.webm`);
	const compositeOutput = background
		? options.output
			? resolve(cwd, options.output)
			: join(outputDir, `${stem}_background.mp4`)
		: undefined;

	if (options.output && !background) {
		throw new Error(
			"--output requires --background; use --cutout-output otherwise"
		);
	}
	assertExtension({
		filePath: input,
		extensions: VIDEO_EXTENSIONS,
		label: "Input",
	});
	if (background) {
		assertExtension({
			filePath: background,
			extensions: IMAGE_EXTENSIONS,
			label: "Background",
		});
	}
	if (extname(cutoutOutput).toLowerCase() !== ".webm") {
		throw new Error("--cutout-output must use .webm to preserve transparency");
	}
	if (compositeOutput && extname(compositeOutput).toLowerCase() !== ".mp4") {
		throw new Error("--output must use .mp4");
	}
	const protectedInputs = [input, background].filter((value): value is string =>
		Boolean(value)
	);
	for (const outputPath of [cutoutOutput, compositeOutput].filter(
		(value): value is string => Boolean(value)
	)) {
		if (protectedInputs.includes(outputPath)) {
			throw new Error("Person-cutout outputs cannot replace an input file");
		}
	}
	if (compositeOutput && compositeOutput === cutoutOutput) {
		throw new Error("Cutout and composite outputs must be different files");
	}

	return {
		input,
		background,
		cutoutOutput,
		compositeOutput,
		fit: resolveBackgroundFit({ value: options.backgroundFit }),
		portraitFilter: resolvePortraitFilter({
			presetId: options.portraitFilter ?? "none",
			intensity: options.filterIntensity,
			beauty: options.beauty,
			defaultBeauty: 0,
		}),
	};
}

export function buildPersonCutoutPayload({
	videoUrl,
}: {
	videoUrl: string;
}): Record<string, unknown> {
	return {
		video_url: videoUrl,
		output_container_and_codec: "webm_vp9",
		preserve_audio: true,
		background_color: "Transparent",
	};
}

function buildBackgroundLayer({
	width,
	height,
	fit,
}: {
	width: number;
	height: number;
	fit: BackgroundFit;
}): string {
	if (fit === "stretch") return `scale=${width}:${height}`;
	if (fit === "contain") {
		return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
	}
	return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
}

export function buildBackgroundCompositeArgs({
	paths,
	probe,
}: {
	paths: PersonCutoutPaths;
	probe: PersonCutoutVideoProbe;
}): string[] {
	if (!paths.background || !paths.compositeOutput) {
		throw new Error(
			"Background composition requires background and output paths"
		);
	}
	const width = Math.max(2, probe.width - (probe.width % 2));
	const height = Math.max(2, probe.height - (probe.height % 2));
	const frameRate = Math.min(60, Math.max(1, probe.frameRate));
	const portraitGraph = buildAlphaSafePortraitGraph({
		inputLabel: "[1:v]",
		outputLabel: "[portrait_filtered]",
		labelPrefix: "portrait",
		filter: paths.portraitFilter,
	});
	const filter =
		`[0:v]${buildBackgroundLayer({ width, height, fit: paths.fit })}[background];` +
		`${portraitGraph};` +
		`[portrait_filtered]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
		`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0[person];` +
		"[background][person]overlay=0:0:shortest=1:format=auto[video]";

	return [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-framerate",
		frameRate.toFixed(3),
		"-loop",
		"1",
		"-i",
		paths.background,
		"-c:v",
		"libvpx-vp9",
		"-i",
		paths.cutoutOutput,
		"-i",
		paths.input,
		"-filter_complex",
		filter,
		"-map",
		"[video]",
		"-map",
		"2:a?",
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"18",
		"-pix_fmt",
		"yuv420p",
		"-r",
		frameRate.toFixed(3),
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-shortest",
		"-movflags",
		"+faststart",
		paths.compositeOutput,
	];
}

function ensureWritableOutputs({
	paths,
	force,
}: {
	paths: PersonCutoutPaths;
	force: boolean;
}): void {
	for (const outputPath of [paths.cutoutOutput, paths.compositeOutput].filter(
		(value): value is string => Boolean(value)
	)) {
		if (existsSync(outputPath) && !force) {
			throw new Error(
				`Output already exists: ${outputPath}. Pass --force to replace it.`
			);
		}
		mkdirSync(dirname(outputPath), { recursive: true });
	}
}

export async function handlePersonCutout(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: PersonCutoutDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startTime = Date.now();
	let paths: PersonCutoutPaths;
	try {
		paths = resolvePersonCutoutPaths({ options });
		if (!existsSync(paths.input))
			throw new Error(`Input not found: ${paths.input}`);
		if (paths.background && !existsSync(paths.background)) {
			throw new Error(`Background not found: ${paths.background}`);
		}
		ensureWritableOutputs({ paths, force: options.force ?? false });
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	onProgress({
		stage: "uploading",
		percent: 5,
		message: `Uploading ${basename(paths.input)} for person cutout...`,
		model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
	});
	const upload = await dependencies.uploadFile({ filePath: paths.input });
	if (!upload.success || !upload.url) {
		return {
			success: false,
			error: `Upload failed: ${upload.error ?? "unknown error"}`,
		};
	}

	onProgress({
		stage: "cutout",
		percent: 15,
		message: "Removing the video background...",
		model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
	});
	const result = await dependencies.callModel({
		options: {
			endpoint: DEFAULT_PERSON_CUTOUT_ENDPOINT,
			payload: buildPersonCutoutPayload({ videoUrl: upload.url }),
			provider: "fal",
			signal,
			onProgress: (percent, message) => {
				onProgress({
					stage: "cutout",
					percent: Math.min(82, 15 + percent * 0.67),
					message: message || "Removing the video background...",
					model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
				});
			},
		},
	});
	if (!result.success || !result.outputUrl) {
		return {
			success: false,
			error: `Person cutout failed: ${result.error ?? "no output URL returned"}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	onProgress({
		stage: "downloading",
		percent: 84,
		message: "Downloading transparent person layer...",
		model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
	});
	try {
		await dependencies.downloadFile({
			url: result.outputUrl,
			outputPath: paths.cutoutOutput,
		});
	} catch (error) {
		return {
			success: false,
			error: `Cutout download failed: ${error instanceof Error ? error.message : String(error)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	let probe: PersonCutoutVideoProbe;
	try {
		probe = await dependencies.probeVideo({
			filePath: paths.cutoutOutput,
			signal,
		});
	} catch (error) {
		return {
			success: false,
			error: `Transparent output verification failed: ${error instanceof Error ? error.message : String(error)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	if (paths.background && paths.compositeOutput) {
		onProgress({
			stage: "compositing",
			percent: 90,
			message: "Compositing person over the replacement background...",
			model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
		});
		try {
			await dependencies.composeVideo({
				args: buildBackgroundCompositeArgs({ paths, probe }),
				signal,
			});
			const compositeProbe = await dependencies.probeVideo({
				filePath: paths.compositeOutput,
				signal,
			});
			const durationDifference = Math.abs(
				compositeProbe.duration - probe.duration
			);
			if (durationDifference > 0.35) {
				throw new Error(
					`Composite duration differs from the cutout by ${durationDifference.toFixed(3)}s`
				);
			}
		} catch (error) {
			return {
				success: false,
				error: `Background composition failed: ${error instanceof Error ? error.message : String(error)}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: paths.compositeOutput
			? "Person cutout and background composition complete"
			: "Transparent person cutout complete",
		model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
	});
	const duration = (Date.now() - startTime) / 1000;
	const outputPaths = [paths.cutoutOutput, paths.compositeOutput].filter(
		(value): value is string => Boolean(value)
	);
	return {
		success: true,
		outputPath: paths.compositeOutput ?? paths.cutoutOutput,
		outputPaths,
		data: {
			input: paths.input,
			background: paths.background ?? null,
			cutout_path: paths.cutoutOutput,
			composite_path: paths.compositeOutput ?? null,
			model: DEFAULT_PERSON_CUTOUT_ENDPOINT,
			fit: paths.fit,
			portrait_filter: paths.portraitFilter.presetId,
			filter_intensity: paths.portraitFilter.intensity,
			beauty: paths.portraitFilter.beauty,
			width: probe.width,
			height: probe.height,
			frame_rate: probe.frameRate,
			duration: probe.duration,
		},
		duration,
	};
}
