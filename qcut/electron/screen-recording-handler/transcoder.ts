import { spawn } from "node:child_process";
import { getFFmpegPath } from "../ffmpeg/utils.js";
import {
	SCREEN_RECORDING_OUTPUT_FORMAT,
	FILE_EXTENSION,
	type ActiveScreenRecordingSession,
} from "./types.js";
import { log } from "./logger.js";
import { replaceExtension } from "./path-utils.js";
import { removeFileIfExists, moveFile } from "./file-ops.js";

export async function transcodeWebmToMp4({
	inputPath,
	outputPath,
}: {
	inputPath: string;
	outputPath: string;
}): Promise<void> {
	try {
		const ffmpegPath = getFFmpegPath();
		const args = [
			"-y",
			"-i",
			inputPath,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-b:v",
			"4M",
			"-minrate",
			"2M",
			"-maxrate",
			"8M",
			"-bufsize",
			"4M",
			"-pix_fmt",
			"yuv420p",
			"-r",
			"30",
			"-vsync",
			"cfr",
			"-movflags",
			"+faststart",
			outputPath,
		];

		await new Promise<void>((resolve, reject) => {
			try {
				const ffmpegProcess = spawn(ffmpegPath, args, {
					stdio: ["ignore", "ignore", "pipe"],
					windowsHide: true,
				});

				/** Reduced from 300s — FFmpeg transcoding (libx264 veryfast) typically takes <60s for short recordings. */
				const TRANSCODE_TIMEOUT_MS = 60_000;
				const timeout = setTimeout(() => {
					ffmpegProcess.kill();
					reject(
						new Error(
							`FFmpeg conversion timed out after ${TRANSCODE_TIMEOUT_MS}ms`
						)
					);
				}, TRANSCODE_TIMEOUT_MS);

				let stderrOutput = "";

				ffmpegProcess.stderr?.on("data", (chunk: Buffer) => {
					stderrOutput += chunk.toString();
				});

				ffmpegProcess.on("error", (error) => {
					clearTimeout(timeout);
					reject(
						new Error(
							`Failed to start FFmpeg process: ${error instanceof Error ? error.message : String(error)}`
						)
					);
				});

				ffmpegProcess.on("close", (code) => {
					clearTimeout(timeout);
					if (code === 0) {
						resolve();
						return;
					}
					reject(
						new Error(
							`FFmpeg conversion failed with code ${String(code)}: ${stderrOutput.trim() || "unknown error"}`
						)
					);
				});
			} catch (error: unknown) {
				reject(
					new Error(
						`Failed to configure FFmpeg process: ${error instanceof Error ? error.message : String(error)}`
					)
				);
			}
		});
	} catch (error: unknown) {
		throw new Error(
			`Failed to transcode recording to MP4: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

export async function finalizeRecordingOutput({
	sessionData,
}: {
	sessionData: ActiveScreenRecordingSession;
}): Promise<string> {
	try {
		if (sessionData.outputFormat === SCREEN_RECORDING_OUTPUT_FORMAT.WEBM) {
			return sessionData.captureFilePath;
		}

		await transcodeWebmToMp4({
			inputPath: sessionData.captureFilePath,
			outputPath: sessionData.filePath,
		});
		await removeFileIfExists({ filePath: sessionData.captureFilePath });
		return sessionData.filePath;
	} catch (error: unknown) {
		const fallbackWebmPath = replaceExtension({
			filePath: sessionData.filePath,
			extension: FILE_EXTENSION.WEBM,
		});

		try {
			await moveFile({
				sourcePath: sessionData.captureFilePath,
				targetPath: fallbackWebmPath,
			});
			log.warn(
				"[ScreenRecordingIPC] MP4 conversion failed, falling back to WebM:",
				error
			);
			return fallbackWebmPath;
		} catch (fallbackError: unknown) {
			throw new Error(
				`Failed to finalize recording output: ${error instanceof Error ? error.message : String(error)}; fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
			);
		}
	}
}

export async function cleanupSessionFiles({
	sessionData,
}: {
	sessionData: ActiveScreenRecordingSession;
}): Promise<void> {
	try {
		await removeFileIfExists({ filePath: sessionData.captureFilePath });
		if (sessionData.filePath !== sessionData.captureFilePath) {
			await removeFileIfExists({ filePath: sessionData.filePath });
		}
	} catch {
		// best-effort cleanup
	}
}
