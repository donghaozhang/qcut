/**
 * Export engine — settings resolution, segment collection, FFmpeg execution.
 * @module electron/claude/handlers/claude-export-handler/export-engine
 */

import { app } from "electron";
import { spawn } from "node:child_process";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getFFmpegPath, parseProgress } from "../../../ffmpeg/utils.js";
import { claudeLog } from "../../utils/logger.js";
import { logOperation } from "../../claude-operation-log.js";
import { emitClaudeEvent } from "../claude-events-handler.js";
import { getMediaPath, getMediaType } from "../../utils/helpers.js";
import type {
	ClaudeTimeline,
	ClaudeElement,
	ExportJobRequest,
	MediaFile,
} from "../../../types/claude-api";
import {
	CLAUDE_EDITOR_EVENT_ACTION,
	CLAUDE_EDITOR_EVENT_CATEGORY,
} from "../../../types/claude-api.js";
import {
	HANDLER_NAME,
	EXPORT_JOB_STATUS,
	type ExportSegment,
	type StickerOverlay,
	type ResolvedExportSettings,
	type ExportJobInternal,
} from "./types.js";
import { findPresetById } from "./presets.js";
import {
	parseBitrateForKbps,
	parseTimecodeToSeconds,
	clampProgress,
	getDefaultOutputPath,
} from "./utils.js";
import { updateJobProgress, exportJobs } from "./job-manager.js";
import { convertToGif } from "./gif-convert.js";
import {
	shouldCompositeCursor,
	compositeCursorOnSegments,
} from "./cursor-composite.js";

export function resolveExportSettings({
	request,
}: {
	request: ExportJobRequest;
}): ResolvedExportSettings {
	try {
		const requestedPresetId = request.preset?.trim() || "youtube-1080p";
		const preset = findPresetById({ presetId: requestedPresetId });
		if (!preset) {
			throw new Error(`Invalid preset ID: ${requestedPresetId}`);
		}

		const s = request.settings;
		const top = request as Record<string, unknown>;

		const format =
			s?.format ??
			(typeof top.format === "string" ? top.format : preset.format);

		// GIF exports use libx264 for the intermediary MP4, then convert
		const codec =
			s?.codec ?? (typeof top.codec === "string" ? top.codec : "libx264");

		const rawGifLoop =
			(s as Record<string, unknown> | undefined)?.gifLoop ?? top.gifLoop;
		const gifLoop = typeof rawGifLoop === "boolean" ? rawGifLoop : undefined;

		// GIF config from request body
		const gifConfig = request.gifConfig;
		const resolvedGifLoop =
			gifLoop ??
			(typeof gifConfig?.loop === "boolean" ? gifConfig.loop : undefined);
		const resolvedFps =
			s?.fps ??
			(typeof top.fps === "number" ? top.fps : undefined) ??
			(format === "gif" && typeof gifConfig?.frameRate === "number"
				? gifConfig.frameRate
				: preset.fps);

		return {
			presetId: preset.id,
			width:
				s?.width ?? (typeof top.width === "number" ? top.width : preset.width),
			height:
				s?.height ??
				(typeof top.height === "number" ? top.height : preset.height),
			fps: resolvedFps,
			format,
			codec,
			bitrate:
				s?.bitrate ??
				(typeof top.bitrate === "string" ? top.bitrate : preset.bitrate),
			gifLoop: resolvedGifLoop,
			gifQuality:
				typeof gifConfig?.quality === "number" ? gifConfig.quality : undefined,

			// Pass through enhancement configs
			cursorConfig: request.cursorConfig,
			audioConfig: request.audioConfig,
			zoomConfig: request.zoomConfig,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Failed to resolve export settings");
	}
}

/** Look up the media file for a timeline element by ID or filename. */
function findMediaForElement({
	element,
	mediaById,
	mediaByName,
}: {
	element: ClaudeElement;
	mediaById: Map<string, MediaFile>;
	mediaByName: Map<string, MediaFile>;
}): MediaFile | null {
	if (element.sourceId) {
		const byId = mediaById.get(element.sourceId);
		if (byId) return byId;
	}

	if (element.sourceName) {
		const byName = mediaByName.get(element.sourceName);
		if (byName) return byName;
	}

	if (element.sourceId?.startsWith("media_")) {
		try {
			const encoded = element.sourceId.slice("media_".length);
			const decoded = Buffer.from(encoded, "base64url").toString("utf8");
			if (decoded) {
				const byDecoded = mediaByName.get(decoded);
				if (byDecoded) return byDecoded;
			}
		} catch {
			// Not a valid base64url — ignore
		}
	}

	return null;
}

/**
 * Disk-based fallback: scan project media directories for a file matching sourceName.
 * Checks media/ and media/imported/ directories. For symlinks, also checks
 * the symlink target's basename to match against original filenames.
 */
async function resolveMediaFromDisk({
	projectId,
	sourceName,
}: {
	projectId: string;
	sourceName: string;
}): Promise<MediaFile | null> {
	const mediaPath = getMediaPath(projectId);
	const dirsToScan = [mediaPath, path.join(mediaPath, "imported")];

	for (const dirPath of dirsToScan) {
		let dirEntries: import("fs").Dirent[];
		try {
			dirEntries = await fsPromises.readdir(dirPath, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of dirEntries) {
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;

			const entryName = String(entry.name);
			const filePath = path.join(dirPath, entryName);

			// Check direct filename match
			let matched = entryName === sourceName;

			// For symlinks, also check the target's basename
			if (!matched && entry.isSymbolicLink()) {
				try {
					const target = await fsPromises.readlink(filePath);
					const targetBasename = path.basename(String(target));
					matched = targetBasename === sourceName;
				} catch {
					// Can't read symlink target
				}
			}

			if (!matched) continue;

			// Validate file exists (follows symlinks)
			try {
				const stat = await fsPromises.stat(filePath);
				// Use sourceName extension as fallback for extensionless symlinks
				const ext = path.extname(entryName) || path.extname(sourceName);
				const type = getMediaType(ext);
				if (!type) continue;

				return {
					id: `media_${Buffer.from(entryName).toString("base64url")}`,
					name: sourceName,
					type,
					path: filePath,
					size: stat.size,
					createdAt: stat.birthtimeMs,
					modifiedAt: stat.mtimeMs,
				};
			} catch {}
		}
	}

	return null;
}

/** Collect trimmed export segments from timeline elements and their media files. */
export async function collectExportSegments({
	timeline,
	mediaFiles,
	projectId,
}: {
	timeline: ClaudeTimeline;
	mediaFiles: MediaFile[];
	projectId?: string;
}): Promise<ExportSegment[]> {
	try {
		const mediaById = new Map<string, MediaFile>();
		const mediaByName = new Map<string, MediaFile>();
		for (const mediaFile of mediaFiles) {
			mediaById.set(mediaFile.id, mediaFile);
			mediaByName.set(mediaFile.name, mediaFile);
		}

		const segments: ExportSegment[] = [];
		const diskFallbackCache = new Map<string, MediaFile | null>();

		for (const track of timeline.tracks) {
			for (const element of track.elements) {
				if (
					!(
						element.type === "media" ||
						element.type === "video" ||
						element.type === "image"
					)
				) {
					continue;
				}

				let media = findMediaForElement({ element, mediaById, mediaByName });

				// Disk-based fallback: if media library lookup failed and we have
				// a projectId + sourceName, try resolving directly from disk
				if (!media && projectId && element.sourceName) {
					if (diskFallbackCache.has(element.sourceName)) {
						media = diskFallbackCache.get(element.sourceName) ?? null;
					} else {
						claudeLog.info(
							HANDLER_NAME,
							`Media library lookup failed for "${element.sourceName}", trying disk fallback`
						);
						media = await resolveMediaFromDisk({
							projectId,
							sourceName: element.sourceName,
						});
						diskFallbackCache.set(element.sourceName, media);
						if (media) {
							claudeLog.info(
								HANDLER_NAME,
								`Disk fallback resolved "${element.sourceName}" → ${media.path}`
							);
						}
					}
				}

				if (!media || (media.type !== "video" && media.type !== "image")) {
					continue;
				}

				const durationFromElement =
					typeof element.duration === "number" && element.duration > 0
						? element.duration
						: element.endTime - element.startTime;

				if (!Number.isFinite(durationFromElement) || durationFromElement <= 0) {
					continue;
				}

				segments.push({
					sourcePath: media.path,
					startTime: element.startTime,
					duration: durationFromElement,
					sourceId: media.id,
					isImage: media.type === "image",
				});
			}
		}

		segments.sort((a, b) => a.startTime - b.startTime);
		return segments;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to collect export segments:", error);
		return [];
	}
}

/**
 * Collect sticker overlay data from the timeline for compositing during export.
 * Resolves each sticker element's media file path and extracts positioning info.
 */
export async function collectStickerOverlays({
	timeline,
	mediaFiles,
	projectId,
}: {
	timeline: ClaudeTimeline;
	mediaFiles: MediaFile[];
	projectId?: string;
}): Promise<StickerOverlay[]> {
	try {
		const mediaById = new Map<string, MediaFile>();
		const mediaByName = new Map<string, MediaFile>();
		for (const mf of mediaFiles) {
			mediaById.set(mf.id, mf);
			mediaByName.set(mf.name, mf);
		}

		const overlays: StickerOverlay[] = [];
		const diskFallbackCache = new Map<string, MediaFile | null>();

		for (const track of timeline.tracks) {
			for (const element of track.elements) {
				if (element.type !== "sticker") continue;

				// Resolve the sticker image file
				let media = findMediaForElement({ element, mediaById, mediaByName });

				if (!media && projectId && element.sourceName) {
					if (diskFallbackCache.has(element.sourceName)) {
						media = diskFallbackCache.get(element.sourceName) ?? null;
					} else {
						media = await resolveMediaFromDisk({
							projectId,
							sourceName: element.sourceName,
						});
						diskFallbackCache.set(element.sourceName, media);
					}
				}

				// Also try mediaId-based lookup directly on disk
				if (!media && projectId && element.mediaId) {
					const mediaById2 = mediaById.get(element.mediaId);
					if (mediaById2) {
						media = mediaById2;
					}
				}

				if (!media || !media.path) {
					claudeLog.warn(
						HANDLER_NAME,
						"Sticker element skipped — could not resolve media file. " +
							`mediaId=${element.mediaId}, sourceId=${element.sourceId}, sourceName=${element.sourceName}`
					);
					continue;
				}

				// Verify file exists
				try {
					await fsPromises.access(media.path);
				} catch {
					claudeLog.warn(
						HANDLER_NAME,
						`Sticker image file not found on disk: ${media.path}`
					);
					continue;
				}

				const duration =
					typeof element.duration === "number" && element.duration > 0
						? element.duration
						: element.endTime - element.startTime;

				if (!Number.isFinite(duration) || duration <= 0) continue;

				const style = (element.style ?? {}) as Record<string, unknown>;
				const el = element as unknown as Record<string, unknown>;

				overlays.push({
					sourcePath: media.path,
					startTime: element.startTime,
					endTime: element.startTime + duration,
					x: (style.x as number) ?? (el.x as number) ?? 0,
					y: (style.y as number) ?? (el.y as number) ?? 0,
					width: (style.width as number) ?? (el.width as number) ?? 200,
					height: (style.height as number) ?? (el.height as number) ?? 200,
					opacity: (style.opacity as number) ?? (el.opacity as number) ?? 1,
					rotation: (style.rotation as number) ?? (el.rotation as number) ?? 0,
				});
			}
		}

		overlays.sort((a, b) => a.startTime - b.startTime);

		if (overlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Collected ${overlays.length} sticker overlay(s) for export`
			);
		}

		return overlays;
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to collect sticker overlays:", error);
		return [];
	}
}

/** Create a directory recursively if it does not exist. */
async function ensureDirectory({
	directory,
}: {
	directory: string;
}): Promise<void> {
	try {
		await fsPromises.mkdir(directory, { recursive: true });
	} catch (error) {
		claudeLog.error(
			HANDLER_NAME,
			`Failed to create directory: ${directory}`,
			error
		);
		throw error;
	}
}

/** Spawn an FFmpeg process and stream progress updates. */
async function runFFmpegCommand({
	args,
	estimatedDuration,
	onProgress,
}: {
	args: string[];
	estimatedDuration: number;
	onProgress?: (progress: {
		normalizedProgress: number;
		currentFrame?: number;
		fps?: number;
		eta?: number;
	}) => void;
}): Promise<void> {
	try {
		const ffmpegPath = getFFmpegPath();

		await new Promise<void>((resolve, reject) => {
			const process = spawn(ffmpegPath, args, {
				windowsHide: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stderrOutput = "";

			process.stderr?.on("data", (chunk: Buffer) => {
				try {
					const text = chunk.toString();
					stderrOutput += text;

					const parsed = parseProgress(text);
					if (!parsed || !onProgress) {
						return;
					}

					const seconds = parseTimecodeToSeconds({
						timecode: parsed.time ?? null,
					});
					const normalizedProgress =
						estimatedDuration > 0
							? clampProgress({ value: seconds / estimatedDuration })
							: 0;

					const currentFrame =
						typeof parsed.frame === "number" && Number.isFinite(parsed.frame)
							? parsed.frame
							: undefined;

					onProgress({
						normalizedProgress,
						currentFrame,
					});
				} catch {
					// Ignore progress parse errors from partial stderr chunks.
				}
			});

			process.on("error", (error: Error) => {
				reject(error);
			});

			process.on("close", (code: number | null) => {
				if (code === 0) {
					resolve();
					return;
				}

				const tail = stderrOutput.slice(-1200);
				reject(new Error(`FFmpeg failed with code ${code}. ${tail}`));
			});
		});
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Unknown FFmpeg execution failure");
	}
}

/** Execute a full export job: encode segments, composite cursors, concatenate, and finalize. */
export async function executeExportJob({
	jobId,
	projectId,
	settings,
	outputPath,
	segments,
	stickerOverlays = [],
}: {
	jobId: string;
	projectId: string;
	settings: ResolvedExportSettings;
	outputPath: string;
	segments: ExportSegment[];
	stickerOverlays?: StickerOverlay[];
}): Promise<void> {
	const job = exportJobs.get(jobId);
	if (!job) {
		return;
	}

	let tempDir = "";

	try {
		job.status = EXPORT_JOB_STATUS.exporting;
		updateJobProgress({ jobId, progress: 0.02 });

		await ensureDirectory({ directory: path.dirname(outputPath) });

		// For GIF exports, all intermediate video steps (concat, sticker overlay)
		// must use an .mp4 path since FFmpeg infers container from extension
		// and .gif doesn't support H.264.
		const videoOutputPath =
			settings.format === "gif"
				? path.join(
						path.dirname(outputPath),
						path.basename(outputPath).replace(/\.gif$/i, ".mp4")
					)
				: outputPath;

		let tempBase: string;
		try {
			tempBase = app.getPath("temp");
		} catch {
			tempBase = os.tmpdir();
		}
		tempDir = await fsPromises.mkdtemp(
			path.join(tempBase, "qcut-claude-export-")
		);

		const segmentOutputs: string[] = [];
		const scaleFilter = `scale=${settings.width}:${settings.height}:force_original_aspect_ratio=decrease,pad=${settings.width}:${settings.height}:(ow-iw)/2:(oh-ih)/2:black`;
		const totalSegments = segments.length;

		for (const [index, segment] of segments.entries()) {
			const outputSegmentPath = path.join(
				tempDir,
				`segment-${String(index).padStart(4, "0")}.mp4`
			);

			const inputArgs: string[] = segment.isImage
				? [
						"-loop",
						"1",
						"-t",
						String(segment.duration),
						"-i",
						segment.sourcePath,
					]
				: ["-i", segment.sourcePath, "-t", String(segment.duration)];

			await runFFmpegCommand({
				args: [
					"-y",
					...inputArgs,
					"-vf",
					scaleFilter,
					"-r",
					String(settings.fps),
					"-c:v",
					settings.codec,
					"-preset",
					"medium",
					"-b:v",
					parseBitrateForKbps({ bitrate: settings.bitrate }),
					"-pix_fmt",
					"yuv420p",
					...(segment.isImage ? [] : ["-c:a", "aac", "-b:a", "192k"]),
					"-shortest",
					outputSegmentPath,
				],
				estimatedDuration: segment.duration,
				onProgress: ({ normalizedProgress, currentFrame }) => {
					const sliceSize = 0.82 / totalSegments;
					const base = (index / totalSegments) * 0.82;
					const progress = base + normalizedProgress * sliceSize;
					updateJobProgress({
						jobId,
						progress,
						currentFrame,
					});
				},
			});

			segmentOutputs.push(outputSegmentPath);
			updateJobProgress({
				jobId,
				progress: ((index + 1) / totalSegments) * 0.82,
			});
		}

		// ==============================================================
		// CURSOR OVERLAY — per-segment, before concat
		// ==============================================================
		if (shouldCompositeCursor(settings)) {
			claudeLog.info(HANDLER_NAME, "Compositing cursor overlay on segments...");
			updateJobProgress({ jobId, progress: 0.83 });

			try {
				await compositeCursorOnSegments({
					segmentOutputs,
					segments,
					settings,
					onProgress: (p) => {
						updateJobProgress({ jobId, progress: 0.83 + p * 0.05 });
					},
				});
			} catch (cursorError) {
				claudeLog.error(
					HANDLER_NAME,
					"Cursor compositing failed, continuing without cursor:",
					cursorError
				);
			}
		}

		const concatListPath = path.join(tempDir, "concat-list.txt");
		const concatLines = segmentOutputs
			.map((segmentPath) => {
				const escaped = segmentPath.replace(/\\/g, "/").replace(/'/g, "'\\''");
				return `file '${escaped}'`;
			})
			.join("\n");
		await fsPromises.writeFile(concatListPath, concatLines, "utf8");

		updateJobProgress({ jobId, progress: 0.9 });

		await runFFmpegCommand({
			args: [
				"-y",
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatListPath,
				"-c",
				"copy",
				"-movflags",
				"+faststart",
				videoOutputPath,
			],
			estimatedDuration: Math.max(
				0,
				segments.reduce((sum, segment) => sum + segment.duration, 0)
			),
			onProgress: ({ normalizedProgress }) => {
				updateJobProgress({
					jobId,
					progress: 0.9 + normalizedProgress * 0.08,
				});
			},
		});

		// =====================================================================
		// STICKER OVERLAY COMPOSITING
		// After concat, overlay any sticker images onto the exported video.
		// =====================================================================
		if (stickerOverlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Applying ${stickerOverlays.length} sticker overlay(s) to exported video`
			);
			updateJobProgress({ jobId, progress: 0.92 });

			const concatOutputPath = path.join(tempDir, "concat-no-stickers.mp4");
			// Move the concat output so we can use it as input for the overlay pass
			await fsPromises.rename(videoOutputPath, concatOutputPath);

			try {
				// Build FFmpeg filter_complex for sticker overlays
				const inputArgs: string[] = ["-y", "-i", concatOutputPath];

				// Add each sticker as an input
				for (const sticker of stickerOverlays) {
					inputArgs.push(
						"-loop",
						"1",
						"-t",
						String(sticker.endTime),
						"-i",
						sticker.sourcePath
					);
				}

				// Build filter_complex chain
				const filterSteps: string[] = [];
				let currentLabel = "0:v";

				for (const [i, sticker] of stickerOverlays.entries()) {
					const inputIdx = i + 1;
					const scaledLabel = `stk_s${i}`;
					let preparedLabel = scaledLabel;

					// Scale sticker to target size
					filterSteps.push(
						`[${inputIdx}:v]scale=${sticker.width}:${sticker.height}[${scaledLabel}]`
					);

					// Apply rotation if needed
					if (sticker.rotation !== 0) {
						const rotLabel = `stk_r${i}`;
						filterSteps.push(
							`[${preparedLabel}]rotate=${sticker.rotation}*PI/180:c=none[${rotLabel}]`
						);
						preparedLabel = rotLabel;
					}

					// Apply opacity if < 1
					if (sticker.opacity < 1) {
						const alphaLabel = `stk_a${i}`;
						filterSteps.push(
							`[${preparedLabel}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${sticker.opacity}*alpha(X,Y)'[${alphaLabel}]`
						);
						preparedLabel = alphaLabel;
					}

					// Overlay onto current video
					const outLabel = `stk_o${i}`;
					const overlayParams = [
						`x=${sticker.x}`,
						`y=${sticker.y}`,
						`enable='between(t,${sticker.startTime},${sticker.endTime})'`,
					].join(":");

					filterSteps.push(
						`[${currentLabel}][${preparedLabel}]overlay=${overlayParams}[${outLabel}]`
					);
					currentLabel = outLabel;
				}

				// The last filter output needs to be mapped
				const lastLabel = currentLabel;
				const filterComplex = filterSteps.join(";");

				const stickerArgs: string[] = [
					...inputArgs,
					"-filter_complex",
					filterComplex,
					"-map",
					`[${lastLabel}]`,
					"-map",
					"0:a?",
					"-c:v",
					settings.codec,
					"-preset",
					"medium",
					"-b:v",
					parseBitrateForKbps({ bitrate: settings.bitrate }),
					"-pix_fmt",
					"yuv420p",
					"-c:a",
					"copy",
					"-movflags",
					"+faststart",
					videoOutputPath,
				];

				claudeLog.info(
					HANDLER_NAME,
					`Sticker overlay filter_complex: ${filterComplex}`
				);

				const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
				await runFFmpegCommand({
					args: stickerArgs,
					estimatedDuration: Math.max(0, totalDuration),
					onProgress: ({ normalizedProgress }) => {
						updateJobProgress({
							jobId,
							progress: 0.92 + normalizedProgress * 0.06,
						});
					},
				});

				claudeLog.info(HANDLER_NAME, "Sticker overlay compositing complete");
			} catch (stickerError) {
				claudeLog.error(
					HANDLER_NAME,
					"Sticker overlay pass failed, restoring concatenated export:",
					stickerError
				);
				// Remove partial sticker output (Windows won't overwrite on rename)
				try {
					await fsPromises.unlink(videoOutputPath);
				} catch {
					/* may not exist */
				}
				// Restore the pre-sticker output so the export isn't lost
				await fsPromises.rename(concatOutputPath, videoOutputPath);
			}
		}

		// =====================================================================
		// GIF CONVERSION (two-pass palette method)
		// If format is "gif", convert the MP4 output to GIF via FFmpeg.
		// =====================================================================
		if (settings.format === "gif") {
			claudeLog.info(HANDLER_NAME, "Converting export to GIF format...");
			updateJobProgress({ jobId, progress: 0.94 });

			try {
				await convertToGif({
					inputPath: videoOutputPath,
					outputPath,
					width: settings.width,
					height: settings.height,
					fps: settings.fps,
					loop: settings.gifLoop !== false,
					tempDir,
					onProgress: (p) => {
						updateJobProgress({ jobId, progress: 0.94 + p * 0.04 });
					},
				});
			} catch (gifError) {
				// Clean up partial GIF artifact on failure
				try {
					await fsPromises.unlink(outputPath);
				} catch {
					/* may not exist */
				}
				throw gifError;
			}

			// Clean up intermediary MP4
			try {
				await fsPromises.unlink(videoOutputPath);
			} catch {
				/* ignore */
			}
		}

		const outputStats = await fsPromises.stat(outputPath);
		const duration = segments.reduce(
			(sum, segment) => sum + segment.duration,
			0
		);

		const finishedJob = exportJobs.get(jobId);
		if (!finishedJob) {
			return;
		}

		finishedJob.status = EXPORT_JOB_STATUS.completed;
		finishedJob.progress = 1;
		finishedJob.outputPath = outputPath;
		finishedJob.duration = duration;
		finishedJob.fileSize = outputStats.size;
		finishedJob.completedAt = Date.now();

		logOperation({
			stage: 5,
			action: "export",
			details: `Exported ${settings.presetId} (${path.basename(outputPath)})`,
			timestamp: Date.now(),
			duration,
			projectId,
			metadata: {
				jobId,
				preset: settings.presetId,
				outputPath,
			},
		});
		emitClaudeEvent({
			category: CLAUDE_EDITOR_EVENT_CATEGORY.exportCompleted,
			action: CLAUDE_EDITOR_EVENT_ACTION.completed,
			correlationId: jobId,
			source: "main.export-handler",
			data: {
				jobId,
				projectId,
				presetId: settings.presetId,
				outputPath,
				duration,
				fileSize: outputStats.size,
				completedAt: finishedJob.completedAt ?? Date.now(),
			},
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Export failed";
		const failedJob = exportJobs.get(jobId);
		if (failedJob) {
			failedJob.status = EXPORT_JOB_STATUS.failed;
			failedJob.error = message;
			failedJob.completedAt = Date.now();
		}

		logOperation({
			stage: 5,
			action: "export",
			details: `Export failed: ${message}`,
			timestamp: Date.now(),
			projectId,
			metadata: {
				jobId,
				preset: settings.presetId,
			},
		});
		emitClaudeEvent({
			category: CLAUDE_EDITOR_EVENT_CATEGORY.exportFailed,
			action: CLAUDE_EDITOR_EVENT_ACTION.failed,
			correlationId: jobId,
			source: "main.export-handler",
			data: {
				jobId,
				projectId,
				presetId: settings.presetId,
				error: message,
				completedAt: failedJob?.completedAt ?? Date.now(),
			},
		});

		claudeLog.error(HANDLER_NAME, `Export job ${jobId} failed:`, error);
	} finally {
		if (tempDir) {
			try {
				await fsPromises.rm(tempDir, { recursive: true, force: true });
			} catch (cleanupError) {
				claudeLog.warn(
					HANDLER_NAME,
					`Failed to cleanup temp export dir: ${tempDir}`,
					cleanupError
				);
			}
		}
	}
}

export { getDefaultOutputPath } from "./utils.js";
