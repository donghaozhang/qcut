import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	JianyingEffectAdjustValue,
	JianyingEffectDefinition,
} from "../jianying-effect-contract.js";
import { getFFmpegPath } from "../ffmpeg/paths.js";
import { buildJianyingRawDecodeFilter } from "../jianying-transition/video-filters.js";
import type { JianyingEffectRuntimeInspection } from "./runtime-discovery.js";

const MAX_CAPTURED_PROCESS_OUTPUT = 8192;
/** A stalled ffmpeg or bridge must fail the pass, not hang the export. */
const PROCESS_TIMEOUT_MS = 15 * 60 * 1000;

export interface JianyingEffectFrameCounts {
	inputFrames: number;
	effectFrames: number;
	outputFrames: number;
}

export const EFFECT_FRAME_COUNT_PATTERN =
	/\[effect\] frames: input=(\d+), effect=(\d+), output=(\d+)/;

/** Reads the counts the probe prints, so callers never guess them. */
function parseFrameCounts({ output }: { output: string }) {
	const match = output.match(EFFECT_FRAME_COUNT_PATTERN);
	if (!match) {
		throw new Error("剪映运行时未报告特效渲染帧数。");
	}
	return {
		inputFrames: Number(match[1]),
		effectFrames: Number(match[2]),
		outputFrames: Number(match[3]),
	};
}

function appendBounded({ current, chunk }: { current: string; chunk: string }) {
	const combined = current + chunk;
	return combined.length <= MAX_CAPTURED_PROCESS_OUTPUT
		? combined
		: combined.slice(-MAX_CAPTURED_PROCESS_OUTPUT);
}

export function runJianyingEffectProcess({
	command,
	args,
	env,
	timeoutMs = PROCESS_TIMEOUT_MS,
	retainPattern,
}: {
	command: string;
	args: string[];
	env?: NodeJS.ProcessEnv;
	timeoutMs?: number;
	/**
	 * A line matching this is latched as it streams by and prepended to the
	 * result, so it survives the tail window. Packages that embed a JS engine
	 * log ~90KB of scene teardown after the probe prints its counts, which
	 * would otherwise scroll the one line the caller needs out of view.
	 */
	retainPattern?: RegExp;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			env,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, timeoutMs);
		let output = "";
		let retained = "";
		const absorb = (chunk: Buffer) => {
			const text = chunk.toString();
			// Matched against the pre-truncation window: a chunk boundary can
			// split the line, and the retained tail always holds the leading part.
			const match = retainPattern ? (output + text).match(retainPattern) : null;
			if (match) retained = match[0];
			output = appendBounded({ current: output, chunk: text });
		};
		const finalOutput = () => (retained ? `${retained}\n${output}` : output);
		child.stdout.on("data", absorb);
		child.stderr.on("data", absorb);
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code, signal) => {
			clearTimeout(timer);
			if (timedOut) {
				reject(
					new Error(
						`${path.basename(command)} timed out after ${timeoutMs / 1000}s`
					)
				);
				return;
			}
			if (code === 0) {
				resolve(finalOutput());
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

/** Serializes slider values the way the probe expects them on stdin-free env. */
function encodeAdjustValues({
	adjustValues,
}: {
	adjustValues: JianyingEffectAdjustValue[];
}): string {
	return adjustValues.map((entry) => `${entry.key}=${entry.value}`).join(",");
}

function bridgeEnvironment({
	inspection,
	extra,
}: {
	inspection: JianyingEffectRuntimeInspection;
	extra: NodeJS.ProcessEnv;
}): NodeJS.ProcessEnv {
	const runtimeFrameworks = inspection.runtimeRootPath
		? path.join(inspection.runtimeRootPath, "Frameworks")
		: undefined;
	const appFrameworks = inspection.appBundlePath
		? path.join(inspection.appBundlePath, "Contents", "Frameworks")
		: undefined;
	return {
		...process.env,
		DYLD_LIBRARY_PATH: [
			runtimeFrameworks,
			appFrameworks,
			process.env.DYLD_LIBRARY_PATH,
		]
			.filter(Boolean)
			.join(":"),
		...extra,
	};
}

export async function renderJianyingEffectClip({
	inspection,
	definition,
	inputPath,
	outputPath,
	width,
	height,
	frameRate,
	startSeconds = 0,
	durationSeconds,
	adjustValues = [],
}: {
	inspection: JianyingEffectRuntimeInspection;
	definition: JianyingEffectDefinition;
	inputPath: string;
	outputPath: string;
	width: number;
	height: number;
	frameRate: number;
	startSeconds?: number;
	durationSeconds?: number;
	adjustValues?: JianyingEffectAdjustValue[];
}): Promise<JianyingEffectFrameCounts> {
	if (!inspection.runtimeRootPath || !inspection.bridgePath) {
		throw new Error(inspection.status.message);
	}

	const ffmpegPath = getFFmpegPath();
	const workspace = await mkdtemp(path.join(os.tmpdir(), "qcut-jy-effect-"));
	const rawInput = path.join(workspace, "input.rgba");
	const rawOutput = path.join(workspace, "output.rgba");

	try {
		await runJianyingEffectProcess({
			command: ffmpegPath,
			args: [
				"-y",
				"-i",
				inputPath,
				"-vf",
				buildJianyingRawDecodeFilter({ fps: frameRate, width, height }),
				"-f",
				"rawvideo",
				"-pix_fmt",
				"rgba",
				rawInput,
			],
		});

		const bridgeOutput = await runJianyingEffectProcess({
			command: inspection.bridgePath,
			args: [inspection.runtimeRootPath, "effect-video"],
			retainPattern: EFFECT_FRAME_COUNT_PATTERN,
			env: bridgeEnvironment({
				inspection,
				extra: {
					JY_EFFECT_PACKAGE: definition.packagePath,
					JY_RAW_INPUT: rawInput,
					JY_RAW_OUTPUT: rawOutput,
					JY_VIDEO_WIDTH: String(width),
					JY_VIDEO_HEIGHT: String(height),
					JY_VIDEO_FPS: String(frameRate),
					JY_EFFECT_START: String(startSeconds),
					JY_EFFECT_DURATION: String(
						durationSeconds ?? definition.defaultDurationMs / 1000
					),
					JY_EFFECT_ADJUST: encodeAdjustValues({ adjustValues }),
				},
			}),
		});

		// The raw stream carries video only, so the source is muxed back in for
		// its audio — otherwise every lab effect would silence the export.
		await runJianyingEffectProcess({
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
				String(frameRate),
				"-i",
				rawOutput,
				"-i",
				inputPath,
				"-map",
				"0:v:0",
				"-map",
				"1:a:0?",
				"-c:a",
				"copy",
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

		return parseFrameCounts({ output: bridgeOutput });
	} finally {
		await rm(workspace, { recursive: true, force: true });
	}
}
