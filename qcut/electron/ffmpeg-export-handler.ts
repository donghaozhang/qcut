/**
 * FFmpeg Export Handler
 *
 * The main export-video-cli IPC handler supporting three export modes:
 * - Mode 1: Direct copy (fast, lossless concat) for sequential videos
 * - Mode 1.5: Video normalization with FFmpeg padding
 * - Mode 2: Direct video with FFmpeg filters for text/stickers/effects
 *
 * Location: electron/ffmpeg-export-handler.ts
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import type { TempManager } from "./temp-manager.js";

import type {
	VideoSource,
	ExportOptions,
	ExportResult,
	FFmpegError,
	FFmpegProgress,
} from "./ffmpeg/types";

import {
	MAX_EXPORT_DURATION,
	debugLog,
	getFFmpegPath,
	parseProgress,
	probeVideoFile,
} from "./ffmpeg/utils";

import { buildFFmpegArgs } from "./ffmpeg-args-builder.js";
import { handleWordFilterCut } from "./ffmpeg-export-word-filter.js";
import { handleMode1_5 } from "./ffmpeg-export-mode15.js";
import { validateAudioInputStreams } from "./ffmpeg/audio-input-validation.js";
import { prepareFFmpegFilterComplexScripts } from "./ffmpeg/filter-complex-script.js";
import { formatFFmpegFailure } from "./ffmpeg/process-error.js";

/**
 * Registers the export-video-cli IPC handler.
 *
 * This is the main video export handler that orchestrates all 3 export modes.
 */
export function setupExportHandler(tempManager: TempManager): void {
	ipcMain.handle(
		"export-video-cli",
		async (
			event: IpcMainInvokeEvent,
			options: ExportOptions
		): Promise<ExportResult> => {
			const {
				sessionId,
				width,
				height,
				fps,
				quality,
				duration,
				audioFiles: requestedAudioFiles = [],
				textFilterChain,
				textAssLayers = [],
				stickerFilterChain,
				stickerSources,
				useDirectCopy = false,
			} = options;

			// Early debug logging to diagnose export issues
			debugLog(
				"🔍 [FFMPEG HANDLER] ============================================"
			);
			debugLog("🔍 [FFMPEG HANDLER] Export options received:");
			debugLog(
				"🔍 [FFMPEG HANDLER]   - stickerFilterChain:",
				stickerFilterChain
					? `present (${stickerFilterChain.length} chars)`
					: "none"
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - stickerSources:",
				stickerSources?.length ?? 0
			);
			debugLog("🔍 [FFMPEG HANDLER]   - sessionId:", sessionId);
			debugLog("🔍 [FFMPEG HANDLER]   - dimensions:", `${width}x${height}`);
			debugLog("🔍 [FFMPEG HANDLER]   - fps:", fps);
			debugLog("🔍 [FFMPEG HANDLER]   - quality:", quality);
			debugLog("🔍 [FFMPEG HANDLER]   - duration:", duration);
			debugLog("🔍 [FFMPEG HANDLER]   - useDirectCopy:", useDirectCopy);
			debugLog("🔍 [FFMPEG HANDLER]   - useVideoInput:", options.useVideoInput);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - videoInputPath:",
				options.videoInputPath
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - videoSources count:",
				options.videoSources?.length || 0
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - optimizationStrategy:",
				options.optimizationStrategy
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - wordFilterSegments count:",
				options.wordFilterSegments?.length || 0
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - filterChain:",
				options.filterChain ? "present" : "none"
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - textFilterChain:",
				textFilterChain ? "present" : "none"
			);
			debugLog(
				"🔍 [FFMPEG HANDLER]   - stickerFilterChain:",
				stickerFilterChain ? "present" : "none"
			);
			if (options.videoSources && options.videoSources.length > 0) {
				debugLog("🔍 [FFMPEG HANDLER] Video sources:");
				for (const [i, v] of options.videoSources.entries()) {
					debugLog(`🔍 [FFMPEG HANDLER]   [${i}] path: ${v.path}`);
					debugLog(
						`🔍 [FFMPEG HANDLER]   [${i}] duration: ${v.duration}, trimStart: ${v.trimStart}, trimEnd: ${v.trimEnd}`
					);
				}
			}
			debugLog(
				"🔍 [FFMPEG HANDLER] ============================================"
			);

			// Validate sticker configuration
			if (
				stickerFilterChain &&
				(!stickerSources || stickerSources.length === 0)
			) {
				throw new Error(
					"Sticker filter chain provided without sticker sources"
				);
			}
			if (
				options.imageFilterChain &&
				(!options.imageSources || options.imageSources.length === 0)
			) {
				throw new Error("Image filter chain provided without image sources");
			}

			// Check if any video has trim values (concat demuxer can't handle per-video trimming)
			const hasTrimmedVideos =
				options.videoSources &&
				options.videoSources.length > 1 &&
				options.videoSources.some(
					(v: VideoSource) =>
						(v.trimStart && v.trimStart > 0) || (v.trimEnd && v.trimEnd > 0)
				);

			if (hasTrimmedVideos) {
				debugLog(
					"[FFmpeg] Trimmed videos detected in multi-video mode - will use Mode 1.5 normalization"
				);
			}

			// Disable direct copy when stickers, text, or trimmed multi-videos are present
			const effectiveUseDirectCopy =
				useDirectCopy &&
				!textFilterChain &&
				textAssLayers.length === 0 &&
				!stickerFilterChain &&
				!options.filterChain &&
				!options.imageFilterChain &&
				!(options.imageSources && options.imageSources.length > 0) &&
				!(options.videoTransitions && options.videoTransitions.length > 0) &&
				!(options.audioCrossfades && options.audioCrossfades.length > 0) &&
				!hasTrimmedVideos;

			// Validate duration to prevent crashes or excessive resource usage
			const validatedDuration = Math.min(
				Math.max(duration || 0.1, 0.1),
				MAX_EXPORT_DURATION
			);
			const audioValidation = await validateAudioInputStreams({
				audioFiles: requestedAudioFiles,
			});
			const audioFiles = audioValidation.audioFiles;
			for (const skippedPath of audioValidation.skippedPaths) {
				debugLog(
					`[FFmpeg] Skipping media without an audio stream: ${skippedPath}`
				);
			}
			for (const unverifiedPath of audioValidation.unverifiedPaths) {
				debugLog(
					`[FFmpeg] Audio stream probe unavailable; retaining input: ${unverifiedPath}`
				);
			}
			const validatedOptions = { ...options, audioFiles };

			return new Promise<ExportResult>((resolve, reject) => {
				// Get session directories
				const frameDir: string = tempManager.getFrameDir(sessionId);
				const outputDir: string = tempManager.getOutputDir(sessionId);
				const outputFile: string = path.join(outputDir, "output.mp4");
				const textAssLayerPaths: Array<{
					path: string;
					blendMode: (typeof textAssLayers)[number]["blendMode"];
					trackOrder?: number;
					elementOrder?: number;
				}> = [];
				if (textAssLayers.length > 0) {
					fs.mkdirSync(frameDir, { recursive: true });
					for (const [index, layer] of textAssLayers.entries()) {
						const layerPath = path.join(frameDir, `text-overlay-${index}.ass`);
						fs.writeFileSync(layerPath, layer.content, "utf8");
						textAssLayerPaths.push({
							path: layerPath,
							blendMode: layer.blendMode,
							trackOrder: layer.trackOrder,
							elementOrder: layer.elementOrder,
						});
					}
				}

				// Construct FFmpeg arguments
				let ffmpegPath: string;
				try {
					ffmpegPath = getFFmpegPath();
				} catch (error: any) {
					reject(error);
					return;
				}

				const buildArgs = () =>
					buildFFmpegArgs({
						inputDir: frameDir,
						outputFile,
						width,
						height,
						fps,
						quality,
						duration: validatedDuration,
						audioFiles,
						audioCrossfades: options.audioCrossfades,
						filterChain: options.filterChain,
						textFilterChain,
						textAssLayers: textAssLayerPaths,
						useDirectCopy: effectiveUseDirectCopy,
						videoSources: options.videoSources,
						videoTransitions: options.videoTransitions,
						stickerFilterChain,
						stickerSources,
						imageFilterChain: options.imageFilterChain,
						imageSources: options.imageSources,
						useVideoInput: options.useVideoInput || false,
						videoInputPath: options.videoInputPath,
						trimStart: options.trimStart,
						trimEnd: options.trimEnd,
						backgroundColor: options.backgroundColor,
					});

				// Mode 1.5 builds its own args; defer until after Mode 1.5 branch when needed
				let args: string[] | null =
					options.optimizationStrategy === "video-normalization"
						? null
						: buildArgs();

				// Use async IIFE to handle validation properly
				(async () => {
					// Debug: Log the optimization strategy received
					console.log(
						`🔍 [FFMPEG HANDLER] Received optimizationStrategy: "${options.optimizationStrategy}"`
					);
					console.log(
						`🔍 [FFMPEG HANDLER] effectiveUseDirectCopy: ${effectiveUseDirectCopy}`
					);
					console.log(
						`🔍 [FFMPEG HANDLER] videoSources count: ${options.videoSources?.length || 0}`
					);
					console.log(
						`🔍 [FFMPEG HANDLER] useVideoInput: ${options.useVideoInput}`
					);

					// =============================================================================
					// MODE 1.5: Video Normalization with FFmpeg Padding
					// =============================================================================
					if (options.optimizationStrategy === "video-normalization") {
						await handleMode1_5(
							validatedOptions,
							ffmpegPath,
							frameDir,
							outputFile,
							width,
							height,
							fps,
							audioFiles,
							event,
							resolve,
							reject
						);
						return;
					}

					if (
						options.wordFilterSegments &&
						options.wordFilterSegments.length > 0
					) {
						await handleWordFilterCut({
							options: validatedOptions,
							ffmpegPath,
							outputFile,
							event,
							resolve,
							reject,
						});
						return;
					}

					// Continue with existing mode validations (Mode 1, 2)
					if (effectiveUseDirectCopy) {
						// MODE 1: Direct copy - validate video sources
						if (!options.videoSources || options.videoSources.length === 0) {
							reject(
								new Error(
									"Direct copy mode requested but no video sources provided."
								)
							);
							return;
						}

						// Validate each video source file exists
						for (const video of options.videoSources) {
							if (!fs.existsSync(video.path)) {
								reject(new Error(`Video source not found: ${video.path}`));
								return;
							}
						}

						// Validate codec compatibility for concat (only if multiple videos)
						if (options.videoSources.length > 1) {
							try {
								const probeResults = await Promise.all(
									options.videoSources.map((video: VideoSource) =>
										probeVideoFile(video.path)
									)
								);

								const reference = probeResults[0];
								for (let i = 1; i < probeResults.length; i++) {
									const current = probeResults[i];

									if (
										reference.codec !== current.codec ||
										reference.width !== current.width ||
										reference.height !== current.height ||
										reference.pix_fmt !== current.pix_fmt ||
										reference.fps !== current.fps
									) {
										reject(
											new Error(
												"Video codec mismatch detected - direct copy requires identical encoding."
											)
										);
										return;
									}
								}
							} catch (probeError: any) {
								reject(
									new Error(
										`Failed to validate video compatibility: ${probeError.message}`
									)
								);
								return;
							}
						}
					} else if (options.useVideoInput && options.videoInputPath) {
						// MODE 2: Direct video input with filters
						console.log(
							"⚡ [MODE 2 VALIDATION] Validating video input file..."
						);

						if (!fs.existsSync(options.videoInputPath)) {
							reject(
								new Error(
									`Mode 2 video input not found: ${options.videoInputPath}`
								)
							);
							return;
						}

						console.log(
							"⚡ [MODE 2 VALIDATION] ✅ Video file validated successfully"
						);
					}

					// Build args if we haven't built yet (Mode 1 or Mode 2)
					if (!args) {
						args = buildArgs();
					}

					// Ensure output directory exists
					const outputDirPath: string = path.dirname(outputFile);
					if (!fs.existsSync(outputDirPath)) {
						fs.mkdirSync(outputDirPath, { recursive: true });
					}

					// Try to run FFmpeg directly
					let cleanupFilterScripts: () => Promise<boolean> = async () => true;
					const cleanupFilterScriptsSafely = async (): Promise<void> => {
						try {
							await cleanupFilterScripts();
						} catch (error) {
							console.warn("[FFmpeg] Filter script cleanup failed", error);
						}
					};
					try {
						const preparedFilterScripts = prepareFFmpegFilterComplexScripts({
							args,
							temporaryDirectory: outputDirPath,
						});
						cleanupFilterScripts = preparedFilterScripts.cleanup;
						const ffmpegProc: ChildProcess = spawn(
							ffmpegPath,
							preparedFilterScripts.args,
							{
								windowsHide: true,
								stdio: ["ignore", "pipe", "pipe"],
							}
						);

						let stderrOutput = "";
						let stdoutOutput = "";

						ffmpegProc.stdout?.on("data", (chunk: Buffer) => {
							stdoutOutput += chunk.toString();
						});

						ffmpegProc.stderr?.on("data", (chunk: Buffer) => {
							const text: string = chunk.toString();
							stderrOutput += text;

							const progress: FFmpegProgress | null = parseProgress(text);
							if (progress) {
								event.sender?.send?.("ffmpeg-progress", progress);
							}
						});

						ffmpegProc.on("error", async (err: Error) => {
							await cleanupFilterScriptsSafely();
							reject(err);
						});

						ffmpegProc.on(
							"close",
							async (code: number | null, signal: string | null) => {
								await cleanupFilterScriptsSafely();
								if (code === 0) {
									resolve({
										success: true,
										outputFile,
										method: "spawn",
									});
								} else {
									const error: FFmpegError = new Error(
										formatFFmpegFailure({ code, stderr: stderrOutput })
									) as FFmpegError;
									error.code = code || undefined;
									error.signal = signal || undefined;
									error.stderr = stderrOutput;
									error.stdout = stdoutOutput;
									reject(error);
								}
							}
						);

						return;
					} catch {
						await cleanupFilterScriptsSafely();
						// Direct spawn failed
					}

					// Fallback: Manual export instructions
					const inputPattern: string = path.join(frameDir, "frame-%04d.png");
					reject(
						new Error(
							`FFmpeg process spawning restricted. Please run manually:\n\nffmpeg -y -framerate 30 -i "${inputPattern}" -c:v libx264 -preset fast -crf 23 -t 5 -pix_fmt yuv420p "${outputFile}"`
						)
					);
				})().catch(reject);
			});
		}
	);
}
