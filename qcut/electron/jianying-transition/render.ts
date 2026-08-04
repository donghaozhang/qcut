import { spawn } from "node:child_process";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
	resolveJianyingTransition,
	type JianyingTimelineRenderRequest,
	type JianyingTimelineRenderResult,
	type JianyingTimelineTransitionSpec,
	type JianyingTransitionRenderRequest,
	type JianyingTransitionRenderResult,
} from "../jianying-transition-contract.js";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths.js";
import {
	inspectJianyingTransitionRuntime,
	type JianyingRuntimeInspection,
} from "./runtime-discovery.js";

const MAX_CAPTURED_PROCESS_OUTPUT = 64 * 1024;

export type JianyingTransitionProgress = (input: {
	stage: string;
	percent: number;
	message: string;
}) => void;

async function isReadableFile({ filePath }: { filePath: string }) {
	try {
		await access(filePath, constants.R_OK);
		return (await stat(filePath)).isFile();
	} catch {
		return false;
	}
}

function appendBounded({ current, chunk }: { current: string; chunk: Buffer }) {
	const combined = current + chunk.toString();
	return combined.length <= MAX_CAPTURED_PROCESS_OUTPUT
		? combined
		: combined.slice(-MAX_CAPTURED_PROCESS_OUTPUT);
}

function runProcess({
	command,
	args,
	env,
}: {
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output = appendBounded({ current: output, chunk });
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output = appendBounded({ current: output, chunk });
		});
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`${path.basename(command)} failed (${signal ?? code ?? "unknown"}): ${output.trim()}`
				)
			);
		});
	});
}

function captureProcess({
	command,
	args,
}: {
	command: string;
	args: string[];
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => {
			stdout = appendBounded({ current: stdout, chunk });
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = appendBounded({ current: stderr, chunk });
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}
			reject(
				new Error(
					`${path.basename(command)} failed (${code ?? "unknown"}): ${stderr.trim()}`
				)
			);
		});
	});
}

function requirePositiveNumber({
	value,
	label,
	maximum,
}: {
	value: number;
	label: string;
	maximum: number;
}) {
	if (!Number.isFinite(value) || value <= 0 || value > maximum) {
		throw new Error(
			`${label} must be greater than 0 and no more than ${maximum}.`
		);
	}
	return value;
}

async function probeDimensions({
	inputPath,
}: {
	inputPath: string;
}): Promise<{ width: number; height: number }> {
	const ffprobePath = await getFFprobePath();
	const output = await captureProcess({
		command: ffprobePath,
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height",
			"-of",
			"csv=s=x:p=0",
			inputPath,
		],
	});
	const match = /^(\d+)x(\d+)$/.exec(output.trim());
	if (!match) throw new Error(`Could not read video dimensions: ${inputPath}`);
	return { width: Number(match[1]), height: Number(match[2]) };
}

function evenDimension({ value }: { value: number }) {
	const rounded = Math.round(value);
	return rounded % 2 === 0 ? rounded : rounded + 1;
}

async function decodeInput({
	ffmpegPath,
	inputPath,
	outputPath,
	width,
	height,
	fps,
}: {
	ffmpegPath: string;
	inputPath: string;
	outputPath: string;
	width: number;
	height: number;
	fps: number;
}) {
	const normalizeFilter = [
		`fps=${fps}`,
		`scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
		`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
		"setsar=1",
		"format=rgba",
	].join(",");
	await runProcess({
		command: ffmpegPath,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			inputPath,
			"-map",
			"0:v:0",
			"-an",
			"-sn",
			"-dn",
			"-vf",
			normalizeFilter,
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			outputPath,
		],
	});
}

async function encodeOutput({
	ffmpegPath,
	rawPath,
	outputPath,
	width,
	height,
	fps,
	audioInputPath,
}: {
	ffmpegPath: string;
	rawPath: string;
	outputPath: string;
	width: number;
	height: number;
	fps: number;
	audioInputPath?: string;
}) {
	const audioInputArgs = audioInputPath ? ["-i", audioInputPath] : [];
	const audioOutputArgs = audioInputPath
		? ["-map", "0:v:0", "-map", "1:a:0?", "-c:a", "copy"]
		: ["-an"];
	await runProcess({
		command: ffmpegPath,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"rawvideo",
			"-pixel_format",
			"rgba",
			"-video_size",
			`${width}x${height}`,
			"-framerate",
			String(fps),
			"-i",
			rawPath,
			...audioInputArgs,
			...audioOutputArgs,
			"-vf",
			"scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-color_range",
			"tv",
			"-colorspace",
			"bt709",
			"-color_trc",
			"bt709",
			"-color_primaries",
			"bt709",
			"-movflags",
			"+faststart",
			outputPath,
		],
	});
}

async function countRawFrames({
	rawPath,
	width,
	height,
}: {
	rawPath: string;
	width: number;
	height: number;
}) {
	const byteCount = (await stat(rawPath)).size;
	const frameBytes = width * height * 4;
	if (byteCount <= 0 || byteCount % frameBytes !== 0) {
		throw new Error("Jianying runtime produced an invalid RGBA frame stream.");
	}
	return byteCount / frameBytes;
}

async function renderRawTransition({
	inspection,
	packagePath,
	rawInputA,
	rawInputB,
	rawOutput,
	width,
	height,
	fps,
	duration,
}: {
	inspection: JianyingRuntimeInspection;
	packagePath: string;
	rawInputA: string;
	rawInputB: string;
	rawOutput: string;
	width: number;
	height: number;
	fps: number;
	duration: number;
}): Promise<void> {
	if (!inspection.appBundlePath || !inspection.bridgePath) {
		throw new Error(inspection.status.message);
	}
	const appContents = path.join(inspection.appBundlePath, "Contents");
	const frameworks = path.join(appContents, "Frameworks");
	await runProcess({
		command: inspection.bridgePath,
		args: [appContents, "transition-video"],
		env: {
			...process.env,
			DYLD_LIBRARY_PATH: [frameworks, process.env.DYLD_LIBRARY_PATH]
				.filter(Boolean)
				.join(":"),
			JY_TRANSITION_PACKAGE: packagePath,
			JY_RAW_INPUT_A: rawInputA,
			JY_RAW_INPUT_B: rawInputB,
			JY_RAW_OUTPUT: rawOutput,
			JY_VIDEO_WIDTH: String(width),
			JY_VIDEO_HEIGHT: String(height),
			JY_VIDEO_FPS: String(fps),
			JY_TRANSITION_DURATION: String(duration),
			JY_TRANSITION_HOLD_EXACT_ENDPOINTS: "1",
		},
	});
}

async function splitRawVideo({
	inputPath,
	inputFrameCount,
	cutFrame,
	frameBytes,
	outputA,
	outputB,
}: {
	inputPath: string;
	inputFrameCount: number;
	cutFrame: number;
	frameBytes: number;
	outputA: string;
	outputB: string;
}): Promise<void> {
	if (cutFrame <= 0 || cutFrame >= inputFrameCount) {
		throw new Error(
			`Transition cut frame ${cutFrame} is outside the rendered video.`
		);
	}
	const splitByte = cutFrame * frameBytes;
	await Promise.all([
		pipeline(
			createReadStream(inputPath, { start: 0, end: splitByte - 1 }),
			createWriteStream(outputA)
		),
		pipeline(
			createReadStream(inputPath, { start: splitByte }),
			createWriteStream(outputB)
		),
	]);
}

async function applyTimelineTransition({
	transitions,
	index,
	currentRawPath,
	temporaryDirectory,
	inspection,
	frameCount,
	frameBytes,
	width,
	height,
	fps,
	onProgress,
}: {
	transitions: JianyingTimelineTransitionSpec[];
	index: number;
	currentRawPath: string;
	temporaryDirectory: string;
	inspection: JianyingRuntimeInspection;
	frameCount: number;
	frameBytes: number;
	width: number;
	height: number;
	fps: number;
	onProgress: JianyingTransitionProgress;
}): Promise<string> {
	const spec = transitions[index];
	if (!spec) return currentRawPath;
	const transition = resolveJianyingTransition({ value: spec.presetId });
	if (!transition) {
		throw new Error(`Unknown Jianying transition: ${spec.presetId}`);
	}
	const packagePath = inspection.packagePaths.get(transition.id);
	if (!packagePath) {
		throw new Error(`本机尚未缓存剪映转场“${transition.localizedName}”。`);
	}
	const duration = requirePositiveNumber({
		value: spec.duration ?? transition.defaultDuration,
		label: "Duration",
		maximum: 5,
	});
	const cutTime = requirePositiveNumber({
		value: spec.cutTime,
		label: "Cut time",
		maximum: frameCount / fps,
	});
	const cutFrame = Math.round(cutTime * fps);
	const rawInputA = path.join(temporaryDirectory, `timeline-${index}-a.rgba`);
	const rawInputB = path.join(temporaryDirectory, `timeline-${index}-b.rgba`);
	const rawOutput = path.join(temporaryDirectory, `timeline-${index}-out.rgba`);
	await splitRawVideo({
		inputPath: currentRawPath,
		inputFrameCount: frameCount,
		cutFrame,
		frameBytes,
		outputA: rawInputA,
		outputB: rawInputB,
	});
	const percent = 25 + Math.round((index / transitions.length) * 55);
	onProgress({
		stage: "render",
		percent,
		message: `调用剪映本机引擎渲染${transition.localizedName}`,
	});
	await renderRawTransition({
		inspection,
		packagePath,
		rawInputA,
		rawInputB,
		rawOutput,
		width,
		height,
		fps,
		duration,
	});
	const renderedFrameCount = await countRawFrames({
		rawPath: rawOutput,
		width,
		height,
	});
	if (renderedFrameCount !== frameCount) {
		throw new Error("Jianying timeline transition changed the video length.");
	}
	return applyTimelineTransition({
		transitions,
		index: index + 1,
		currentRawPath: rawOutput,
		temporaryDirectory,
		inspection,
		frameCount,
		frameBytes,
		width,
		height,
		fps,
		onProgress,
	});
}

export async function renderJianyingTransition({
	request,
	onProgress = () => undefined,
}: {
	request: JianyingTransitionRenderRequest;
	onProgress?: JianyingTransitionProgress;
}): Promise<JianyingTransitionRenderResult> {
	const transition = resolveJianyingTransition({ value: request.presetId });
	if (!transition)
		throw new Error(`Unknown Jianying transition: ${request.presetId}`);
	if (!(await isReadableFile({ filePath: request.inputA }))) {
		throw new Error(`Input A is not readable: ${request.inputA}`);
	}
	if (!(await isReadableFile({ filePath: request.inputB }))) {
		throw new Error(`Input B is not readable: ${request.inputB}`);
	}

	const outputPath = path.resolve(request.outputPath);
	const inputPaths = [
		path.resolve(request.inputA),
		path.resolve(request.inputB),
	];
	if (inputPaths.includes(outputPath)) {
		throw new Error("Output must not overwrite either input video.");
	}
	if (!request.overwrite && (await isReadableFile({ filePath: outputPath }))) {
		throw new Error(`Output already exists: ${outputPath}`);
	}

	onProgress({ stage: "inspect", percent: 5, message: "检查本机剪映运行时" });
	const inspection = await inspectJianyingTransitionRuntime();
	if (!inspection.appBundlePath) throw new Error(inspection.status.message);
	if (!inspection.bridgePath) throw new Error(inspection.status.message);
	const packagePath = inspection.packagePaths.get(transition.id);
	if (!packagePath) {
		throw new Error(`本机尚未缓存剪映转场“${transition.localizedName}”。`);
	}

	const sourceDimensions = await probeDimensions({ inputPath: request.inputA });
	const width = evenDimension({
		value: requirePositiveNumber({
			value: request.width ?? sourceDimensions.width,
			label: "Width",
			maximum: 16_384,
		}),
	});
	const height = evenDimension({
		value: requirePositiveNumber({
			value: request.height ?? sourceDimensions.height,
			label: "Height",
			maximum: 16_384,
		}),
	});
	const fps = requirePositiveNumber({
		value: request.fps ?? 30,
		label: "FPS",
		maximum: 240,
	});
	const duration = requirePositiveNumber({
		value: request.duration ?? transition.defaultDuration,
		label: "Duration",
		maximum: 5,
	});

	await mkdir(path.dirname(outputPath), { recursive: true });
	const temporaryDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-transition-")
	);
	const rawInputA = path.join(temporaryDirectory, "input-a.rgba");
	const rawInputB = path.join(temporaryDirectory, "input-b.rgba");
	const rawOutput = path.join(temporaryDirectory, "output.rgba");
	const ffmpegPath = getFFmpegPath();

	try {
		onProgress({ stage: "decode", percent: 15, message: "解码第一个视频" });
		await decodeInput({
			ffmpegPath,
			inputPath: request.inputA,
			outputPath: rawInputA,
			width,
			height,
			fps,
		});
		onProgress({ stage: "decode", percent: 35, message: "解码第二个视频" });
		await decodeInput({
			ffmpegPath,
			inputPath: request.inputB,
			outputPath: rawInputB,
			width,
			height,
			fps,
		});

		onProgress({
			stage: "render",
			percent: 55,
			message: `调用剪映本机引擎渲染${transition.localizedName}`,
		});
		await renderRawTransition({
			inspection,
			packagePath,
			rawInputA,
			rawInputB,
			rawOutput,
			width,
			height,
			fps,
			duration,
		});
		const frameCount = await countRawFrames({
			rawPath: rawOutput,
			width,
			height,
		});
		onProgress({ stage: "encode", percent: 85, message: "编码转场视频" });
		await encodeOutput({
			ffmpegPath,
			rawPath: rawOutput,
			outputPath,
			width,
			height,
			fps,
		});
		if (!(await isReadableFile({ filePath: outputPath }))) {
			throw new Error("Encoded transition output is missing.");
		}
		onProgress({ stage: "complete", percent: 100, message: "转场渲染完成" });
		return {
			outputPath,
			presetId: transition.id,
			duration,
			fps,
			width,
			height,
			frameCount,
		};
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}

export async function renderJianyingTimelineTransitions({
	request,
	onProgress = () => undefined,
}: {
	request: JianyingTimelineRenderRequest;
	onProgress?: JianyingTransitionProgress;
}): Promise<JianyingTimelineRenderResult> {
	if (request.transitions.length === 0) {
		throw new Error("At least one Jianying timeline transition is required.");
	}
	if (request.transitions.length > 64) {
		throw new Error(
			"No more than 64 Jianying timeline transitions are supported."
		);
	}
	if (!(await isReadableFile({ filePath: request.inputPath }))) {
		throw new Error(`Input video is not readable: ${request.inputPath}`);
	}
	const inputPath = path.resolve(request.inputPath);
	const outputPath = path.resolve(request.outputPath);
	if (inputPath === outputPath) {
		throw new Error("Timeline transition output must not overwrite its input.");
	}
	if (!request.overwrite && (await isReadableFile({ filePath: outputPath }))) {
		throw new Error(`Output already exists: ${outputPath}`);
	}

	onProgress({ stage: "inspect", percent: 5, message: "检查本机剪映运行时" });
	const inspection = await inspectJianyingTransitionRuntime();
	if (!inspection.appBundlePath || !inspection.bridgePath) {
		throw new Error(inspection.status.message);
	}
	const unknown = request.transitions.find(
		(spec) => !resolveJianyingTransition({ value: spec.presetId })
	);
	if (unknown) {
		throw new Error(`Unknown Jianying transition: ${unknown.presetId}`);
	}
	const unavailable = request.transitions
		.flatMap((spec) => {
			const transition = resolveJianyingTransition({ value: spec.presetId });
			return transition ? [transition] : [];
		})
		.find((transition) => !inspection.packagePaths.has(transition.id));
	if (unavailable) {
		throw new Error(`本机尚未缓存剪映转场“${unavailable.localizedName}”。`);
	}

	const sourceDimensions = await probeDimensions({ inputPath });
	const width = evenDimension({
		value: requirePositiveNumber({
			value: request.width ?? sourceDimensions.width,
			label: "Width",
			maximum: 16_384,
		}),
	});
	const height = evenDimension({
		value: requirePositiveNumber({
			value: request.height ?? sourceDimensions.height,
			label: "Height",
			maximum: 16_384,
		}),
	});
	const fps = requirePositiveNumber({
		value: request.fps ?? 30,
		label: "FPS",
		maximum: 240,
	});
	const transitions = [...request.transitions].sort(
		(left, right) => left.cutTime - right.cutTime
	);

	await mkdir(path.dirname(outputPath), { recursive: true });
	const temporaryDirectory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-timeline-")
	);
	const rawInput = path.join(temporaryDirectory, "timeline-input.rgba");
	const ffmpegPath = getFFmpegPath();

	try {
		onProgress({ stage: "decode", percent: 15, message: "解码 QCut 合成视频" });
		await decodeInput({
			ffmpegPath,
			inputPath,
			outputPath: rawInput,
			width,
			height,
			fps,
		});
		const frameCount = await countRawFrames({
			rawPath: rawInput,
			width,
			height,
		});
		const finalRawPath = await applyTimelineTransition({
			transitions,
			index: 0,
			currentRawPath: rawInput,
			temporaryDirectory,
			inspection,
			frameCount,
			frameBytes: width * height * 4,
			width,
			height,
			fps,
			onProgress,
		});
		onProgress({ stage: "encode", percent: 85, message: "编码 QCut 转场成片" });
		await encodeOutput({
			ffmpegPath,
			rawPath: finalRawPath,
			outputPath,
			width,
			height,
			fps,
			audioInputPath: inputPath,
		});
		if (!(await isReadableFile({ filePath: outputPath }))) {
			throw new Error("Encoded timeline transition output is missing.");
		}
		onProgress({ stage: "complete", percent: 100, message: "转场渲染完成" });
		return {
			outputPath,
			fps,
			width,
			height,
			frameCount,
			transitionCount: transitions.length,
		};
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
}
