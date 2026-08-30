import { access, stat } from "node:fs/promises";
import { runMotionTrackingProcess } from "./process-runner.js";

const MAX_TRACKING_DIMENSION = 640;
const MAX_RAW_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export interface MotionTrackingVideoMetadata {
	fps: number;
	height: number;
	width: number;
}

export async function requireMotionTrackingSourceFile({
	sourcePath,
}: {
	sourcePath: string;
}) {
	await access(sourcePath);
	const metadata = await stat(sourcePath);
	if (!metadata.isFile() || metadata.size === 0) {
		throw new Error("运动跟踪素材不是可读取的本机视频");
	}
}

export function parseFrameRate({ value }: { value: unknown }) {
	if (typeof value !== "string") throw new Error("视频没有有效帧率");
	const parts = value.split("/");
	if (parts.length !== 2) throw new Error("视频没有有效帧率");
	const numerator = Number(parts[0]);
	const denominator = Number(parts[1]);
	const fps = numerator / denominator;
	if (!Number.isFinite(fps) || fps <= 0 || fps > 1000) {
		throw new Error(`视频帧率无效: ${value}`);
	}
	return fps;
}

export async function inspectMotionTrackingVideo({
	ffprobePath,
	signal,
	sourcePath,
}: {
	ffprobePath: string;
	signal?: AbortSignal;
	sourcePath: string;
}) {
	const result = await runMotionTrackingProcess({
		command: ffprobePath,
		args: [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height,avg_frame_rate,r_frame_rate:stream_tags=rotate:stream_side_data=rotation",
			"-of",
			"json",
			sourcePath,
		],
		signal,
	});
	const value = JSON.parse(result.stdout) as {
		streams?: Array<{
			avg_frame_rate?: unknown;
			height?: unknown;
			r_frame_rate?: unknown;
			side_data_list?: Array<{ rotation?: unknown }>;
			tags?: { rotate?: unknown };
			width?: unknown;
		}>;
	};
	const stream = value.streams?.[0];
	if (
		!stream ||
		!Number.isSafeInteger(stream.width) ||
		!Number.isSafeInteger(stream.height) ||
		(stream.width as number) <= 0 ||
		(stream.height as number) <= 0
	) {
		throw new Error("视频没有可跟踪的画面流");
	}
	const averageFps = parseFrameRate({ value: stream.avg_frame_rate });
	const declaredFps = parseFrameRate({ value: stream.r_frame_rate });
	if (Math.abs(averageFps - declaredFps) > 0.001) {
		throw new Error("运动跟踪当前只接受恒定帧率视频，请先转码 CFR");
	}
	const displayRotation = Number(
		stream.side_data_list?.find((entry) => entry.rotation !== undefined)
			?.rotation ??
			stream.tags?.rotate ??
			0
	);
	if (Number.isFinite(displayRotation) && displayRotation % 360 !== 0) {
		throw new Error("运动跟踪暂不支持带显示旋转元数据的视频，请先转正画面");
	}
	return {
		fps: averageFps,
		height: stream.height as number,
		width: stream.width as number,
	} satisfies MotionTrackingVideoMetadata;
}

export function buildRgbDecodeArguments({
	height,
	rangeEndTimeSeconds,
	rangeStartTimeSeconds,
	rawPath,
	sourcePath,
	width,
}: {
	height: number;
	rangeEndTimeSeconds: number;
	rangeStartTimeSeconds: number;
	rawPath: string;
	sourcePath: string;
	width: number;
}) {
	return [
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-noautorotate",
		"-y",
		"-i",
		sourcePath,
		"-ss",
		String(rangeStartTimeSeconds),
		"-t",
		String(rangeEndTimeSeconds - rangeStartTimeSeconds),
		"-map",
		"0:v:0",
		"-vf",
		`scale=${width}:${height}:flags=bilinear`,
		"-fps_mode",
		"passthrough",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"rgb24",
		rawPath,
	];
}

export function trackingDimensions({
	height,
	width,
}: {
	height: number;
	width: number;
}): { height: number; width: number } {
	const largestDimension = Math.max(width, height);
	if (largestDimension <= MAX_TRACKING_DIMENSION) return { height, width };
	const scale = MAX_TRACKING_DIMENSION / largestDimension;
	return {
		height: Math.max(1, Math.round(height * scale)),
		width: Math.max(1, Math.round(width * scale)),
	};
}

export function requireBoundedRawDecode({
	durationSeconds,
	fps,
	height,
	width,
}: {
	durationSeconds: number;
	fps: number;
	height: number;
	width: number;
}) {
	const estimatedFrameCount = Math.ceil(durationSeconds * fps) + 1;
	const estimatedBytes = estimatedFrameCount * width * height * 3;
	if (
		!Number.isSafeInteger(estimatedBytes) ||
		estimatedBytes > MAX_RAW_VIDEO_BYTES
	) {
		throw new Error("当前可见片段的跟踪缓存预计超过 2 GiB，请先裁短片段再跟踪");
	}
}

export function anchorFrameIndex({
	anchorTimeSeconds,
	fps,
	frameCount,
	rangeStartTimeSeconds,
}: {
	anchorTimeSeconds: number;
	fps: number;
	frameCount: number;
	rangeStartTimeSeconds: number;
}) {
	return Math.min(
		frameCount - 1,
		Math.max(0, Math.round((anchorTimeSeconds - rangeStartTimeSeconds) * fps))
	);
}
