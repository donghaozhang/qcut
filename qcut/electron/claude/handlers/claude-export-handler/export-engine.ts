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

		return {
			presetId: preset.id,
			width:
				s?.width ?? (typeof top.width === "number" ? top.width : preset.width),
			height:
				s?.height ??
				(typeof top.height === "number" ? top.height : preset.height),
			fps: s?.fps ?? (typeof top.fps === "number" ? top.fps : preset.fps),
			format:
				s?.format ??
				(typeof top.format === "string" ? top.format : preset.format),
			codec:
				s?.codec ?? (typeof top.codec === "string" ? top.codec : "libx264"),
			bitrate:
				s?.bitrate ??
				(typeof top.bitrate === "string" ? top.bitrate : preset.bitrate),
		};
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Failed to resolve export settings");
	}
}

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
			} catch {
				continue; // Broken symlink or inaccessible
			}
		}
	}

	return null;
}

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
					claudeLog.info(
						HANDLER_NAME,
						`Media library lookup failed for "${element.sourceName}", trying disk fallback`
					);
					media = await resolveMediaFromDisk({
						projectId,
						sourceName: element.sourceName,
					});
					if (media) {
						claudeLog.info(
							HANDLER_NAME,
							`Disk fallback resolved "${element.sourceName}" → ${media.path}`
						);
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

export async function executeExportJob({
	jobId,
	projectId,
	settings,
	outputPath,
	segments,
}: {
	jobId: string;
	projectId: string;
	settings: ResolvedExportSettings;
	outputPath: string;
	segments: ExportSegment[];
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
				outputPath,
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
