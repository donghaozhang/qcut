/**
 * Public API functions for Claude Export Handler.
 * @module electron/claude/handlers/claude-export-handler/public-api
 */

import { claudeLog } from "../../utils/logger.js";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";
import { logOperation } from "../../claude-operation-log.js";
import { emitClaudeEvent } from "../claude-events-handler.js";
import type {
	ClaudeTimeline,
	ExportPreset,
	ExportRecommendation,
	ExportJobRequest,
	ExportJobStatus,
	MediaFile,
} from "../../../types/claude-api";
import {
	CLAUDE_EDITOR_EVENT_ACTION,
	CLAUDE_EDITOR_EVENT_CATEGORY,
} from "../../../types/claude-api.js";
import {
	HANDLER_NAME,
	EXPORT_JOB_STATUS,
	type ExportJobInternal,
	type ProgressEventPayload,
} from "./types.js";
import { PRESETS } from "./presets.js";
import { pruneOldJobs, getDefaultOutputPath } from "./utils.js";
import {
	exportJobs,
	getActiveJobForProject,
	updateJobProgress,
} from "./job-manager.js";
import {
	resolveExportSettings,
	collectExportSegments,
	collectVideoTransitions,
	collectStickerOverlays,
	collectTimelineAudioFiles,
	executeExportJob,
} from "./export-engine.js";
import { collectJianyingTextOverlays } from "./jianying-text-overlay.js";
import { collectTextOverlays } from "./text-overlay.js";
import { assertLocalFinalVideoExportAllowed } from "../../../types/restricted-media-export-policy.js";
import { assertNativeStickerRuntimeExportAllowed } from "../../../types/sticker-runtime-export-policy.js";
import type { ClaudeLocalVideoExportRequest } from "../../../types/claude-local-video-export-api.js";

const RENDERER_EXPORT_FRAME_RATES = [24, 25, 30, 50, 60] as const;

function rendererExportQuality({
	height,
	width,
}: {
	height: number;
	width: number;
}): ClaudeLocalVideoExportRequest["quality"] {
	const longestEdge = Math.max(height, width);
	if (longestEdge >= 1920) return "1080p";
	if (longestEdge >= 1280) return "720p";
	return "480p";
}

function rendererExportFrameRate({
	fps,
}: {
	fps: number;
}): ClaudeLocalVideoExportRequest["frameRate"] {
	const supported = RENDERER_EXPORT_FRAME_RATES.find(
		(frameRate) => frameRate === fps
	);
	if (!supported) {
		throw new Error(`Renderer MP4 export does not support ${fps} fps.`);
	}
	return supported;
}

function isImplicitCliAudioConfig({
	audioConfig,
}: {
	audioConfig: unknown;
}): boolean {
	if (
		typeof audioConfig !== "object" ||
		audioConfig === null ||
		Array.isArray(audioConfig)
	) {
		return false;
	}
	const record = audioConfig as Record<string, unknown>;
	// CLI parsing materializes these defaults even when no audio flags were supplied.
	return (
		Object.keys(record).length === 2 &&
		record.mic === false &&
		record.systemAudio === true
	);
}

function isTimelineEmpty({ timeline }: { timeline: ClaudeTimeline }): boolean {
	try {
		for (const track of timeline.tracks) {
			if (track.elements.length > 0) {
				return false;
			}
		}
		return true;
	} catch {
		return true;
	}
}

function assertRendererExportRequestCompatible({
	request,
}: {
	request: ExportJobRequest;
}): void {
	const topLevel = request as Record<string, unknown>;
	const unsupportedOptions: string[] = [];
	if (
		request.engine &&
		request.engine !== "auto" &&
		request.engine !== "muxer"
	) {
		unsupportedOptions.push("engine");
	}
	if (request.cursorConfig !== undefined) {
		unsupportedOptions.push("cursorConfig");
	}
	if (request.zoomConfig !== undefined) {
		unsupportedOptions.push("zoomConfig");
	}
	if (
		request.audioConfig !== undefined &&
		!isImplicitCliAudioConfig({ audioConfig: request.audioConfig })
	) {
		unsupportedOptions.push("audioConfig");
	}
	if (request.audioExportConfig !== undefined) {
		unsupportedOptions.push("audioExportConfig");
	}
	if (
		request.settings?.bitrate !== undefined ||
		topLevel.bitrate !== undefined
	) {
		unsupportedOptions.push("bitrate");
	}
	if (request.settings?.codec !== undefined || topLevel.codec !== undefined) {
		unsupportedOptions.push("codec");
	}
	if (unsupportedOptions.length === 0) return;
	throw new Error(
		`Renderer Sticker Lab export does not support these CLI overrides: ${unsupportedOptions.join(
			", "
		)}.`
	);
}

/**
 * Get all export presets
 */
export function getExportPresets(): ExportPreset[] {
	claudeLog.info(HANDLER_NAME, "Returning all export presets");
	return PRESETS;
}

/**
 * Get export recommendation for a specific platform/target
 */
export function getExportRecommendation({
	target,
}: {
	target: string;
}): ExportRecommendation {
	claudeLog.info(HANDLER_NAME, `Recommending export for target: ${target}`);

	const defaultPreset = PRESETS.find((p) => p.id === "youtube-1080p");
	if (!defaultPreset) {
		throw new Error("Default preset 'youtube-1080p' not found");
	}

	const preset =
		PRESETS.find((p) => p.platform === target || p.id === target) ||
		defaultPreset;

	const warnings: string[] = [];
	const suggestions: string[] = [];

	switch (preset.platform) {
		case "tiktok":
			suggestions.push("Videos under 60 seconds perform best on TikTok");
			suggestions.push(
				"Add captions for better engagement (85% watch without sound)"
			);
			suggestions.push("Use trending sounds when possible");
			warnings.push("Maximum video length is 10 minutes");
			break;

		case "instagram":
			suggestions.push("Reels should be 15-90 seconds for optimal reach");
			suggestions.push("Use trending audio when possible");
			suggestions.push("Add text overlays for accessibility");
			warnings.push("Instagram compresses videos - export at higher quality");
			break;

		case "youtube":
			suggestions.push("Add chapters for longer videos (>10 minutes)");
			suggestions.push("Include end screen in last 20 seconds");
			suggestions.push("Add closed captions for better SEO");
			break;

		case "twitter":
			warnings.push("Maximum video length is 2 minutes 20 seconds");
			suggestions.push("Keep it concise for better engagement");
			suggestions.push("Add captions - Twitter autoplays muted");
			break;

		case "linkedin":
			suggestions.push("Professional content performs best");
			suggestions.push("Keep videos under 3 minutes for best engagement");
			suggestions.push("Add subtitles - many watch at work without sound");
			break;

		case "discord":
			warnings.push("Free users have 8MB file size limit");
			suggestions.push("Consider lower resolution for longer videos");
			suggestions.push("Nitro users can upload up to 100MB");
			break;
		default:
			break;
	}

	return { preset, warnings, suggestions };
}

export async function startRendererExportJob({
	dispatch,
	mediaFiles,
	projectId,
	request,
	timeline,
}: {
	dispatch: (request: ClaudeLocalVideoExportRequest) => Promise<void>;
	mediaFiles: MediaFile[];
	projectId: string;
	request: ExportJobRequest;
	timeline: ClaudeTimeline;
}): Promise<{ jobId: string; status: ExportJobStatus["status"] }> {
	if (isTimelineEmpty({ timeline })) {
		throw new Error("Cannot export an empty timeline");
	}
	const activeJob = getActiveJobForProject({ projectId });
	if (activeJob) {
		throw new Error(
			`Export already in progress for project ${projectId} (job: ${activeJob.jobId})`
		);
	}
	assertRendererExportRequestCompatible({ request });

	const settings = resolveExportSettings({ request });
	const outputPath = request.outputPath?.trim()
		? path.resolve(request.outputPath.trim())
		: getDefaultOutputPath({ projectId, format: settings.format });
	const isLocalMp4 =
		settings.format === "mp4" &&
		path.isAbsolute(outputPath) &&
		path.extname(outputPath).toLowerCase() === ".mp4";
	assertLocalFinalVideoExportAllowed({
		mediaItems: mediaFiles,
		operation: "qcut editor:export:start renderer export",
		output: {
			container: settings.format === "mp4" ? "mp4" : "webm",
			destination: isLocalMp4 ? "local-file" : "external",
			kind: "final-video",
		},
		tracks: timeline.tracks,
	});
	if (!isLocalMp4) {
		throw new Error(
			"Sticker runtime export requires an absolute local .mp4 output path."
		);
	}

	const frameRate = rendererExportFrameRate({ fps: settings.fps });
	const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const now = Date.now();
	const newJob: ExportJobInternal = {
		engine: "renderer-muxer",
		jobId,
		outputPath,
		presetId: settings.presetId,
		progress: 0,
		projectId,
		settings,
		startedAt: now,
		status: EXPORT_JOB_STATUS.queued,
	};
	exportJobs.set(jobId, newJob);
	pruneOldJobs(exportJobs);

	void (async () => {
		try {
			updateJobProgress({ jobId, progress: 0.01 });
			await dispatch({
				...(request.engine === "muxer" ? { engine: "muxer" as const } : {}),
				filename: path.basename(outputPath),
				format: "mp4",
				frameRate,
				height: settings.height,
				// The renderer streams real frame progress back against this id.
				jobId,
				outputPath,
				...(request.profilePath?.trim()
					? { profilePath: path.resolve(request.profilePath.trim()) }
					: {}),
				...(request.disableSequentialDecode === true
					? { disableSequentialDecode: true }
					: {}),
				projectId,
				quality: rendererExportQuality({
					height: settings.height,
					width: settings.width,
				}),
				width: settings.width,
			});
			const outputStats = await fsPromises.stat(outputPath);
			if (!outputStats.isFile() || outputStats.size <= 0) {
				throw new Error(
					"Renderer MP4 export did not produce a non-empty file."
				);
			}
			newJob.fileSize = outputStats.size;
			updateJobProgress({ jobId, progress: 1 });
		} catch (error) {
			newJob.completedAt = Date.now();
			newJob.error = error instanceof Error ? error.message : String(error);
			newJob.status = EXPORT_JOB_STATUS.failed;
		}
	})();

	return { jobId, status: EXPORT_JOB_STATUS.queued };
}

export async function startExportJob({
	projectId,
	request,
	timeline,
	mediaFiles,
}: {
	projectId: string;
	request: ExportJobRequest;
	timeline: ClaudeTimeline;
	mediaFiles: MediaFile[];
}): Promise<{ jobId: string; status: ExportJobStatus["status"] }> {
	try {
		if (request.engine === "muxer") {
			throw new Error(
				"The muxer engine runs in the renderer; this timeline resolved to " +
					"the native export path. Use --engine auto or cli here."
			);
		}
		if (isTimelineEmpty({ timeline })) {
			throw new Error("Cannot export an empty timeline");
		}

		const activeJob = getActiveJobForProject({ projectId });
		if (activeJob) {
			throw new Error(
				`Export already in progress for project ${projectId} (job: ${activeJob.jobId})`
			);
		}

		const settings = resolveExportSettings({ request });
		const outputPath = request.outputPath?.trim()
			? path.resolve(request.outputPath.trim())
			: getDefaultOutputPath({
					projectId,
					format: settings.format,
				});
		const isLocalMp4 =
			settings.format === "mp4" &&
			path.extname(outputPath).toLowerCase() === ".mp4";
		const localVideoOutput = {
			container:
				settings.format === "mp4" ? ("mp4" as const) : ("webm" as const),
			destination: isLocalMp4 ? ("local-file" as const) : ("external" as const),
			kind: "final-video" as const,
		};
		assertLocalFinalVideoExportAllowed({
			mediaItems: mediaFiles,
			operation: "qcut editor:export:start native export",
			output: localVideoOutput,
			tracks: timeline.tracks,
		});
		const nonStickerResolvedMediaFiles: MediaFile[] = [];
		const stickerResolvedMediaFiles: MediaFile[] = [];
		const segments = await collectExportSegments({
			timeline,
			mediaFiles,
			projectId,
			resolvedMediaFiles: nonStickerResolvedMediaFiles,
		});

		if (segments.length === 0) {
			throw new Error(
				"No exportable segments found (no video or image media on timeline)"
			);
		}
		const videoTransitions = collectVideoTransitions({ timeline, segments });
		if (videoTransitions.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${videoTransitions.length} video transition(s) to render`
			);
		}

		// Collect sticker overlays for compositing
		const stickerOverlays = await collectStickerOverlays({
			timeline,
			mediaFiles,
			projectId,
			resolvedMediaFiles: stickerResolvedMediaFiles,
			settings,
		});
		if (stickerOverlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${stickerOverlays.length} sticker(s) to overlay during export`
			);
		}
		const jianyingTextOverlays = collectJianyingTextOverlays({ timeline });
		if (jianyingTextOverlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${jianyingTextOverlays.length} original Jianying text overlay(s) to render`
			);
		}
		const textOverlays = collectTextOverlays(timeline);
		if (textOverlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${textOverlays.length} text/caption overlay(s) to render`
			);
		}
		const audioFiles = await collectTimelineAudioFiles({
			timeline,
			mediaFiles,
			projectId,
			resolvedMediaFiles: nonStickerResolvedMediaFiles,
		});
		const stickerOverlayMediaIds = stickerOverlays.map(
			(stickerOverlay) => stickerOverlay.mediaId
		);
		const additionalNonStickerMediaIds = nonStickerResolvedMediaFiles.map(
			(mediaFile) => mediaFile.id
		);
		const combinedMediaFiles = [
			...new Map(
				[
					...mediaFiles,
					...nonStickerResolvedMediaFiles,
					...stickerResolvedMediaFiles,
				].map((mediaFile) => [mediaFile.id, mediaFile])
			).values(),
		];
		assertLocalFinalVideoExportAllowed({
			additionalNonStickerMediaIds,
			mediaItems: combinedMediaFiles,
			operation: "qcut editor:export:start hydrated native export",
			output: localVideoOutput,
			stickerOverlayMediaIds,
			tracks: timeline.tracks,
		});
		assertNativeStickerRuntimeExportAllowed({
			additionalMediaIds: stickerOverlayMediaIds,
			mediaItems: combinedMediaFiles,
			operation: "Claude native video export",
			tracks: timeline.tracks,
		});
		if (audioFiles.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${audioFiles.length} independent audio clip(s) to mix`
			);
		}

		const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();

		const newJob: ExportJobInternal = {
			jobId,
			projectId,
			status: EXPORT_JOB_STATUS.queued,
			progress: 0,
			startedAt: now,
			presetId: settings.presetId,
			engine: settings.engine,
			settings,
			outputPath,
		};

		exportJobs.set(jobId, newJob);
		pruneOldJobs(exportJobs);

		logOperation({
			stage: 5,
			action: "export",
			details: `Queued export with preset ${settings.presetId}`,
			timestamp: now,
			projectId,
			metadata: {
				jobId,
				preset: settings.presetId,
			},
		});
		try {
			emitClaudeEvent({
				category: CLAUDE_EDITOR_EVENT_CATEGORY.exportStarted,
				action: CLAUDE_EDITOR_EVENT_ACTION.started,
				correlationId: jobId,
				source: "main.export-handler",
				data: {
					jobId,
					projectId,
					presetId: settings.presetId,
					outputPath,
					status: EXPORT_JOB_STATUS.queued,
				},
			});
		} catch {
			// Telemetry emission must not block export execution
		}

		executeExportJob({
			jobId,
			projectId,
			settings,
			outputPath,
			segments,
			stickerOverlays,
			textOverlays,
			jianyingTextOverlays,
			audioFiles,
			videoTransitions,
			projectFps: timeline.fps,
			projectCanvas:
				timeline.width > 0 && timeline.height > 0
					? { width: timeline.width, height: timeline.height }
					: undefined,
		}).catch((error) => {
			claudeLog.error(
				HANDLER_NAME,
				`Unexpected export failure for ${jobId}:`,
				error
			);
		});

		return {
			jobId,
			status: EXPORT_JOB_STATUS.queued,
		};
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Failed to start export job");
	}
}

export function applyProgressEvent(payload: ProgressEventPayload): void {
	try {
		if (!payload.jobId || typeof payload.progress !== "number") {
			return;
		}

		updateJobProgress({
			jobId: payload.jobId,
			progress: payload.progress,
			currentFrame: payload.currentFrame,
			totalFrames: payload.totalFrames,
			fps: payload.fps,
			estimatedTimeRemaining: payload.estimatedTimeRemaining,
		});
	} catch (error) {
		claudeLog.warn(HANDLER_NAME, "Failed to apply progress event:", error);
	}
}
