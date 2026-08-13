import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { getFFmpegPath, getFFprobePath } from "../../electron/ffmpeg/paths.js";

const execFileAsync = promisify(execFile);
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

interface VideoStreamProbe {
	width?: number;
	height?: number;
	r_frame_rate?: string;
}

interface VideoProbe {
	streams?: VideoStreamProbe[];
}

export interface RealVideoFrame {
	rgba: Uint8Array;
	timestampSeconds: number;
}

export interface RealVideoSequence {
	width: number;
	height: number;
	fps: number;
	frames: RealVideoFrame[];
	sourceSha256: string;
	motion: ReturnType<typeof measureSequenceMotion>;
}

function parseFrameRate({ value }: { value?: string }) {
	if (!value) throw new Error("Video frame rate is unavailable");
	const [numeratorText, denominatorText = "1"] = value.split("/");
	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	const fps = numerator / denominator;
	if (!(Number.isFinite(fps) && fps > 0)) {
		throw new Error(`Invalid video frame rate: ${value}`);
	}
	return fps;
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function rgbMae({ left, right }: { left: Uint8Array; right: Uint8Array }) {
	if (left.length !== right.length || left.length % 4 !== 0) {
		throw new Error("Motion frames must have identical RGBA dimensions");
	}
	let absoluteError = 0;
	for (let index = 0; index < left.length; index += 4) {
		absoluteError += Math.abs(left[index] - right[index]);
		absoluteError += Math.abs(left[index + 1] - right[index + 1]);
		absoluteError += Math.abs(left[index + 2] - right[index + 2]);
	}
	return absoluteError / ((left.length / 4) * 3);
}

export function measureSequenceMotion({
	frames,
	movingPairThreshold = 1,
}: {
	frames: Uint8Array[];
	movingPairThreshold?: number;
}) {
	if (frames.length < 2) {
		throw new Error("Real-video verification requires at least two frames");
	}
	const adjacentRgbMae = frames
		.slice(1)
		.map((frame, index) => rgbMae({ left: frames[index], right: frame }));
	const movingPairCount = adjacentRgbMae.filter(
		(value) => value >= movingPairThreshold
	).length;
	return {
		adjacentRgbMae,
		meanAdjacentRgbMae:
			adjacentRgbMae.reduce((sum, value) => sum + value, 0) /
			adjacentRgbMae.length,
		maxAdjacentRgbMae: Math.max(...adjacentRgbMae),
		movingPairCount,
		movingPairThreshold,
	};
}

async function probeVideo({ videoPath }: { videoPath: string }) {
	const ffprobePath = await getFFprobePath();
	const { stdout } = await execFileAsync(ffprobePath, [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-show_entries",
		"stream=width,height,r_frame_rate",
		"-of",
		"json",
		videoPath,
	]);
	const probe = JSON.parse(String(stdout)) as VideoProbe;
	const stream = probe.streams?.[0];
	if (!(stream?.width && stream.height)) {
		throw new Error("Video dimensions are unavailable");
	}
	return {
		width: stream.width,
		height: stream.height,
		fps: parseFrameRate({ value: stream.r_frame_rate }),
	};
}

export async function decodeRealVideoSequence({
	videoPath,
	frameCount,
	startSeconds = 0,
}: {
	videoPath: string;
	frameCount: number;
	startSeconds?: number;
}): Promise<RealVideoSequence> {
	if (!(Number.isSafeInteger(frameCount) && frameCount >= 2)) {
		throw new Error("Video frame count must be an integer of at least two");
	}
	if (!(Number.isFinite(startSeconds) && startSeconds >= 0)) {
		throw new Error("Video start time must be non-negative");
	}
	const [{ width, height, fps }, sourceBytes] = await Promise.all([
		probeVideo({ videoPath }),
		readFile(videoPath),
	]);
	const ffmpegPath = getFFmpegPath();
	const { stdout } = await execFileAsync(
		ffmpegPath,
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			videoPath,
			"-ss",
			String(startSeconds),
			"-frames:v",
			String(frameCount),
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		{ encoding: "buffer", maxBuffer: MAX_VIDEO_BYTES }
	);
	const decoded = new Uint8Array(stdout as Buffer);
	const bytesPerFrame = width * height * 4;
	if (decoded.length !== bytesPerFrame * frameCount) {
		throw new Error(
			`Expected ${frameCount} decoded frames, received ${decoded.length / bytesPerFrame}`
		);
	}
	const frames = Array.from({ length: frameCount }, (_, index) => ({
		rgba: decoded.slice(index * bytesPerFrame, (index + 1) * bytesPerFrame),
		timestampSeconds: startSeconds + index / fps,
	}));
	return {
		width,
		height,
		fps,
		frames,
		sourceSha256: sha256({ bytes: sourceBytes }),
		motion: measureSequenceMotion({
			frames: frames.map((frame) => frame.rgba),
		}),
	};
}
