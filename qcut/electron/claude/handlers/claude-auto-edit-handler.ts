/**
 * Claude Auto-Edit Handler
 * Orchestrates transcription + filler detection + batch cut execution
 * to automatically remove filler words and silences from a video element.
 */

import type { BrowserWindow } from "electron";
import { claudeLog } from "../utils/logger.js";
import { sanitizeProjectId } from "../utils/helpers.js";
import { HttpError } from "../utils/http-router.js";
import { transcribeMedia } from "./claude-transcribe-handler.js";
import { analyzeFillers } from "./claude-filler-handler.js";
import { executeBatchCuts } from "./claude-cuts-handler.js";
import { requestTimelineFromRenderer } from "./claude-timeline-handler.js";
import { assertRendererWindowReady } from "../utils/renderer-ipc-guard.js";
import type {
	AutoEditJob,
	AutoEditRequest,
	AutoEditResponse,
	AutoEditCutInfo,
	CutInterval,
	BatchCutResponse,
	AutoEditFailureDetails,
	AutoEditFailureStage,
} from "../../types/claude-api";
import { AUTO_EDIT_FAILURE_STAGES } from "../../types/claude-api";

const HANDLER_NAME = "AutoEdit";

const AUTO_EDIT_FAILURE_HINTS: Record<AutoEditFailureStage, string> = {
	[AUTO_EDIT_FAILURE_STAGES.PREPARE]:
		"Validate request payload and media/element identifiers.",
	[AUTO_EDIT_FAILURE_STAGES.TIMELINE]:
		"Check renderer timeline IPC responders and window readiness.",
	[AUTO_EDIT_FAILURE_STAGES.TRANSCRIBE]:
		"Check transcription provider/API key and media file accessibility.",
	[AUTO_EDIT_FAILURE_STAGES.ANALYZE]:
		"Check filler analysis inputs and analyzer service availability.",
	[AUTO_EDIT_FAILURE_STAGES.BUILD_CUTS]:
		"Verify timing data and silence threshold/padding configuration.",
	[AUTO_EDIT_FAILURE_STAGES.APPLY_CUTS]:
		"Check batch-cuts IPC bridge and renderer cut execution handlers.",
	[AUTO_EDIT_FAILURE_STAGES.UNKNOWN]:
		"Inspect auto-edit logs around transcription, analysis, and cut execution.",
};

class AutoEditStageError extends HttpError {
	details: AutoEditFailureDetails;

	constructor({
		status,
		message,
		details,
	}: {
		status: number;
		message: string;
		details: AutoEditFailureDetails;
	}) {
		super(status, message);
		this.details = details;
	}
}

function inferAutoEditFailureProcess({
	message,
}: {
	message: string;
}): "main" | "utility" | "renderer" | "unknown" {
	try {
		const normalized = message.toLowerCase();
		if (
			normalized.includes("editor window") ||
			normalized.includes("renderer") ||
			normalized.includes("timeline")
		) {
			return "renderer";
		}
		if (normalized.includes("ipc bridge")) {
			return "main";
		}
		return "unknown";
	} catch {
		return "unknown";
	}
}

function toAutoEditStageError({
	error,
	stage,
	action,
}: {
	error: unknown;
	stage: AutoEditFailureStage;
	action: string;
}): AutoEditStageError {
	try {
		const status = error instanceof HttpError ? error.status : 500;
		const baseMessage =
			error instanceof HttpError
				? error.message
				: "Auto-edit pipeline failed";
		const cause =
			error instanceof Error
				? error.message
				: typeof error === "string"
					? error
					: "Unknown auto-edit error";
		const details: AutoEditFailureDetails = {
			stage,
			process: inferAutoEditFailureProcess({ message: cause }),
			action,
			message: baseMessage,
			hint:
				AUTO_EDIT_FAILURE_HINTS[stage] ??
				AUTO_EDIT_FAILURE_HINTS[AUTO_EDIT_FAILURE_STAGES.UNKNOWN],
			statusCode: status,
			cause,
			timestamp: Date.now(),
		};
		return new AutoEditStageError({
			status,
			message: baseMessage,
			details,
		});
	} catch (conversionError) {
		const fallbackDetails: AutoEditFailureDetails = {
			stage: AUTO_EDIT_FAILURE_STAGES.UNKNOWN,
			process: "unknown",
			action,
			message: "Auto-edit pipeline failed",
			hint: AUTO_EDIT_FAILURE_HINTS[AUTO_EDIT_FAILURE_STAGES.UNKNOWN],
			statusCode: 500,
			cause:
				conversionError instanceof Error
					? conversionError.message
					: "Unknown conversion error",
			timestamp: Date.now(),
		};
		return new AutoEditStageError({
			status: 500,
			message: "Auto-edit pipeline failed",
			details: fallbackDetails,
		});
	}
}

function getAutoEditFailureDetails({
	error,
}: {
	error: unknown;
}): AutoEditFailureDetails | undefined {
	try {
		if (error instanceof AutoEditStageError) {
			return error.details;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

// ============================================================================
// Async Job Tracking
// ============================================================================

const autoEditJobs = new Map<string, AutoEditJob>();
const MAX_AUTO_EDIT_JOBS = 50;

function pruneOldAutoEditJobs(): void {
	if (autoEditJobs.size <= MAX_AUTO_EDIT_JOBS) return;
	const entries = [...autoEditJobs.entries()].sort(
		(a, b) => a[1].createdAt - b[1].createdAt
	);
	const toRemove = entries.slice(0, entries.length - MAX_AUTO_EDIT_JOBS);
	for (const [id] of toRemove) {
		autoEditJobs.delete(id);
	}
}

/**
 * Start an auto-edit job. Returns immediately with a job ID.
 * The pipeline runs in the background; poll with getAutoEditJobStatus().
 */
export function startAutoEditJob(
	projectId: string,
	request: AutoEditRequest,
	win?: BrowserWindow
): { jobId: string } {
	const jobId = `autoedit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

	const job: AutoEditJob = {
		jobId,
		projectId,
		mediaId: request.mediaId,
		elementId: request.elementId,
		status: "queued",
		progress: 0,
		message: "Queued",
		createdAt: Date.now(),
	};

	autoEditJobs.set(jobId, job);
	pruneOldAutoEditJobs();

	claudeLog.info(
		HANDLER_NAME,
		`Job ${jobId} created for project ${projectId}, element ${request.elementId}`
	);

	// Fire-and-forget — run pipeline in background
	runAutoEditJob(jobId, projectId, request, win).catch((err) => {
		claudeLog.error(HANDLER_NAME, `Job ${jobId} unexpected error:`, err);
	});

	return { jobId };
}

/** Get the current status of an auto-edit job. */
export function getAutoEditJobStatus(jobId: string): AutoEditJob | null {
	return autoEditJobs.get(jobId) ?? null;
}

/** List all auto-edit jobs, sorted newest-first. */
export function listAutoEditJobs(): AutoEditJob[] {
	return [...autoEditJobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Cancel a running auto-edit job. */
export function cancelAutoEditJob(jobId: string): boolean {
	const job = autoEditJobs.get(jobId);
	if (!job || job.status === "completed" || job.status === "failed") {
		return false;
	}
	job.status = "cancelled";
	job.message = "Cancelled by user";
	job.completedAt = Date.now();
	claudeLog.info(HANDLER_NAME, `Job ${jobId} cancelled`);
	return true;
}

/** For tests: clear all jobs. */
export function _clearAutoEditJobs(): void {
	autoEditJobs.clear();
}

/** Run auto-edit pipeline in the background, updating job progress. */
async function runAutoEditJob(
	jobId: string,
	projectId: string,
	request: AutoEditRequest,
	win?: BrowserWindow
): Promise<void> {
	const job = autoEditJobs.get(jobId);
	if (!job) return;

	job.status = "processing";
	job.progress = 10;
	job.message = "Starting auto-edit pipeline...";

	try {
		const result = await autoEdit(projectId, request, win);

		if (autoEditJobs.get(jobId)?.status === "cancelled") return;

		job.status = "completed";
		job.progress = 100;
		job.message = `Done: ${result.cuts.length} cuts${result.applied ? " applied" : " (dry run)"}`;
		job.result = result;
		job.completedAt = Date.now();

		claudeLog.info(
			HANDLER_NAME,
			`Job ${jobId} completed: ${result.cuts.length} cuts`
		);
	} catch (err) {
		if (autoEditJobs.get(jobId)?.status === "cancelled") return;
		const failureDetails = getAutoEditFailureDetails({ error: err });
		job.status = "failed";
		job.message = failureDetails?.message ?? "Auto-edit failed";
		if (failureDetails) {
			job.errorDetails = failureDetails;
		}
		job.completedAt = Date.now();
		claudeLog.error(HANDLER_NAME, `Job ${jobId} failed:`, err);
	}
}

/**
 * Merge overlapping or adjacent cut intervals.
 * Inputs are sorted by start time ascending before merge.
 */
export function mergeCutIntervals(cuts: AutoEditCutInfo[]): AutoEditCutInfo[] {
	if (cuts.length <= 1) return cuts;

	const sorted = [...cuts].sort((a, b) => a.start - b.start);
	const merged: AutoEditCutInfo[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const last = merged[merged.length - 1];
		const current = sorted[i];

		if (current.start <= last.end) {
			// Overlapping or adjacent — extend the last interval
			last.end = Math.max(last.end, current.end);
			last.reason = `${last.reason}; ${current.reason}`;
		} else {
			merged.push(current);
		}
	}

	return merged;
}

/**
 * Auto-edit a video element: transcribe, detect fillers/silences, and cut them.
 */
export async function autoEdit(
	projectId: string,
	request: AutoEditRequest,
	win?: BrowserWindow
): Promise<AutoEditResponse> {
	let currentStage: AutoEditFailureStage = AUTO_EDIT_FAILURE_STAGES.PREPARE;
	const safeProjectId = sanitizeProjectId(projectId);

	if (!request.elementId) {
		throw new HttpError(400, "Missing 'elementId'");
	}
	if (!request.mediaId) {
		throw new HttpError(400, "Missing 'mediaId'");
	}

	const removeFillers = request.removeFillers !== false;
	const removeSilences = request.removeSilences !== false;
	const silenceThreshold = request.silenceThreshold ?? 1.0;
	const keepSilencePadding = request.keepSilencePadding ?? 0.3;
	const dryRun = request.dryRun ?? false;

	claudeLog.info(
		HANDLER_NAME,
		`Auto-edit: project=${safeProjectId}, element=${request.elementId}, fillers=${removeFillers}, silences=${removeSilences}, dryRun=${dryRun}`
	);

	// Step 1: Get element info to map media-time → timeline-time
	let elementStartTime = 0;
	let elementTrimStart = 0;
	if (win) {
		try {
			currentStage = AUTO_EDIT_FAILURE_STAGES.TIMELINE;
			const timeline = await requestTimelineFromRenderer(win);
			for (const track of timeline.tracks) {
				const el = track.elements.find((e) => e.id === request.elementId);
				if (el) {
					elementStartTime = el.startTime;
					elementTrimStart = el.trimStart ?? 0;
					break;
				}
			}
		} catch {
			claudeLog.warn(HANDLER_NAME, "Could not get timeline, using offset 0");
		}
	}

	try {
		// Step 2: Transcribe
		currentStage = AUTO_EDIT_FAILURE_STAGES.TRANSCRIBE;
		const transcription = await transcribeMedia(safeProjectId, {
			mediaId: request.mediaId,
			provider: request.provider,
			language: request.language,
		});

		claudeLog.info(
			HANDLER_NAME,
			`Transcribed: ${transcription.words.length} words, ${transcription.duration}s`
		);

		// Step 3: Analyze fillers
		const fillerInput = transcription.words.map((w, i) => ({
			id: `w_${i}`,
			text: w.text,
			start: w.start,
			end: w.end,
			type: w.type === "word" ? ("word" as const) : ("spacing" as const),
			speaker_id: w.speaker ?? undefined,
		}));

		currentStage = AUTO_EDIT_FAILURE_STAGES.ANALYZE;
		const analysis = await analyzeFillers(safeProjectId, {
			mediaId: request.mediaId,
			words: fillerInput,
		});

		claudeLog.info(
			HANDLER_NAME,
			`Analysis: ${analysis.fillers.length} fillers, ${analysis.silences.length} silences`
		);

		// Step 4: Build cut list from fillers and silences
		currentStage = AUTO_EDIT_FAILURE_STAGES.BUILD_CUTS;
		const cuts: AutoEditCutInfo[] = [];

		if (removeFillers) {
			for (const filler of analysis.fillers) {
				cuts.push({
					start: filler.start + elementStartTime + elementTrimStart,
					end: filler.end + elementStartTime + elementTrimStart,
					reason: `filler: ${filler.word}`,
				});
			}
		}

		if (removeSilences) {
			for (const silence of analysis.silences) {
				if (silence.duration < silenceThreshold) continue;

				// Keep padding on both sides of silence
				const paddedStart = silence.start + keepSilencePadding;
				const paddedEnd = silence.end - keepSilencePadding;

				if (paddedStart < paddedEnd) {
					cuts.push({
						start: paddedStart + elementStartTime + elementTrimStart,
						end: paddedEnd + elementStartTime + elementTrimStart,
						reason: `silence: ${silence.duration.toFixed(1)}s`,
					});
				}
			}
		}

		// Merge overlapping cuts
		const mergedCuts = mergeCutIntervals(cuts);

		const totalCutDuration = mergedCuts.reduce(
			(sum, c) => sum + (c.end - c.start),
			0
		);

		claudeLog.info(
			HANDLER_NAME,
			`Built ${mergedCuts.length} cuts (${totalCutDuration.toFixed(1)}s total)`
		);

		// Step 5: Optionally execute
		let applied = false;
		let result: BatchCutResponse | undefined;

		if (!dryRun && mergedCuts.length > 0) {
			currentStage = AUTO_EDIT_FAILURE_STAGES.APPLY_CUTS;
			try {
				assertRendererWindowReady({
					win,
					action: "auto-edit cut execution",
				});
			} catch (error) {
				if (error instanceof HttpError && error.status === 503) {
					throw new HttpError(503, "Editor window not ready");
				}
				throw error;
			}
			if (!win) {
				throw new HttpError(503, "Editor window not ready");
			}

			const cutIntervals: CutInterval[] = mergedCuts.map((c) => ({
				start: c.start,
				end: c.end,
			}));

			result = await executeBatchCuts(win, {
				elementId: request.elementId,
				cuts: cutIntervals,
				ripple: true,
			});
			applied = true;

			claudeLog.info(
				HANDLER_NAME,
				`Applied ${result.cutsApplied} cuts, removed ${result.totalRemovedDuration}s`
			);
		}

		return {
			transcription: {
				wordCount: transcription.words.length,
				duration: transcription.duration,
			},
			analysis: {
				fillerCount: analysis.fillers.length,
				silenceCount: analysis.silences.length,
				totalFillerTime: analysis.totalFillerTime,
				totalSilenceTime: analysis.totalSilenceTime,
			},
			cuts: mergedCuts,
			applied,
			result,
		};
	} catch (error) {
		const wrappedError = toAutoEditStageError({
			error,
			stage: currentStage,
			action: "auto-edit pipeline execution",
		});
		claudeLog.error(
			HANDLER_NAME,
			`Auto-edit pipeline failed at stage '${wrappedError.details.stage}': ${wrappedError.details.cause ?? wrappedError.message}`
		);
		throw wrappedError;
	}
}
