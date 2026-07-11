/**
 * FFmpeg Utility IPC Handlers
 *
 * Handlers for filter validation, frame processing, audio extraction,
 * and sticker export operations.
 *
 * Location: electron/ffmpeg-utility-handlers.ts
 */

import { ipcMain, app, type IpcMainInvokeEvent } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import type { TempManager } from "./temp-manager.js";

import type {
	FrameProcessOptions,
	ExtractAudioOptions,
	ExtractAudioResult,
	AudioExportOptions,
	AudioExportResult,
	GifConversionOptions,
} from "./ffmpeg/types";

import { getFFmpegPath } from "./ffmpeg/utils";
import { buildStandaloneAudioExportArgs } from "./ffmpeg/audio-export-args";
import { convertToGif } from "./claude/handlers/claude-export-handler/gif-convert.js";

/**
 * Registers utility FFmpeg IPC handlers.
 *
 * Handles: validate-filter-chain, processFrame, extract-audio,
 * save-sticker-for-export
 */
export function setupUtilityHandlers(tempManager: TempManager): void {
	ipcMain.handle(
		"export-audio-cli",
		async (
			_event: IpcMainInvokeEvent,
			options: AudioExportOptions
		): Promise<AudioExportResult> => {
			const supportedBitrates = new Set([128, 192, 256, 320]);
			const supportedSampleRates = new Set([44_100, 48_000]);
			if (!supportedBitrates.has(options.bitrate)) {
				throw new Error("Audio bitrate must be 128, 192, 256, or 320 kbps");
			}
			if (!supportedSampleRates.has(options.sampleRate)) {
				throw new Error("Audio sample rate must be 44100 or 48000 Hz");
			}
			if (!Number.isFinite(options.duration) || options.duration <= 0) {
				throw new Error("Audio export duration must be greater than zero");
			}
			if (
				!Array.isArray(options.audioFiles) ||
				options.audioFiles.length === 0
			) {
				throw new Error("No audio sources are available for export");
			}

			for (const audioFile of options.audioFiles) {
				if (!fs.existsSync(audioFile.path)) {
					throw new Error(`Audio source not found: ${audioFile.path}`);
				}
			}

			await fs.promises.mkdir(path.dirname(options.outputPath), {
				recursive: true,
			});
			const args = buildStandaloneAudioExportArgs({ options });

			await new Promise<void>((resolve, reject) => {
				const ffmpeg = spawn(getFFmpegPath(), args, {
					windowsHide: true,
					stdio: ["ignore", "pipe", "pipe"],
				});
				let stderr = "";
				ffmpeg.stderr?.on("data", (data) => {
					stderr += data.toString();
				});
				ffmpeg.on("error", reject);
				ffmpeg.on("close", (code) => {
					if (code === 0) resolve();
					else
						reject(
							new Error(
								`FFmpeg audio export failed (${code}): ${stderr.slice(-800)}`
							)
						);
				});
			});

			const stats = await fs.promises.stat(options.outputPath);
			return { outputPath: options.outputPath, fileSize: stats.size };
		}
	);

	ipcMain.handle(
		"convert-video-to-gif",
		async (
			_event: IpcMainInvokeEvent,
			options: GifConversionOptions
		): Promise<{ outputPath: string; fileSize: number }> => {
			const outputDir = tempManager.getOutputDir(options.sessionId);
			const resolvedInput = path.resolve(options.inputPath);
			if (!resolvedInput.startsWith(path.resolve(outputDir))) {
				throw new Error("GIF input must be inside the active export session");
			}
			const outputPath = path.join(outputDir, "output.gif");
			await convertToGif({
				inputPath: resolvedInput,
				outputPath,
				width: options.width,
				height: options.height,
				fps: options.fps,
				loop: options.loop,
				quality: options.quality,
				tempDir: outputDir,
			});
			const stats = await fs.promises.stat(outputPath);
			return { outputPath, fileSize: stats.size };
		}
	);

	// Validate filter chain
	ipcMain.handle(
		"validate-filter-chain",
		async (
			event: IpcMainInvokeEvent,
			filterChain: string
		): Promise<boolean> => {
			try {
				const ffmpegPath = getFFmpegPath();

				const result = await new Promise<boolean>((resolve) => {
					const ffmpeg = spawn(
						ffmpegPath,
						[
							"-f",
							"lavfi",
							"-i",
							"testsrc2=duration=0.1:size=32x32:rate=1",
							"-vf",
							filterChain,
							"-f",
							"null",
							"-",
						],
						{
							windowsHide: true,
							stdio: ["ignore", "pipe", "pipe"],
						}
					);

					let settled = false;
					const finish = (ok: boolean) => {
						if (settled) return;
						settled = true;
						clearTimeout(timer);
						resolve(ok);
					};

					ffmpeg.on("close", (code) => {
						finish(code === 0);
					});

					ffmpeg.on("error", () => {
						finish(false);
					});

					const timer = setTimeout(() => {
						ffmpeg.kill();
						finish(false);
					}, 5000);
				});

				return result;
			} catch {
				return false;
			}
		}
	);

	// Process single frame through FFmpeg filter
	ipcMain.handle(
		"processFrame",
		async (
			event: IpcMainInvokeEvent,
			{
				sessionId,
				inputFrameName,
				outputFrameName,
				filterChain,
			}: FrameProcessOptions
		): Promise<void> => {
			const frameDir: string = tempManager.getFrameDir(sessionId);
			const inputPath: string = path.join(frameDir, inputFrameName);
			const outputPath: string = path.join(frameDir, outputFrameName);

			if (!fs.existsSync(inputPath)) {
				throw new Error(`Input frame not found: ${inputPath}`);
			}

			const ffmpegPath = getFFmpegPath();

			return new Promise<void>((resolve, reject) => {
				const ffmpeg = spawn(
					ffmpegPath,
					["-i", inputPath, "-vf", filterChain, "-y", outputPath],
					{
						windowsHide: true,
						stdio: ["ignore", "pipe", "pipe"],
					}
				);

				let stderr = "";
				let settled = false;

				const timer = setTimeout(() => {
					if (!settled) {
						settled = true;
						ffmpeg.kill();
						reject(new Error("Frame processing timeout"));
					}
				}, 10_000);

				ffmpeg.stderr?.on("data", (data) => {
					stderr += data.toString();
				});

				ffmpeg.on("close", (code) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					if (code === 0) {
						resolve();
					} else {
						reject(
							new Error(
								`FFmpeg frame processing failed with code ${code}: ${stderr}`
							)
						);
					}
				});

				ffmpeg.on("error", (err) => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					reject(err);
				});
			});
		}
	);

	// Extract audio from video using FFmpeg CLI
	ipcMain.handle(
		"extract-audio",
		async (
			event: IpcMainInvokeEvent,
			{ videoPath, format = "wav" }: ExtractAudioOptions
		): Promise<ExtractAudioResult> => {
			if (!fs.existsSync(videoPath)) {
				throw new Error(`Video file not found: ${videoPath}`);
			}

			const ffmpegPath = getFFmpegPath();

			const tempDir = path.join(app.getPath("temp"), "qcut-audio-extraction");
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			const timestamp = Date.now();
			const outputFileName = `audio-${timestamp}.${format}`;
			const outputPath = path.join(tempDir, outputFileName);

			return new Promise<ExtractAudioResult>((resolve, reject) => {
				// Choose codec and bitrate based on format
				// Use low bitrate for transcription - quality doesn't need to be high
				let codecArgs: string[];
				if (format === "mp3") {
					// MP3: use libmp3lame with low bitrate for speech transcription
					// 32kbps mono at 16kHz is sufficient for speech recognition
					codecArgs = [
						"-acodec",
						"libmp3lame",
						"-ab",
						"32k",
						"-ar",
						"16000",
						"-ac",
						"1",
					];
				} else if (format === "aac" || format === "m4a") {
					// AAC: low bitrate for speech
					codecArgs = [
						"-acodec",
						"aac",
						"-ab",
						"32k",
						"-ar",
						"16000",
						"-ac",
						"1",
					];
				} else {
					// WAV/default: uncompressed PCM
					codecArgs = ["-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1"];
				}

				const args = ["-i", videoPath, "-vn", ...codecArgs, "-y", outputPath];

				const ffmpeg = spawn(ffmpegPath, args, {
					windowsHide: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let stderr = "";

				ffmpeg.stderr?.on("data", (data) => {
					stderr += data.toString();
				});

				ffmpeg.on("close", (code) => {
					if (code === 0) {
						if (!fs.existsSync(outputPath)) {
							reject(new Error("FFmpeg completed but output file not found"));
							return;
						}

						const stats = fs.statSync(outputPath);

						resolve({
							audioPath: outputPath,
							fileSize: stats.size,
						});
					} else {
						reject(
							new Error(
								`FFmpeg audio extraction failed with code ${code}: ${stderr}`
							)
						);
					}
				});

				ffmpeg.on("error", (err) => {
					reject(err);
				});

				setTimeout(() => {
					ffmpeg.kill();
					reject(new Error("Audio extraction timeout (2 minutes)"));
				}, 120_000);
			});
		}
	);

	// Save sticker image for export
	ipcMain.handle(
		"save-sticker-for-export",
		async (
			event: IpcMainInvokeEvent,
			{
				sessionId,
				stickerId,
				imageData,
				format = "png",
			}: {
				sessionId: string;
				stickerId: string;
				imageData: Uint8Array;
				format?: string;
			}
		): Promise<{ success: boolean; path?: string; error?: string }> => {
			try {
				// Sanitize inputs to prevent path traversal
				const safeStickerId = path.basename(stickerId);
				const safeFormat = path.basename(format);
				const stickerDir = path.join(
					tempManager.getFrameDir(sessionId),
					"stickers"
				);

				if (!fs.existsSync(stickerDir)) {
					await fs.promises.mkdir(stickerDir, { recursive: true });
				}

				const filename = `sticker_${safeStickerId}.${safeFormat}`;
				const stickerPath = path.join(stickerDir, filename);

				// Verify resolved path stays within session directory
				const resolvedPath = path.resolve(stickerPath);
				if (!resolvedPath.startsWith(path.resolve(stickerDir))) {
					throw new Error("Invalid sticker path: path traversal detected");
				}

				const buffer = Buffer.from(imageData);
				await fs.promises.writeFile(stickerPath, buffer);

				console.log(
					`[FFmpeg] Saved sticker ${stickerId} to: ${stickerPath} (${buffer.length} bytes)`
				);

				return {
					success: true,
					path: stickerPath,
				};
			} catch (error: any) {
				console.error(`[FFmpeg] Failed to save sticker ${stickerId}:`, error);
				return {
					success: false,
					error: error.message,
				};
			}
		}
	);
}
