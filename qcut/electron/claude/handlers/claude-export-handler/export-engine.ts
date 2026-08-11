/**
 * Export engine — settings resolution, segment collection, FFmpeg execution.
 * @module electron/claude/handlers/claude-export-handler/export-engine
 */

import { app } from "electron";
import { spawn } from "node:child_process";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	getFFmpegPath,
	parseProgress,
	probeHasAudioStream,
} from "../../../ffmpeg/utils.js";
import { buildFFmpegArgs } from "../../../ffmpeg-args-builder.js";
import { buildTimelineAudioFilters } from "../../../ffmpeg/audio-filter-graph.js";
import { buildXfadeTransitionFilter } from "../../../ffmpeg/transition-filter.js";
import type {
	AudioFile,
	TextRasterLayer,
	VideoSource,
	VideoTransition,
} from "../../../ffmpeg/types.js";
import { buildVideoFitFilter } from "../../../ffmpeg/video-fit-filter.js";
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
	type JianyingTextOverlay,
	type StickerOverlay,
	type TextOverlay,
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
import { buildTextAss } from "./text-overlay.js";
import { renderJianyingTextRasterLayers } from "./jianying-text-raster.js";
import { buildTextRasterOverlayPassArgs } from "./text-raster-overlay-pass.js";

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
		const requestedEngine = request.engine ?? "auto";
		if (!["auto", "native", "cli"].includes(requestedEngine)) {
			throw new Error(
				`Export engine '${requestedEngine}' is not available through the CLI API. Use auto, native, or cli.`
			);
		}

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
		const audioBitrate = request.audioExportConfig?.bitrate ?? 192;
		const audioSampleRate = request.audioExportConfig?.sampleRate ?? 44_100;
		if (![128, 192, 256, 320].includes(audioBitrate)) {
			throw new Error("Audio bitrate must be 128, 192, 256, or 320 kbps");
		}
		if (![44_100, 48_000].includes(audioSampleRate)) {
			throw new Error("Audio sample rate must be 44100 or 48000 Hz");
		}

		return {
			engine: "native-cli",
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
			audioBitrate,
			audioSampleRate,
			audioChannels: request.audioExportConfig?.channels ?? 2,

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

function escapeAssFilterPath(filePath: string): string {
	return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
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
	if (element.mediaId) {
		const byMediaId = mediaById.get(element.mediaId);
		if (byMediaId) return byMediaId;
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

function optionalNumber(value: unknown, fallback?: number): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalBoolean(value: unknown, fallback = false): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/**
 * Collect independent timeline audio tracks. Embedded audio from media tracks is
 * already carried by the base video export and is intentionally excluded here.
 */
export async function collectTimelineAudioFiles({
	timeline,
	mediaFiles,
	projectId,
}: {
	timeline: ClaudeTimeline;
	mediaFiles: MediaFile[];
	projectId?: string;
}): Promise<AudioFile[]> {
	const mediaById = new Map<string, MediaFile>();
	const mediaByName = new Map<string, MediaFile>();
	for (const mediaFile of mediaFiles) {
		mediaById.set(mediaFile.id, mediaFile);
		mediaByName.set(mediaFile.name, mediaFile);
	}

	const audioFiles: AudioFile[] = [];
	const diskFallbackCache = new Map<string, MediaFile | null>();
	for (const [trackIndex, track] of timeline.tracks.entries()) {
		const trackRecord = track as unknown as Record<string, unknown>;
		if (
			track.type !== "audio" ||
			track.hidden === true ||
			trackRecord.muted === true
		) {
			continue;
		}
		for (const element of track.elements) {
			if (element.hidden === true) continue;
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
			if (!media || (media.type !== "audio" && media.type !== "video")) {
				continue;
			}

			const elementRecord = element as unknown as Record<string, unknown>;
			const props =
				typeof element.props === "object" && element.props !== null
					? element.props
					: {};
			const read = (key: string): unknown =>
				elementRecord[key] !== undefined ? elementRecord[key] : props[key];
			const trimStart = optionalNumber(element.trimStart, 0) ?? 0;
			const trimEnd = optionalNumber(element.trimEnd, 0) ?? 0;
			const visibleDuration =
				optionalNumber(element.duration) ??
				Math.max(0, element.endTime - element.startTime);
			if (!visibleDuration || visibleDuration <= 0) continue;
			// The serialized timeline reports how long the clip plays, while the
			// audio filter graph expects the source length and subtracts the trims
			// itself. Without converting back, a trimmed clip collapses to silence.
			const duration = visibleDuration + trimStart + trimEnd;

			audioFiles.push({
				elementId: element.id,
				trackId: track.id ?? `track-${trackIndex}`,
				path: media.path,
				startTime: Math.max(0, element.startTime),
				volume: optionalNumber(read("volume"), 1),
				sourceGain: optionalNumber(read("sourceGain"), 1),
				trimStart,
				trimEnd,
				duration,
				fadeIn: optionalNumber(read("audioFadeIn"), 0),
				fadeOut: optionalNumber(read("audioFadeOut"), 0),
				normalize: optionalBoolean(read("audioNormalize")),
				denoise: optionalNumber(read("audioDenoise"), 0),
				pan: optionalNumber(read("audioPan"), 0),
				playbackRate: optionalNumber(read("playbackRate"), 1),
				reverse: optionalBoolean(read("reverse")),
				freezeFrameTime: optionalNumber(read("freezeFrameTime")),
				freezeFrameDuration: optionalNumber(read("freezeFrameDuration"), 0),
			});
		}
	}
	audioFiles.sort((left, right) => left.startTime - right.startTime);
	return audioFiles;
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

		for (const [trackOrder, track] of timeline.tracks.entries()) {
			if (track.hidden) continue;
			const trackId = track.id ?? `track-${track.index}`;
			for (const [elementOrder, element] of track.elements.entries()) {
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
					elementId: element.id,
					trackId,
					trackOrder,
					elementOrder,
					sourcePath: media.path,
					startTime: element.startTime,
					duration: durationFromElement,
					trimStart:
						typeof element.trimStart === "number" && element.trimStart > 0
							? element.trimStart
							: 0,
					sourceId: media.id,
					isImage: media.type === "image",
					fitMode: element.fitMode ?? "cover",
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

function normalizeTransitionTuning({
	tuning,
}: {
	tuning: Record<string, unknown> | undefined;
}): VideoTransition["tuning"] {
	if (!tuning) return undefined;
	const intensity = optionalNumber(tuning.intensity);
	const frequency = optionalNumber(tuning.frequency);
	const tint =
		typeof tuning.tint === "string" && /^#[\da-f]{6}$/i.test(tuning.tint)
			? tuning.tint
			: undefined;
	if (
		intensity === undefined &&
		frequency === undefined &&
		tint === undefined
	) {
		return undefined;
	}
	return { intensity, frequency, tint };
}

const SUPPORTED_TRANSITION_MASK_SHAPES = new Set<
	NonNullable<VideoTransition["maskShape"]>
>([
	"circle",
	"clock",
	"blinds",
	"cross",
	"triptych",
	"arrow",
	"heart",
	"star",
	"ink",
	"cloud",
	"fog",
	"drip",
	"curtain",
	"diagonal",
]);

function normalizeTransitionMaskShape({
	maskShape,
}: {
	maskShape: string | undefined;
}): VideoTransition["maskShape"] {
	if (maskShape === undefined) return undefined;
	if (
		SUPPORTED_TRANSITION_MASK_SHAPES.has(
			maskShape as NonNullable<VideoTransition["maskShape"]>
		)
	) {
		return maskShape as NonNullable<VideoTransition["maskShape"]>;
	}
	throw new Error(`Unsupported transition mask shape: ${maskShape}`);
}

/** Convert serialized timeline transitions into the shared FFmpeg transition model. */
export function collectVideoTransitions({
	timeline,
	segments,
}: {
	timeline: ClaudeTimeline;
	segments: ExportSegment[];
}): VideoTransition[] {
	const segmentByElementId = new Map(
		segments.map((segment) => [segment.elementId, segment])
	);
	const frameRate = Number.isFinite(timeline.fps)
		? Math.max(1, timeline.fps)
		: 30;
	const frameDuration = 1 / frameRate;
	const transitions: VideoTransition[] = [];
	const transitionedFromElements = new Set<string>();

	for (const track of timeline.tracks) {
		if (track.hidden || track.type !== "media") continue;
		const trackId = track.id ?? `track-${track.index}`;
		const orderedElementIds = segments
			.filter((segment) => segment.trackId === trackId)
			.sort((left, right) => {
				const timeDifference = left.startTime - right.startTime;
				return timeDifference !== 0
					? timeDifference
					: left.elementOrder - right.elementOrder;
			})
			.map((segment) => segment.elementId);

		for (const transition of track.transitions ?? []) {
			const fromSegment = segmentByElementId.get(transition.fromElementId);
			const toSegment = segmentByElementId.get(transition.toElementId);
			if (!fromSegment || !toSegment) {
				throw new Error(
					`Transition ${transition.id ?? transition.fromElementId} references a non-exportable clip.`
				);
			}
			if (fromSegment.isImage || toSegment.isImage) {
				throw new Error(
					`Transition ${transition.id ?? transition.fromElementId} requires two video clips.`
				);
			}
			const fromIndex = orderedElementIds.indexOf(transition.fromElementId);
			if (
				fromIndex < 0 ||
				orderedElementIds[fromIndex + 1] !== transition.toElementId
			) {
				throw new Error(
					`Transition ${transition.id ?? transition.fromElementId} clips are not adjacent.`
				);
			}
			const cutTime = fromSegment.startTime + fromSegment.duration;
			if (Math.abs(cutTime - toSegment.startTime) > frameDuration + 1e-6) {
				throw new Error(
					`Transition ${transition.id ?? transition.fromElementId} clips do not share a seam.`
				);
			}
			if (!Number.isFinite(transition.duration) || transition.duration <= 0) {
				throw new Error(
					`Transition ${transition.id ?? transition.fromElementId} has an invalid duration.`
				);
			}
			if (transitionedFromElements.has(transition.fromElementId)) {
				throw new Error(
					`Clip ${transition.fromElementId} has more than one outgoing transition.`
				);
			}

			const normalized: VideoTransition = {
				id:
					transition.id ??
					`transition-${transition.fromElementId}-${transition.toElementId}`,
				trackId,
				fromElementId: transition.fromElementId,
				toElementId: transition.toElementId,
				presetId: transition.presetId,
				type: transition.type as VideoTransition["type"],
				direction: transition.direction,
				easing: transition.easing ?? "easeInOut",
				duration:
					Math.max(1, Math.round(transition.duration * frameRate)) / frameRate,
				tuning: normalizeTransitionTuning({ tuning: transition.tuning }),
				maskShape: normalizeTransitionMaskShape({
					maskShape: transition.maskShape,
				}),
			};
			buildXfadeTransitionFilter({ transition: normalized });
			transitions.push(normalized);
			transitionedFromElements.add(transition.fromElementId);
		}
	}

	return transitions;
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

/**
 * Build ffmpeg input args for one export segment. Seeks to the segment's
 * source in-point (trimStart) before decoding so trimmed clips start at the
 * right place instead of source time 0.
 */
export function buildExportSegmentInputArgs({
	segment,
}: {
	segment: ExportSegment;
}): string[] {
	if (segment.isImage) {
		return [
			"-loop",
			"1",
			"-t",
			String(segment.duration),
			"-i",
			segment.sourcePath,
		];
	}
	const seekArgs =
		segment.trimStart > 0 ? ["-ss", String(segment.trimStart)] : [];
	return [
		...seekArgs,
		"-i",
		segment.sourcePath,
		"-t",
		String(segment.duration),
	];
}

/** Build the same cover/contain/fill scaling used by the editor preview. */
export function buildExportSegmentScaleFilter({
	segment,
	settings,
}: {
	segment: ExportSegment;
	settings: Pick<ResolvedExportSettings, "width" | "height">;
}): string {
	return `${buildVideoFitFilter({
		fitMode: segment.fitMode,
		width: settings.width,
		height: settings.height,
	})},setsar=1`;
}

export function buildTransitionVideoSources({
	segments,
	segmentOutputs,
}: {
	segments: ExportSegment[];
	segmentOutputs: string[];
}): VideoSource[] {
	if (segments.length !== segmentOutputs.length) {
		throw new Error("Transition render inputs do not match export segments.");
	}
	return segments.map((segment, index) => ({
		elementId: segment.elementId,
		trackId: segment.trackId,
		trackOrder: segment.trackOrder,
		elementOrder: segment.elementOrder,
		path: segmentOutputs[index],
		startTime: segment.startTime,
		duration: segment.duration,
		trimStart: 0,
		trimEnd: 0,
	}));
}

export function buildTransitionAudioAlignmentFilter({
	segments,
}: {
	segments: ExportSegment[];
}): string | null {
	const orderedSegments = [...segments].sort(
		(left, right) => left.startTime - right.startTime
	);
	const filters: string[] = [];
	const labels: string[] = [];
	let sourceOffset = 0;
	let timelineCursor = 0;
	let gapCount = 0;

	for (const [index, segment] of orderedSegments.entries()) {
		const gapDuration = Math.max(0, segment.startTime - timelineCursor);
		if (gapDuration > 1e-6) {
			const gapLabel = `transition_gap_${gapCount}`;
			filters.push(
				`anullsrc=r=48000:cl=stereo,atrim=duration=${gapDuration},asetpts=PTS-STARTPTS[${gapLabel}]`
			);
			labels.push(`[${gapLabel}]`);
			gapCount += 1;
		}

		const audioLabel = `transition_audio_${index}`;
		filters.push(
			`[1:a]atrim=start=${sourceOffset}:end=${sourceOffset + segment.duration},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[${audioLabel}]`
		);
		labels.push(`[${audioLabel}]`);
		sourceOffset += segment.duration;
		timelineCursor = Math.max(
			timelineCursor,
			segment.startTime + segment.duration
		);
	}

	if (gapCount === 0 || labels.length === 0) return null;
	filters.push(
		`${labels.join("")}concat=n=${labels.length}:v=0:a=1[aligned_audio]`
	);
	return filters.join(";");
}

async function renderTransitionedVideo({
	concatAudioPath,
	segmentOutputs,
	segments,
	settings,
	tempDir,
	videoOutputPath,
	videoTransitions,
	onProgress,
}: {
	concatAudioPath: string;
	segmentOutputs: string[];
	segments: ExportSegment[];
	settings: ResolvedExportSettings;
	tempDir: string;
	videoOutputPath: string;
	videoTransitions: VideoTransition[];
	onProgress?: ({ progress }: { progress: number }) => void;
}): Promise<void> {
	const transitionedVideoPath = path.join(tempDir, "transitioned-video.mp4");
	const duration = Math.max(
		1 / Math.max(1, settings.fps),
		...segments.map((segment) => segment.startTime + segment.duration)
	);
	const videoSources = buildTransitionVideoSources({
		segments,
		segmentOutputs,
	});
	const hasAudio = await probeHasAudioStream({ mediaPath: concatAudioPath });
	const audioAlignmentFilter = hasAudio
		? buildTransitionAudioAlignmentFilter({ segments })
		: null;
	const transitionArgs = buildFFmpegArgs({
		inputDir: tempDir,
		outputFile: transitionedVideoPath,
		width: settings.width,
		height: settings.height,
		fps: settings.fps,
		quality: "medium",
		duration,
		useDirectCopy: false,
		videoSources,
		videoTransitions,
		includeEmbeddedAudio: false,
	});

	await runFFmpegCommand({
		args: transitionArgs,
		estimatedDuration: duration,
		onProgress: ({ normalizedProgress }) => {
			onProgress?.({ progress: normalizedProgress * 0.85 });
		},
	});

	await runFFmpegCommand({
		args: [
			"-y",
			"-i",
			transitionedVideoPath,
			"-i",
			concatAudioPath,
			...(audioAlignmentFilter
				? ["-filter_complex", audioAlignmentFilter]
				: []),
			"-map",
			"0:v:0",
			"-map",
			audioAlignmentFilter ? "[aligned_audio]" : "1:a?",
			"-c:v",
			"copy",
			"-c:a",
			audioAlignmentFilter ? "aac" : "copy",
			...(audioAlignmentFilter ? ["-b:a", "192k", "-t", String(duration)] : []),
			"-movflags",
			"+faststart",
			videoOutputPath,
		],
		estimatedDuration: duration,
		onProgress: ({ normalizedProgress }) => {
			onProgress?.({ progress: 0.85 + normalizedProgress * 0.15 });
		},
	});
}

/** Execute a full export job: encode segments, composite cursors, concatenate, and finalize. */
export async function executeExportJob({
	jobId,
	projectId,
	settings,
	outputPath,
	segments,
	stickerOverlays = [],
	textOverlays = [],
	jianyingTextOverlays = [],
	audioFiles = [],
	videoTransitions = [],
	projectCanvas,
	projectFps,
}: {
	jobId: string;
	projectId: string;
	settings: ResolvedExportSettings;
	outputPath: string;
	segments: ExportSegment[];
	stickerOverlays?: StickerOverlay[];
	textOverlays?: TextOverlay[];
	jianyingTextOverlays?: JianyingTextOverlay[];
	audioFiles?: AudioFile[];
	videoTransitions?: VideoTransition[];
	projectFps?: number;
	/**
	 * Project canvas size that text overlay x/y/fontSize values are expressed
	 * in. When the export preset resolution differs from the project canvas,
	 * the ASS PlayRes must stay in canvas units so libass scales text to the
	 * output instead of rendering it undersized and mispositioned.
	 */
	projectCanvas?: { width: number; height: number };
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

		// GIF and MP3 need an MP4 intermediary. Keep it in the export session
		// directory so an existing user file can never be overwritten or deleted.
		const needsIntermediateVideo = ["gif", "mp3"].includes(settings.format);
		const videoOutputPath = needsIntermediateVideo
			? path.join(tempDir, "intermediate.mp4")
			: outputPath;

		const segmentOutputs: string[] = [];
		const totalSegments = segments.length;

		for (const [index, segment] of segments.entries()) {
			const outputSegmentPath = path.join(
				tempDir,
				`segment-${String(index).padStart(4, "0")}.mp4`
			);

			const inputArgs = buildExportSegmentInputArgs({ segment });
			const scaleFilter = buildExportSegmentScaleFilter({
				segment,
				settings,
			});

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

		const hasVideoTransitions = videoTransitions.length > 0;
		const concatOutputPath = hasVideoTransitions
			? path.join(tempDir, "concat-audio.mp4")
			: videoOutputPath;
		const concatProgressStart = hasVideoTransitions ? 0.83 : 0.9;
		const concatProgressSpan = hasVideoTransitions ? 0.04 : 0.08;
		updateJobProgress({ jobId, progress: concatProgressStart });

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
				concatOutputPath,
			],
			estimatedDuration: Math.max(
				0,
				segments.reduce((sum, segment) => sum + segment.duration, 0)
			),
			onProgress: ({ normalizedProgress }) => {
				updateJobProgress({
					jobId,
					progress:
						concatProgressStart + normalizedProgress * concatProgressSpan,
				});
			},
		});

		if (hasVideoTransitions) {
			await renderTransitionedVideo({
				concatAudioPath: concatOutputPath,
				segmentOutputs,
				segments,
				settings,
				tempDir,
				videoOutputPath,
				videoTransitions,
				onProgress: ({ progress }) => {
					updateJobProgress({
						jobId,
						progress: 0.87 + progress * 0.11,
					});
				},
			});
		}

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

		if (jianyingTextOverlays.length > 0 && settings.format !== "mp3") {
			claudeLog.info(
				HANDLER_NAME,
				`Rendering ${jianyingTextOverlays.length} original Jianying text overlay(s)`
			);
			updateJobProgress({ jobId, progress: 0.93 });
			const canvas = projectCanvas ?? {
				width: settings.width,
				height: settings.height,
			};
			const resolvedProjectFps =
				typeof projectFps === "number" &&
				Number.isFinite(projectFps) &&
				projectFps > 0
					? projectFps
					: settings.fps;
			const textRasterLayers: TextRasterLayer[] =
				await renderJianyingTextRasterLayers({
					jobId,
					overlays: jianyingTextOverlays,
					projectCanvas: canvas,
					outputCanvas: {
						width: settings.width,
						height: settings.height,
					},
					projectFps: resolvedProjectFps,
				});
			if (textRasterLayers.length !== jianyingTextOverlays.length) {
				throw new Error(
					"Jianying text renderer did not return every requested overlay."
				);
			}
			const sourcePath = path.join(tempDir, "video-before-jianying-text.mp4");
			await fsPromises.rename(videoOutputPath, sourcePath);
			try {
				await runFFmpegCommand({
					args: buildTextRasterOverlayPassArgs({
						sourcePath,
						outputPath: videoOutputPath,
						layers: textRasterLayers,
						settings,
					}),
					estimatedDuration: Math.max(
						0,
						segments.reduce((sum, segment) => sum + segment.duration, 0)
					),
					onProgress: ({ normalizedProgress }) => {
						updateJobProgress({
							jobId,
							progress: 0.93 + normalizedProgress * 0.01,
						});
					},
				});
			} catch (error) {
				try {
					await fsPromises.unlink(videoOutputPath);
				} catch {}
				await fsPromises.rename(sourcePath, videoOutputPath);
				throw new Error(
					`Jianying text raster export failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
			claudeLog.info(
				HANDLER_NAME,
				"Original Jianying text compositing complete"
			);
		}

		// Text/caption overlays are a required parity pass. Failure is fatal so a
		// successful export can never silently omit visible timeline text.
		if (textOverlays.length > 0 && settings.format !== "mp3") {
			claudeLog.info(
				HANDLER_NAME,
				`Applying ${textOverlays.length} text overlay(s) to exported video`
			);
			updateJobProgress({ jobId, progress: 0.94 });
			const sourcePath = path.join(tempDir, "concat-before-text.mp4");
			const assPath = path.join(tempDir, "timeline-text.ass");
			// Overlay x/y/fontSize are project-canvas coordinates, so PlayRes must
			// be the canvas size — libass then scales text to the export frame.
			await fsPromises.writeFile(
				assPath,
				buildTextAss({
					overlays: textOverlays,
					width: projectCanvas?.width ?? settings.width,
					height: projectCanvas?.height ?? settings.height,
				}),
				"utf8"
			);
			await fsPromises.rename(videoOutputPath, sourcePath);
			try {
				await runFFmpegCommand({
					args: [
						"-y",
						"-i",
						sourcePath,
						"-vf",
						`ass='${escapeAssFilterPath(assPath)}'`,
						"-map",
						"0:v:0",
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
					],
					estimatedDuration: Math.max(
						0,
						segments.reduce((sum, segment) => sum + segment.duration, 0)
					),
				});
			} catch (error) {
				try {
					await fsPromises.unlink(videoOutputPath);
				} catch {}
				await fsPromises.rename(sourcePath, videoOutputPath);
				throw new Error(
					`Text overlay export failed: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// Independent audio tracks are mixed after all video-only compositing
		// passes. The existing embedded video audio is included when present.
		if (audioFiles.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Mixing ${audioFiles.length} independent timeline audio track(s)`
			);
			updateJobProgress({ jobId, progress: 0.955 });
			const sourcePath = path.join(tempDir, "video-before-audio-mix.mp4");
			await fsPromises.rename(videoOutputPath, sourcePath);
			try {
				const hasEmbeddedAudio = await probeHasAudioStream({
					mediaPath: sourcePath,
				});
				const inputArgs = ["-y", "-i", sourcePath];
				for (const audioFile of audioFiles) {
					inputArgs.push("-i", audioFile.path);
				}
				const graph = buildTimelineAudioFilters({
					audioFiles,
					audioStartIndex: 1,
					fps: settings.fps,
				});
				if (!graph.mapAudio) {
					throw new Error("Timeline audio filter graph produced no audio map");
				}
				const filterSteps = [...graph.filterSteps];
				let audioMap = graph.mapAudio;
				if (hasEmbeddedAudio) {
					const externalLabel = graph.mapAudio.startsWith("[")
						? graph.mapAudio
						: `[${graph.mapAudio}]`;
					filterSteps.push(
						`[0:a]${externalLabel}amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[a_final]`
					);
					audioMap = "[a_final]";
				}
				// The concat video length is the sum of encoded segment durations
				// (timeline gaps collapse), so derive the mux duration from that
				// rather than timeline offsets; audio tails may still extend past it.
				const concatVideoDuration = segments.reduce(
					(sum, segment) => sum + segment.duration,
					0
				);
				const totalDuration = Math.max(
					concatVideoDuration,
					...audioFiles.map(
						(audioFile) =>
							audioFile.startTime + Math.max(0, audioFile.duration ?? 0)
					)
				);
				await runFFmpegCommand({
					args: [
						...inputArgs,
						...(filterSteps.length > 0
							? ["-filter_complex", filterSteps.join(";")]
							: []),
						"-map",
						"0:v:0",
						"-map",
						audioMap,
						"-c:v",
						"copy",
						"-c:a",
						"aac",
						"-b:a",
						`${settings.audioBitrate ?? 192}k`,
						"-ar",
						String(settings.audioSampleRate ?? 44_100),
						"-ac",
						String(settings.audioChannels ?? 2),
						"-t",
						String(totalDuration),
						"-movflags",
						"+faststart",
						videoOutputPath,
					],
					estimatedDuration: totalDuration,
				});
			} catch (error) {
				try {
					await fsPromises.unlink(videoOutputPath);
				} catch {}
				await fsPromises.rename(sourcePath, videoOutputPath);
				throw new Error(
					`Timeline audio mix failed: ${error instanceof Error ? error.message : String(error)}`
				);
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
					quality: settings.gifQuality,
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

		if (settings.format === "mp3") {
			claudeLog.info(HANDLER_NAME, "Extracting standalone MP3 export...");
			updateJobProgress({ jobId, progress: 0.96 });
			try {
				await runFFmpegCommand({
					args: [
						"-y",
						"-i",
						videoOutputPath,
						"-vn",
						"-c:a",
						"libmp3lame",
						"-b:a",
						`${settings.audioBitrate ?? 192}k`,
						"-ar",
						String(settings.audioSampleRate ?? 44_100),
						"-ac",
						String(settings.audioChannels ?? 2),
						outputPath,
					],
					estimatedDuration: segments.reduce(
						(sum, segment) => sum + segment.duration,
						0
					),
				});
			} catch (mp3Error) {
				// Clean up partial MP3 artifact on failure
				try {
					await fsPromises.unlink(outputPath);
				} catch {
					/* may not exist */
				}
				throw mp3Error;
			}
			try {
				await fsPromises.unlink(videoOutputPath);
			} catch {
				// Ignore cleanup errors.
			}
		}

		if (
			audioFiles.length > 0 &&
			settings.format !== "gif" &&
			!(await probeHasAudioStream({ mediaPath: outputPath }))
		) {
			throw new Error(
				"Export verification failed: independent audio tracks were present, but the final file has no audio stream"
			);
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
