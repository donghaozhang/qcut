import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveAutorotatedVideoDimensions } from "../jianying-person-cutout/video-display-dimensions.js";

const execFileAsync = promisify(execFile);
const MAXIMUM_DIMENSION = 8192;
const MAXIMUM_PIXELS = 35_000_000;

interface ProbeStream {
	avg_frame_rate?: unknown;
	codec_type?: unknown;
	height?: unknown;
	r_frame_rate?: unknown;
	side_data_list?: Array<{ rotation?: unknown }>;
	tags?: { rotate?: unknown };
	width?: unknown;
}

export interface DeflickerVideoMetadata {
	durationSeconds: number;
	fps: number;
	frameCount: number;
	hasAudio: boolean;
	height: number;
	width: number;
}

function parseFrameRate({ value }: { value: unknown }) {
	if (typeof value !== "string") return null;
	const [numeratorValue, denominatorValue, ...remainder] = value.split("/");
	if (remainder.length > 0) return null;
	const numerator = Number(numeratorValue);
	const denominator = Number(denominatorValue);
	const fps = numerator / denominator;
	return Number.isFinite(fps) && fps > 0 && fps <= 240 ? fps : null;
}

function positiveNumber({ label, value }: { label: string; value: unknown }) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`视频没有有效${label}`);
	}
	return parsed;
}

export async function requireDeflickerSourceFile({
	sourcePath,
}: {
	sourcePath: string;
}) {
	await access(sourcePath);
	const metadata = await stat(sourcePath);
	if (!metadata.isFile() || metadata.size === 0) {
		throw new Error("防闪烁素材不是可读取的本机视频");
	}
	return metadata;
}

export async function inspectDeflickerVideo({
	ffprobePath,
	signal,
	sourcePath,
}: {
	ffprobePath: string;
	signal?: AbortSignal;
	sourcePath: string;
}): Promise<DeflickerVideoMetadata> {
	const { stdout } = await execFileAsync(
		ffprobePath,
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate:stream_tags=rotate:stream_side_data=rotation",
			"-of",
			"json",
			sourcePath,
		],
		{ encoding: "utf8", maxBuffer: 4 * 1024 * 1024, signal }
	);
	const value = JSON.parse(stdout) as {
		format?: { duration?: unknown };
		streams?: ProbeStream[];
	};
	const video = value.streams?.find((stream) => stream.codec_type === "video");
	if (
		!video ||
		!Number.isSafeInteger(video.width) ||
		!Number.isSafeInteger(video.height)
	) {
		throw new Error("素材没有可处理的视频流");
	}
	const encodedWidth = positiveNumber({ label: "宽度", value: video.width });
	const encodedHeight = positiveNumber({ label: "高度", value: video.height });
	const dimensions = resolveAutorotatedVideoDimensions({
		height: encodedHeight,
		sideDataList: video.side_data_list,
		tags: video.tags,
		width: encodedWidth,
	});
	if (
		dimensions.width > MAXIMUM_DIMENSION ||
		dimensions.height > MAXIMUM_DIMENSION ||
		dimensions.width * dimensions.height > MAXIMUM_PIXELS
	) {
		throw new Error("防闪烁当前最多处理 8K 且不超过 3500 万像素的画面");
	}
	const fps =
		parseFrameRate({ value: video.avg_frame_rate }) ??
		parseFrameRate({ value: video.r_frame_rate });
	if (!fps) throw new Error("视频没有有效帧率");
	const durationSeconds = positiveNumber({
		label: "时长",
		value: value.format?.duration,
	});
	return {
		durationSeconds,
		fps,
		frameCount: Math.max(1, Math.round(durationSeconds * fps)),
		hasAudio:
			value.streams?.some((stream) => stream.codec_type === "audio") ?? false,
		height: dimensions.height,
		width: dimensions.width,
	};
}
