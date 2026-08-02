import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import {
	compareCaptureImages,
	type PixelDifferenceMetrics,
} from "../../.agents/skills/qcut-toolkit/jianying-transition-reference/scripts/transition-parity";
import type {
	TransitionFrameWindow,
	TransitionParityEntry,
} from "./transition-parity-plan";

export interface VideoMetadata {
	width: number;
	height: number;
	frameRate: number;
	frameCount: number;
	durationSeconds: number;
	colorRange: string;
	colorSpace: string;
	colorTransfer: string;
	colorPrimaries: string;
}

export interface ParitySampleEvidence {
	progress: number;
	frameIndex: number;
	key: string;
	referenceFrame: string;
	candidateFrame: string;
	sideBySideImage: string;
	differenceImage: string;
	metrics: PixelDifferenceMetrics;
}

export interface TransitionParityEvidence {
	title: string;
	resourceId: string;
	metadataMd5: string;
	packageFamily: string;
	formula: string;
	holdExactEndpoints: boolean;
	durationSeconds: number;
	referenceVideo: string;
	candidateVideo: string;
	referenceMetadata: VideoMetadata;
	candidateMetadata: VideoMetadata;
	window: TransitionFrameWindow;
	samples: ParitySampleEvidence[];
	fiveStopMeanRmse: number;
	fiveStopWorstRmse: number;
	fullInterval: {
		psnrAverage: number;
		psnrMinimum: number;
		psnrMaximum: number;
		rgbRmse: number;
		ssim: number;
	};
	contactSheet: string;
}

interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function runCommand({
	command,
	cwd,
	environment,
}: {
	command: string[];
	cwd: string;
	environment?: Record<string, string | undefined>;
}): CommandResult {
	const execution = Bun.spawnSync({
		cmd: command,
		cwd,
		env: environment ? { ...process.env, ...environment } : process.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: execution.exitCode,
		stdout: execution.stdout.toString(),
		stderr: execution.stderr.toString(),
	};
}

function runRequired({
	command,
	cwd,
	label,
}: {
	command: string[];
	cwd: string;
	label: string;
}): CommandResult {
	const result = runCommand({ command, cwd });
	if (result.exitCode !== 0) {
		throw new Error(
			`${label} failed (${result.exitCode}):\n${result.stderr || result.stdout}`
		);
	}
	return result;
}

function objectValue({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function numberValue({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${label} must be numeric`);
	return parsed;
}

function stringValue({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

function parseFrameRate({ value }: { value: unknown }): number {
	const text = stringValue({ value });
	const [numeratorText, denominatorText = "1"] = text.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	if (
		!(Number.isFinite(numerator) && Number.isFinite(denominator)) ||
		denominator === 0
	) {
		throw new Error(`Invalid video frame rate: ${text}`);
	}
	return numerator / denominator;
}

export function readVideoMetadata({
	videoPath,
	ffprobePath,
	cwd,
}: {
	videoPath: string;
	ffprobePath: string;
	cwd: string;
}): VideoMetadata {
	if (!existsSync(videoPath)) throw new Error(`Missing video: ${videoPath}`);
	const result = runRequired({
		cwd,
		label: `ffprobe ${videoPath}`,
		command: [
			ffprobePath,
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,avg_frame_rate,nb_frames,color_range,color_space,color_transfer,color_primaries:format=duration",
			"-of",
			"json",
			videoPath,
		],
	});
	const parsed: unknown = JSON.parse(result.stdout);
	const root = objectValue({ value: parsed, label: "ffprobe output" });
	if (!Array.isArray(root.streams) || root.streams.length === 0) {
		throw new Error(`ffprobe found no video stream: ${videoPath}`);
	}
	const stream = objectValue({ value: root.streams[0], label: "video stream" });
	const format = objectValue({ value: root.format, label: "video format" });
	return {
		width: numberValue({ value: stream.width, label: "video width" }),
		height: numberValue({ value: stream.height, label: "video height" }),
		frameRate: parseFrameRate({ value: stream.avg_frame_rate }),
		frameCount: numberValue({
			value: stream.nb_frames,
			label: "video frame count",
		}),
		durationSeconds: numberValue({
			value: format.duration,
			label: "video duration",
		}),
		colorRange: stringValue({ value: stream.color_range }),
		colorSpace: stringValue({ value: stream.color_space }),
		colorTransfer: stringValue({ value: stream.color_transfer }),
		colorPrimaries: stringValue({ value: stream.color_primaries }),
	};
}

function assertComparableVideos({
	reference,
	candidate,
	window,
}: {
	reference: VideoMetadata;
	candidate: VideoMetadata;
	window: TransitionFrameWindow;
}) {
	const mismatches: string[] = [];
	if (
		reference.width !== candidate.width ||
		reference.height !== candidate.height
	) {
		mismatches.push(
			`dimensions ${reference.width}x${reference.height} vs ${candidate.width}x${candidate.height}`
		);
	}
	if (Math.abs(reference.frameRate - candidate.frameRate) > 0.0001) {
		mismatches.push(
			`frame rate ${reference.frameRate} vs ${candidate.frameRate}`
		);
	}
	if (reference.frameCount !== candidate.frameCount) {
		mismatches.push(
			`frame count ${reference.frameCount} vs ${candidate.frameCount}`
		);
	}
	if (window.endFrameExclusive > reference.frameCount) {
		mismatches.push(
			`transition ends at ${window.endFrameInclusive}, outside ${reference.frameCount} frames`
		);
	}
	if (mismatches.length > 0) {
		throw new Error(
			`Videos are not frame-comparable: ${mismatches.join(", ")}`
		);
	}
}

function extractFrame({
	ffmpegPath,
	videoPath,
	frameIndex,
	outputPath,
	cwd,
}: {
	ffmpegPath: string;
	videoPath: string;
	frameIndex: number;
	outputPath: string;
	cwd: string;
}) {
	runRequired({
		cwd,
		label: `extract frame ${frameIndex}`,
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			videoPath,
			"-vf",
			`select=eq(n\\,${frameIndex})`,
			"-frames:v",
			"1",
			"-update",
			"1",
			outputPath,
		],
	});
}

function createSideBySide({
	ffmpegPath,
	referenceFrame,
	candidateFrame,
	outputPath,
	cwd,
}: {
	ffmpegPath: string;
	referenceFrame: string;
	candidateFrame: string;
	outputPath: string;
	cwd: string;
}) {
	runRequired({
		cwd,
		label: "create side-by-side image",
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			referenceFrame,
			"-i",
			candidateFrame,
			"-filter_complex",
			"[0:v][1:v]hstack=inputs=2",
			"-frames:v",
			"1",
			"-update",
			"1",
			outputPath,
		],
	});
}

function createDifference({
	ffmpegPath,
	referenceFrame,
	candidateFrame,
	outputPath,
	cwd,
}: {
	ffmpegPath: string;
	referenceFrame: string;
	candidateFrame: string;
	outputPath: string;
	cwd: string;
}) {
	runRequired({
		cwd,
		label: "create amplified difference image",
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			referenceFrame,
			"-i",
			candidateFrame,
			"-filter_complex",
			"[0:v][1:v]blend=all_mode=difference,lutrgb=r='val*8':g='val*8':b='val*8'",
			"-frames:v",
			"1",
			"-update",
			"1",
			outputPath,
		],
	});
}

function createContactSheet({
	ffmpegPath,
	inputPaths,
	outputPath,
	cwd,
}: {
	ffmpegPath: string;
	inputPaths: string[];
	outputPath: string;
	cwd: string;
}) {
	const command = [ffmpegPath, "-hide_banner", "-loglevel", "error", "-y"];
	for (const inputPath of inputPaths) command.push("-i", inputPath);
	const scaledLabels = inputPaths.map((_, index) => `[s${index}]`).join("");
	const scaleFilters = inputPaths
		.map((_, index) => `[${index}:v]scale=640:180[s${index}]`)
		.join(";");
	command.push(
		"-filter_complex",
		`${scaleFilters};${scaledLabels}vstack=inputs=${inputPaths.length}`,
		"-frames:v",
		"1",
		"-update",
		"1",
		outputPath
	);
	runRequired({ cwd, label: "create five-stop contact sheet", command });
}

/** FFmpeg prints `inf` when the two frames are bit-identical. */
function psnrValue({ text }: { text: string }): number {
	return text === "inf" ? Number.POSITIVE_INFINITY : Number(text);
}

function parsePsnr({ output }: { output: string }) {
	const match =
		/PSNR .* average:(inf|[0-9.]+) min:(inf|[0-9.]+) max:(inf|[0-9.]+)/.exec(
			output
		);
	if (!match) throw new Error("Could not parse FFmpeg PSNR summary");
	const average = psnrValue({ text: match[1] });
	return {
		average,
		minimum: psnrValue({ text: match[2] }),
		maximum: psnrValue({ text: match[3] }),
		// A perfect match would otherwise have been reported as a failed entry.
		rgbRmse: Number.isFinite(average) ? 255 / 10 ** (average / 20) : 0,
	};
}

function parseSsim({ output }: { output: string }): number {
	const match = /SSIM .* All:([0-9.]+)/.exec(output);
	if (!match) throw new Error("Could not parse FFmpeg SSIM summary");
	return Number(match[1]);
}

function measureFullInterval({
	ffmpegPath,
	referenceVideo,
	candidateVideo,
	window,
	statsDirectory,
	cwd,
}: {
	ffmpegPath: string;
	referenceVideo: string;
	candidateVideo: string;
	window: TransitionFrameWindow;
	statsDirectory: string;
	cwd: string;
}) {
	const psnrPath = path.join(statsDirectory, "psnr.log");
	const psnr = runRequired({
		cwd,
		label: "measure transition PSNR",
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"info",
			"-i",
			referenceVideo,
			"-i",
			candidateVideo,
			"-filter_complex",
			`[0:v]trim=start_frame=${window.startFrame}:end_frame=${window.endFrameExclusive},setpts=PTS-STARTPTS,format=gbrp[reference];[1:v]trim=start_frame=${window.startFrame}:end_frame=${window.endFrameExclusive},setpts=PTS-STARTPTS,format=gbrp[candidate];[reference][candidate]psnr=stats_file=${psnrPath}:stats_version=2`,
			"-an",
			"-f",
			"null",
			"-",
		],
	});
	const ssimPath = path.join(statsDirectory, "ssim.log");
	const ssim = runRequired({
		cwd,
		label: "measure transition SSIM",
		command: [
			ffmpegPath,
			"-hide_banner",
			"-loglevel",
			"info",
			"-i",
			referenceVideo,
			"-i",
			candidateVideo,
			"-filter_complex",
			`[0:v]trim=start_frame=${window.startFrame}:end_frame=${window.endFrameExclusive},setpts=PTS-STARTPTS[reference];[1:v]trim=start_frame=${window.startFrame}:end_frame=${window.endFrameExclusive},setpts=PTS-STARTPTS[candidate];[reference][candidate]ssim=stats_file=${ssimPath}`,
			"-an",
			"-f",
			"null",
			"-",
		],
	});
	const psnrMetrics = parsePsnr({ output: `${psnr.stdout}\n${psnr.stderr}` });
	return {
		psnrAverage: psnrMetrics.average,
		psnrMinimum: psnrMetrics.minimum,
		psnrMaximum: psnrMetrics.maximum,
		rgbRmse: psnrMetrics.rgbRmse,
		ssim: parseSsim({ output: `${ssim.stdout}\n${ssim.stderr}` }),
	};
}

export async function collectTransitionParityEvidence({
	entry,
	candidateVideo,
	window,
	evidenceDirectory,
	ffmpegPath,
	ffprobePath,
	cwd,
}: {
	entry: TransitionParityEntry;
	candidateVideo: string;
	window: TransitionFrameWindow;
	evidenceDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	cwd: string;
}): Promise<TransitionParityEvidence> {
	const referenceMetadata = readVideoMetadata({
		videoPath: entry.referenceVideo,
		ffprobePath,
		cwd,
	});
	const candidateMetadata = readVideoMetadata({
		videoPath: candidateVideo,
		ffprobePath,
		cwd,
	});
	assertComparableVideos({
		reference: referenceMetadata,
		candidate: candidateMetadata,
		window,
	});
	const referenceDirectory = path.join(evidenceDirectory, "reference-frames");
	const candidateDirectory = path.join(evidenceDirectory, "candidate-frames");
	const comparisonDirectory = path.join(evidenceDirectory, "comparisons");
	mkdirSync(referenceDirectory, { recursive: true });
	mkdirSync(candidateDirectory, { recursive: true });
	mkdirSync(comparisonDirectory, { recursive: true });

	const samplePaths = window.samples.map((sample) => ({
		...sample,
		referenceFrame: path.join(referenceDirectory, `${sample.key}.png`),
		candidateFrame: path.join(candidateDirectory, `${sample.key}.png`),
		sideBySideImage: path.join(
			comparisonDirectory,
			`${sample.key}-side-by-side.png`
		),
		differenceImage: path.join(
			comparisonDirectory,
			`${sample.key}-difference-x8.png`
		),
	}));
	for (const sample of samplePaths) {
		extractFrame({
			ffmpegPath,
			videoPath: entry.referenceVideo,
			frameIndex: sample.frameIndex,
			outputPath: sample.referenceFrame,
			cwd,
		});
		extractFrame({
			ffmpegPath,
			videoPath: candidateVideo,
			frameIndex: sample.frameIndex,
			outputPath: sample.candidateFrame,
			cwd,
		});
		createSideBySide({
			ffmpegPath,
			...sample,
			outputPath: sample.sideBySideImage,
			cwd,
		});
		createDifference({
			ffmpegPath,
			...sample,
			outputPath: sample.differenceImage,
			cwd,
		});
	}
	const samples = await Promise.all(
		samplePaths.map(async (sample) => ({
			...sample,
			metrics: await compareCaptureImages({
				referencePath: sample.referenceFrame,
				candidatePath: sample.candidateFrame,
				ffmpegPath,
			}),
		}))
	);
	const rmseValues = samples.map((sample) => sample.metrics.rmse);
	const contactSheet = path.join(comparisonDirectory, "five-stop-contact.png");
	createContactSheet({
		ffmpegPath,
		inputPaths: samples.map((sample) => sample.sideBySideImage),
		outputPath: contactSheet,
		cwd,
	});
	return {
		title: entry.title,
		resourceId: entry.resourceId,
		metadataMd5: entry.metadataMd5,
		packageFamily: entry.packageFamily,
		formula: entry.formula,
		holdExactEndpoints: entry.holdExactEndpoints,
		durationSeconds: entry.durationSeconds,
		referenceVideo: entry.referenceVideo,
		candidateVideo,
		referenceMetadata,
		candidateMetadata,
		window,
		samples,
		fiveStopMeanRmse:
			rmseValues.reduce((total, value) => total + value, 0) / rmseValues.length,
		fiveStopWorstRmse: Math.max(...rmseValues),
		fullInterval: measureFullInterval({
			ffmpegPath,
			referenceVideo: entry.referenceVideo,
			candidateVideo,
			window,
			statsDirectory: evidenceDirectory,
			cwd,
		}),
		contactSheet,
	};
}

export { runCommand };
