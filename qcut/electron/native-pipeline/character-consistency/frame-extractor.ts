import { execFile } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";
import type { Keyframe, VideoMeta } from "./types.js";

const execFileAsync = promisify(execFile);

type ExecFileAsyncFn = (
	file: string,
	args: string[]
) => Promise<{ stdout: string; stderr: string }>;

function parseFrameRate({ value }: { value: string }): number {
	const trimmed = value.trim();
	if (!trimmed.includes("/")) {
		const fps = Number.parseFloat(trimmed);
		return Number.isFinite(fps) && fps > 0 ? fps : 0;
	}
	const [numText, denText] = trimmed.split("/");
	const numerator = Number.parseFloat(numText ?? "");
	const denominator = Number.parseFloat(denText ?? "");
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
	if (denominator <= 0) return 0;
	return numerator / denominator;
}

function parseProbeJson({ stdout }: { stdout: string }): VideoMeta {
	const parsed = JSON.parse(stdout) as {
		streams?: Array<{
			r_frame_rate?: string;
			avg_frame_rate?: string;
			duration?: string;
			nb_frames?: string;
		}>;
		format?: { duration?: string };
	};
	const stream = parsed.streams?.[0];
	const fps = parseFrameRate({
		value: stream?.r_frame_rate || stream?.avg_frame_rate || "0",
	});
	const durationSeconds = Number.parseFloat(
		stream?.duration || parsed.format?.duration || "0"
	);
	const reportedFrames = Number.parseInt(stream?.nb_frames || "", 10);
	const totalFrames = Number.isFinite(reportedFrames)
		? reportedFrames
		: Math.round(durationSeconds * fps);

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error("Unable to determine video fps");
	}
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("Unable to determine video duration");
	}

	return { fps, durationSeconds, totalFrames };
}

export async function probeVideoMeta({
	input,
	execFileAsyncFn = execFileAsync as ExecFileAsyncFn,
	resolveFFprobePath = getFFprobePath,
}: {
	input: string;
	execFileAsyncFn?: ExecFileAsyncFn;
	resolveFFprobePath?: () => Promise<string>;
}): Promise<VideoMeta> {
	const ffprobePath = await resolveFFprobePath();
	const { stdout } = await execFileAsyncFn(ffprobePath, [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=r_frame_rate,avg_frame_rate,duration,nb_frames:format=duration",
		"-of",
		"json",
		input,
	]);
	return parseProbeJson({ stdout });
}

function buildVideoFilter({
	fps,
	sceneDetect,
	maxLongEdge,
}: {
	fps: number;
	sceneDetect: boolean;
	maxLongEdge: number;
}): string {
	const scale = `scale='if(gt(iw,ih),min(${maxLongEdge},iw),-2)':'if(gt(iw,ih),-2,min(${maxLongEdge},ih))'`;
	if (sceneDetect) return `select='gt(scene,0.4)',${scale}`;
	return `fps=${fps},${scale}`;
}

function buildKeyframes({
	files,
	outputDir,
	samplingFps,
	videoFps,
}: {
	files: string[];
	outputDir: string;
	samplingFps: number;
	videoFps: number;
}): Keyframe[] {
	return files.map((file, index) => {
		const timeSeconds = index / samplingFps;
		return {
			index,
			frameNumber: Math.round(timeSeconds * videoFps),
			timeSeconds,
			path: join(outputDir, file),
		};
	});
}

export async function extractKeyframes({
	input,
	fps,
	sceneDetect,
	outputDir,
	videoFps = fps,
	maxLongEdge = 768,
	execFileAsyncFn = execFileAsync as ExecFileAsyncFn,
	resolveFFmpegPath = getFFmpegPath,
}: {
	input: string;
	fps: number;
	sceneDetect: boolean;
	outputDir: string;
	videoFps?: number;
	maxLongEdge?: number;
	execFileAsyncFn?: ExecFileAsyncFn;
	resolveFFmpegPath?: () => string;
}): Promise<Keyframe[]> {
	const framesDir = join(outputDir, "consistency-frames");
	mkdirSync(framesDir, { recursive: true });
	const outputPattern = join(framesDir, "frame-%06d.jpg");
	const videoFilter = buildVideoFilter({ fps, sceneDetect, maxLongEdge });

	await execFileAsyncFn(resolveFFmpegPath(), [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		input,
		"-vf",
		videoFilter,
		"-q:v",
		"3",
		outputPattern,
	]);

	const files = readdirSync(framesDir)
		.filter((file) => /^frame-\d{6}\.jpg$/.test(file))
		.sort();
	return buildKeyframes({
		files,
		outputDir: framesDir,
		samplingFps: fps,
		videoFps,
	});
}

export const frameExtractorInternals = {
	parseFrameRate,
	parseProbeJson,
	buildVideoFilter,
	buildKeyframes,
};
