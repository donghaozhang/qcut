/**
 * Generic local-video split utilities shared by payload-limited analysis flows
 * (video review, replicate analysis). Splitting is decided by the estimated
 * base64 data-URL size a video would occupy inside a single model request.
 *
 * @module electron/native-pipeline/editorial/video-split
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../ffmpeg/paths.js";

const execFileAsync = promisify(execFile);
const DATA_URL_PREFIX_CHARS = "data:video/mp4;base64,".length;

/** One evenly sized part of a split source video. */
export interface VideoSplitPart {
	index: number;
	startSeconds: number;
	durationSeconds: number;
	filePath: string;
	outputDir: string;
}

/** Injectable probe/split implementations (overridable in tests). */
export interface VideoSplitter {
	probeDurationSeconds: (args: { input: string }) => Promise<number>;
	splitVideo: (args: {
		input: string;
		outputDir: string;
		partCount: number;
		durationSeconds: number;
		subdirName: string;
		partDirSuffix: string;
	}) => Promise<VideoSplitPart[]>;
}

/**
 * Determines whether a video input is a remote URL or an inline data URL.
 * Those inputs cannot be split locally.
 */
export function isRemoteOrInlineVideo({ input }: { input: string }): boolean {
	return /^https?:\/\//i.test(input) || input.startsWith("data:");
}

/**
 * Estimates the character length of a base64 data URL for a file of the given size.
 */
export function estimatedBase64Chars({
	fileBytes,
}: {
	fileBytes: number;
}): number {
	return Math.ceil(fileBytes / 3) * 4 + DATA_URL_PREFIX_CHARS;
}

/**
 * Decides whether a local video must be split based on its estimated payload size.
 * Remote/inline inputs and missing files are never split.
 */
export function shouldSplitVideoInput({
	input,
	maxPayloadChars,
}: {
	input: string;
	maxPayloadChars: number;
}): { shouldSplit: boolean; estimatedPayloadChars: number; fileBytes: number } {
	if (isRemoteOrInlineVideo({ input }) || !existsSync(input)) {
		return { shouldSplit: false, estimatedPayloadChars: 0, fileBytes: 0 };
	}

	const fileBytes = statSync(input).size;
	const estimatedPayloadChars = estimatedBase64Chars({ fileBytes });
	return {
		shouldSplit: estimatedPayloadChars > maxPayloadChars,
		estimatedPayloadChars,
		fileBytes,
	};
}

/**
 * Computes how many parts a video must be split into to fit within the payload
 * limit. Always at least 2.
 */
export function partCountForPayload({
	estimatedPayloadChars,
	maxPayloadChars,
}: {
	estimatedPayloadChars: number;
	maxPayloadChars: number;
}): number {
	return Math.max(2, Math.ceil(estimatedPayloadChars / maxPayloadChars));
}

/** Builds the output file path for a single split part. */
function outputPartFilePath({
	outputDir,
	index,
	startSeconds,
}: {
	outputDir: string;
	index: number;
	startSeconds: number;
}): string {
	const paddedIndex = String(index + 1).padStart(3, "0");
	const paddedStart = String(Math.round(startSeconds)).padStart(4, "0");
	return join(outputDir, `part-${paddedIndex}-${paddedStart}s.mp4`);
}

/**
 * Probes a video's duration in seconds via `ffprobe`.
 *
 * @throws If `ffprobe` cannot determine a valid positive duration.
 */
export async function probeVideoDurationSeconds({
	input,
}: {
	input: string;
}): Promise<number> {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		input,
	]);
	const duration = Number.parseFloat(stdout.trim());
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Unable to determine video duration for ${input}`);
	}
	return duration;
}

/**
 * Splits a video into evenly sized parts using `ffmpeg` stream copy.
 * Parts are written under `<outputDir>/<subdirName>` and produced in parallel.
 */
export async function splitVideoIntoParts({
	input,
	outputDir,
	partCount,
	durationSeconds,
	subdirName,
	partDirSuffix,
}: {
	input: string;
	outputDir: string;
	partCount: number;
	durationSeconds: number;
	subdirName: string;
	partDirSuffix: string;
}): Promise<VideoSplitPart[]> {
	const ffmpegPath = getFFmpegPath();
	const splitDir = join(outputDir, subdirName);
	mkdirSync(splitDir, { recursive: true });
	const partDuration = durationSeconds / partCount;
	const parts = Array.from({ length: partCount }, (_, index) => {
		const startSeconds = index * partDuration;
		const isLastPart = index === partCount - 1;
		return {
			index,
			startSeconds,
			durationSeconds: isLastPart
				? durationSeconds - startSeconds
				: partDuration,
			filePath: outputPartFilePath({
				outputDir: splitDir,
				index,
				startSeconds,
			}),
			outputDir: join(
				splitDir,
				`part-${String(index + 1).padStart(3, "0")}-${partDirSuffix}`
			),
		};
	});

	await Promise.all(
		parts.map((part) =>
			execFileAsync(ffmpegPath, [
				"-y",
				"-hide_banner",
				"-loglevel",
				"error",
				"-ss",
				String(part.startSeconds),
				"-i",
				input,
				"-t",
				String(part.durationSeconds),
				"-c",
				"copy",
				"-map",
				"0:v:0",
				"-map",
				"0:a:0?",
				"-movflags",
				"+faststart",
				part.filePath,
			])
		)
	);

	return parts;
}

export const defaultVideoSplitter: VideoSplitter = {
	probeDurationSeconds: probeVideoDurationSeconds,
	splitVideo: splitVideoIntoParts,
};
