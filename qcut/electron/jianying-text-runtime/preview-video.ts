import { randomUUID } from "node:crypto";
import { rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getFFmpegPath, getFFprobePath } from "../ffmpeg/paths.js";
import {
	getJianyingTextPreviewVideoPath,
	getJianyingTextPreviewVideoUrl,
} from "./cache-path.js";
import {
	captureJianyingTextProcess,
	runJianyingTextProcess,
	throwIfJianyingTextRenderCancelled,
} from "./render-process.js";

interface PreviewMetadata {
	streams?: Array<{
		codec_name?: string;
		width?: number;
		height?: number;
		avg_frame_rate?: string;
		tags?: { alpha_mode?: string };
	}>;
	format?: { duration?: string };
}

const UNAVAILABLE_EXECUTABLE_CODES = new Set(["EACCES", "ENOENT"]);

async function isNonemptyFile({ filePath }: { filePath: string }) {
	try {
		const metadata = await stat(filePath);
		return metadata.isFile() && metadata.size > 0;
	} catch {
		return false;
	}
}

function parseFrameRate({ value }: { value: string | undefined }) {
	if (!value) return Number.NaN;
	const [numerator, denominator = "1"] = value.split("/");
	return Number(numerator) / Number(denominator);
}

function isExecutableUnavailableError({ cause }: { cause: unknown }) {
	return (
		cause !== null &&
		typeof cause === "object" &&
		"code" in cause &&
		UNAVAILABLE_EXECUTABLE_CODES.has(String(cause.code))
	);
}

function previewMetadataMatches({
	metadata,
	frameCount,
	fps,
	width,
	height,
}: {
	metadata: PreviewMetadata;
	frameCount: number;
	fps: number;
	width: number;
	height: number;
}) {
	const stream = metadata.streams?.[0];
	const duration = Number(metadata.format?.duration);
	const frameRate = parseFrameRate({ value: stream?.avg_frame_rate });
	const expectedDuration = frameCount / fps;
	return (
		stream?.codec_name === "vp9" &&
		stream.width === width &&
		stream.height === height &&
		stream.tags?.alpha_mode === "1" &&
		Number.isFinite(frameRate) &&
		Math.abs(frameRate - fps) <= 1e-6 &&
		Number.isFinite(duration) &&
		Math.abs(duration - expectedDuration) <= Math.max(0.05, 1 / fps)
	);
}

async function isValidPreviewVideo({
	requestId,
	filePath,
	frameCount,
	fps,
	width,
	height,
}: {
	requestId: string;
	filePath: string;
	frameCount: number;
	fps: number;
	width: number;
	height: number;
}) {
	if (!(await isNonemptyFile({ filePath }))) return false;
	let ffprobePath: string;
	try {
		ffprobePath = await getFFprobePath();
	} catch {
		return true;
	}
	try {
		const { stdout } = await captureJianyingTextProcess({
			requestId,
			command: ffprobePath,
			timeoutMs: 15_000,
			args: [
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=codec_name,width,height,avg_frame_rate:stream_tags=alpha_mode:format=duration",
				"-of",
				"json",
				filePath,
			],
		});
		return previewMetadataMatches({
			metadata: JSON.parse(stdout) as PreviewMetadata,
			frameCount,
			fps,
			width,
			height,
		});
	} catch (cause) {
		throwIfJianyingTextRenderCancelled({ requestId });
		return isExecutableUnavailableError({ cause });
	}
}

async function createPreviewVideo({
	requestId,
	cacheKey,
	directory,
	frameCount,
	fps,
	width,
	height,
}: {
	requestId: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
	fps: number;
	width: number;
	height: number;
}) {
	const destination = getJianyingTextPreviewVideoPath({ cacheKey });
	if (
		await isValidPreviewVideo({
			requestId,
			filePath: destination,
			frameCount,
			fps,
			width,
			height,
		})
	) {
		return getJianyingTextPreviewVideoUrl({ cacheKey });
	}
	await rm(destination, { force: true });
	const temporary = path.join(directory, `.preview-${randomUUID()}.webm`);
	try {
		await runJianyingTextProcess({
			requestId,
			command: await getFFmpegPath(),
			timeoutMs: Math.min(300_000, Math.max(30_000, frameCount * 100)),
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-y",
				"-framerate",
				String(fps),
				"-start_number",
				"0",
				"-i",
				path.join(directory, "frame-%06d.png"),
				"-frames:v",
				String(frameCount),
				"-an",
				"-c:v",
				"libvpx-vp9",
				"-pix_fmt",
				"yuva420p",
				"-auto-alt-ref",
				"0",
				"-row-mt",
				"1",
				"-deadline",
				"good",
				"-cpu-used",
				"4",
				"-crf",
				"30",
				"-b:v",
				"0",
				temporary,
			],
		});
		throwIfJianyingTextRenderCancelled({ requestId });
		await rename(temporary, destination).catch(async (cause) => {
			if (
				await isValidPreviewVideo({
					requestId,
					filePath: destination,
					frameCount,
					fps,
					width,
					height,
				})
			) {
				return;
			}
			throw cause;
		});
		if (
			!(await isValidPreviewVideo({
				requestId,
				filePath: destination,
				frameCount,
				fps,
				width,
				height,
			}))
		) {
			throw new Error("Jianying text preview video validation failed.");
		}
		return getJianyingTextPreviewVideoUrl({ cacheKey });
	} finally {
		await rm(temporary, { force: true });
	}
}

export function ensureJianyingTextPreviewVideo({
	requestId,
	cacheKey,
	directory,
	frameCount,
	fps,
	width,
	height,
}: {
	requestId: string;
	cacheKey: string;
	directory: string;
	frameCount: number;
	fps: number;
	width: number;
	height: number;
}) {
	return createPreviewVideo({
		requestId,
		cacheKey,
		directory,
		frameCount,
		fps,
		width,
		height,
	});
}

export const jianyingTextPreviewVideoTestUtils = {
	isExecutableUnavailableError,
	previewMetadataMatches,
};
