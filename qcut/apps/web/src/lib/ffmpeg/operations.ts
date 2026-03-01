/**
 * FFmpeg Video Processing Operations
 *
 * High-level operations: thumbnail generation, trimming, info extraction,
 * format conversion, audio extraction, and cleanup.
 */

import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import { handleMediaProcessingError } from "@/lib/debug/error-handler";
import { createObjectURL } from "@/lib/media/blob-manager";
import {
	getFFmpegState,
	setFFmpegState,
	getCleanupTimer,
	setCleanupTimer,
} from "./ffmpeg-state";
import { updateLastUsed } from "./lifecycle";
import { initFFmpeg } from "./init";

/**
 * Generates a thumbnail image from a video file at a specific time
 */
export const generateThumbnail = async (
	videoFile: File,
	timeInSeconds = 1
): Promise<string> => {
	debugLog("[FFmpeg] generateThumbnail called");
	const ffmpeg = await initFFmpeg();
	debugLog("[FFmpeg] FFmpeg initialized for thumbnail generation");

	const inputName = "input.mp4";
	const outputName = "thumbnail.jpg";

	try {
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(
				() =>
					reject(new Error("[FFmpeg] Thumbnail generation timeout after 10s")),
				10_000
			)
		);

		await ffmpeg.writeFile(
			inputName,
			new Uint8Array(await videoFile.arrayBuffer())
		);

		debugLog("[FFmpeg] Starting thumbnail generation...");

		await Promise.race([
			ffmpeg.exec([
				"-i",
				inputName,
				"-ss",
				timeInSeconds.toString(),
				"-vframes",
				"1",
				"-vf",
				"scale=320:240",
				"-q:v",
				"2",
				outputName,
			]),
			timeoutPromise,
		]);

		debugLog("[FFmpeg] Thumbnail generation completed");

		const data = await ffmpeg.readFile(outputName);
		const blob = new Blob([data as unknown as ArrayBuffer], {
			type: "image/jpeg",
		});

		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);

		updateLastUsed();
		return createObjectURL(blob, "ffmpeg:thumbnail");
	} catch (error) {
		handleMediaProcessingError(error, "Generate thumbnail", {
			videoFile: videoFile.name,
			timeInSeconds,
		});

		try {
			await ffmpeg.deleteFile(inputName);
		} catch {}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch {}

		throw error;
	}
};

/**
 * Trims a video file to a specific time range
 */
export const trimVideo = async (
	videoFile: File,
	startTime: number,
	endTime: number,
	onProgress?: (progress: number) => void
): Promise<Blob> => {
	const ffmpeg = await initFFmpeg();

	const inputName = "input.mp4";
	const outputName = "output.mp4";

	let progressHandler: undefined | ((e: { progress: number }) => void);
	if (onProgress) {
		progressHandler = ({ progress }: { progress: number }) => {
			onProgress(progress * 100);
		};
		(ffmpeg as any).on("progress", progressHandler);
	}

	try {
		await ffmpeg.writeFile(
			inputName,
			new Uint8Array(await videoFile.arrayBuffer())
		);

		const duration = endTime - startTime;

		await ffmpeg.exec([
			"-i",
			inputName,
			"-ss",
			startTime.toString(),
			"-t",
			duration.toString(),
			"-c",
			"copy",
			outputName,
		]);

		const data = await ffmpeg.readFile(outputName);
		const blob = new Blob([data as unknown as ArrayBuffer], {
			type: "video/mp4",
		});

		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);

		if (progressHandler) (ffmpeg as any).off?.("progress", progressHandler);

		updateLastUsed();
		return blob;
	} catch (error) {
		if (progressHandler) (ffmpeg as any).off?.("progress", progressHandler);

		handleMediaProcessingError(error, "Trim video", {
			videoFile: videoFile.name,
			startTime,
			endTime,
		});

		try {
			await ffmpeg.deleteFile(inputName);
		} catch {}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch {}

		throw error;
	}
};

/**
 * Extracts metadata information from a video file
 */
export const getVideoInfo = async (
	videoFile: File
): Promise<{
	duration: number;
	width: number;
	height: number;
	fps: number;
}> => {
	const ffmpeg = await initFFmpeg();

	const inputName = "input.mp4";

	await ffmpeg.writeFile(
		inputName,
		new Uint8Array(await videoFile.arrayBuffer())
	);

	let ffmpegOutput = "";
	let listening = true;
	const logHandler = ({ message }: { message: string }) => {
		if (listening) ffmpegOutput += message;
	};
	(ffmpeg as any).on("log", logHandler);

	try {
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(
				() =>
					reject(new Error("[FFmpeg] Video info extraction timeout after 5s")),
				5000
			)
		);

		await Promise.race([
			ffmpeg.exec(["-i", inputName, "-f", "null", "-"]),
			timeoutPromise,
		]);
	} catch (error) {
		listening = false;
		await ffmpeg.deleteFile(inputName);
		handleMediaProcessingError(error, "Extract video info", {
			videoFile: videoFile.name,
			fileSize: videoFile.size,
		});
		throw new Error(
			"Failed to extract video info. The file may be corrupted or in an unsupported format."
		);
	}

	listening = false;
	await ffmpeg.deleteFile(inputName);

	const durationMatch = ffmpegOutput.match(/Duration: (\d+):(\d+):([\d.]+)/);
	let duration = 0;
	if (durationMatch) {
		const [, h, m, s] = durationMatch;
		duration = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
	}

	const videoStreamMatch = ffmpegOutput.match(
		/Video:.* (\d+)x(\d+)[^,]*, ([\d.]+) fps/
	);
	let width = 0,
		height = 0,
		fps = 0;
	if (videoStreamMatch) {
		width = parseInt(videoStreamMatch[1], 10);
		height = parseInt(videoStreamMatch[2], 10);
		fps = parseFloat(videoStreamMatch[3]);
	}

	updateLastUsed();

	(ffmpeg as any).off?.("log", logHandler);

	return {
		duration,
		width,
		height,
		fps,
	};
};

/**
 * Converts a video file to WebM format using VP9 and Opus codecs
 */
export const convertToWebM = async (
	videoFile: File,
	onProgress?: (progress: number) => void
): Promise<Blob> => {
	const ffmpeg = await initFFmpeg();

	const inputName = "input.mp4";
	const outputName = "output.webm";

	let progressHandler: undefined | ((e: { progress: number }) => void);
	if (onProgress) {
		progressHandler = ({ progress }: { progress: number }) => {
			onProgress(progress * 100);
		};
		(ffmpeg as any).on("progress", progressHandler);
	}

	try {
		await ffmpeg.writeFile(
			inputName,
			new Uint8Array(await videoFile.arrayBuffer())
		);

		await ffmpeg.exec([
			"-i",
			inputName,
			"-c:v",
			"libvpx-vp9",
			"-crf",
			"30",
			"-b:v",
			"0",
			"-c:a",
			"libopus",
			outputName,
		]);

		const data = await ffmpeg.readFile(outputName);
		const blob = new Blob([data as unknown as ArrayBuffer], {
			type: "video/webm",
		});

		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);

		if (progressHandler) (ffmpeg as any).off?.("progress", progressHandler);

		updateLastUsed();
		return blob;
	} catch (error) {
		if (progressHandler) (ffmpeg as any).off?.("progress", progressHandler);

		handleMediaProcessingError(error, "Convert to WebM", {
			videoFile: videoFile.name,
		});

		try {
			await ffmpeg.deleteFile(inputName);
		} catch {}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch {}

		throw error;
	}
};

/**
 * Extracts audio from a video file and saves it in the specified format
 */
export const extractAudio = async (
	videoFile: File,
	format: "mp3" | "wav" = "mp3"
): Promise<Blob> => {
	const ffmpeg = await initFFmpeg();

	const ext = videoFile.name.split(".").pop()?.toLowerCase() ?? "mp4";
	const supportedExtensions = ["mp4", "webm", "mov", "avi", "mkv"];

	if (!supportedExtensions.includes(ext)) {
		throw new Error(`Unsupported video format: .${ext}`);
	}

	const inputName = `input.${ext}`;
	const outputName = `output.${format}`;

	try {
		await ffmpeg.writeFile(
			inputName,
			new Uint8Array(await videoFile.arrayBuffer())
		);

		await ffmpeg.exec([
			"-i",
			inputName,
			"-vn",
			"-acodec",
			format === "mp3" ? "libmp3lame" : "pcm_s16le",
			outputName,
		]);

		const data = await ffmpeg.readFile(outputName);
		const blob = new Blob([data as unknown as ArrayBuffer], {
			type: `audio/${format}`,
		});

		await ffmpeg.deleteFile(inputName);
		await ffmpeg.deleteFile(outputName);

		updateLastUsed();
		return blob;
	} catch (error) {
		handleMediaProcessingError(error, "Extract audio", {
			videoFile: videoFile.name,
			format,
		});

		try {
			await ffmpeg.deleteFile(inputName);
		} catch {}
		try {
			await ffmpeg.deleteFile(outputName);
		} catch {}

		throw error;
	}
};

/**
 * Terminates the FFmpeg instance and cleans up resources
 */
export const terminateFFmpeg = async (): Promise<void> => {
	const { ffmpeg, isFFmpegLoaded } = getFFmpegState();
	if (!ffmpeg || !isFFmpegLoaded) return;

	try {
		if (typeof ffmpeg.terminate === "function") {
			await ffmpeg.terminate();
			debugLog("[FFmpeg Utils] ✅ FFmpeg terminated successfully");
		}
	} catch (error) {
		debugWarn("[FFmpeg Utils] ⚠️ Error terminating FFmpeg:", error);
	} finally {
		setFFmpegState({ ffmpeg: null, isFFmpegLoaded: false });
		const timer = getCleanupTimer();
		if (timer) {
			clearTimeout(timer);
			setCleanupTimer(null);
		}
	}
};

/**
 * Forces immediate cleanup of FFmpeg resources
 */
export const forceFFmpegCleanup = async (): Promise<void> => {
	const { ffmpeg } = getFFmpegState();
	if (ffmpeg) {
		debugLog("[FFmpeg Utils] 🧹 Force cleaning FFmpeg instance");
		await terminateFFmpeg();
	}
};
