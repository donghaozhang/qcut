/**
 * Public API functions for Claude Export Handler.
 * @module electron/claude/handlers/claude-export-handler/public-api
 */

import { claudeLog } from "../../utils/logger.js";
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
	collectStickerOverlays,
	executeExportJob,
} from "./export-engine.js";

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
		const segments = await collectExportSegments({
			timeline,
			mediaFiles,
			projectId,
		});

		if (segments.length === 0) {
			throw new Error(
				"No exportable segments found (no video or image media on timeline)"
			);
		}

		// Collect sticker overlays for compositing
		const stickerOverlays = await collectStickerOverlays({
			timeline,
			mediaFiles,
			projectId,
		});
		if (stickerOverlays.length > 0) {
			claudeLog.info(
				HANDLER_NAME,
				`Found ${stickerOverlays.length} sticker(s) to overlay during export`
			);
		}

		const outputPath = request.outputPath?.trim()
			? request.outputPath.trim()
			: getDefaultOutputPath({
					projectId,
					format: settings.format,
				});

		const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const now = Date.now();

		const newJob: ExportJobInternal = {
			jobId,
			projectId,
			status: EXPORT_JOB_STATUS.queued,
			progress: 0,
			startedAt: now,
			presetId: settings.presetId,
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
