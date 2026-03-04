/**
 * Claude HTTP Analysis & Editing Routes
 * Registers video analysis, transcription, scene detection, filler analysis,
 * and Stage 3 cut/edit routes on the HTTP router.
 */

import type { Router } from "../utils/http-router.js";
import { HttpError } from "../utils/http-router.js";
import {
	analyzeVideo,
	listAnalyzeModels,
} from "../handlers/claude-analyze-handler.js";
import {
	transcribeMedia,
	startTranscribeJob,
	getTranscribeJobStatus,
	listTranscribeJobs,
	cancelTranscribeJob,
} from "../handlers/claude-transcribe-handler.js";
import { detectScenes } from "../handlers/claude-scene-handler.js";
import { analyzeFrames } from "../handlers/claude-vision-handler.js";
import { analyzeFillers } from "../handlers/claude-filler-handler.js";
import { executeBatchCuts } from "../handlers/claude-cuts-handler.js";
import { executeDeleteRange } from "../handlers/claude-range-handler.js";
import {
	autoEdit,
	startAutoEditJob,
	getAutoEditJobStatus,
	listAutoEditJobs,
	cancelAutoEditJob,
} from "../handlers/claude-auto-edit-handler.js";
import {
	suggestCuts,
	startSuggestJob,
	getSuggestJobStatus,
	listSuggestJobs,
	cancelSuggestJob,
} from "../handlers/claude-suggest-handler.js";
import { logOperation } from "../claude-operation-log.js";
import { getMediaInfo } from "../handlers/claude-media-handler.js";
import type { BrowserWindow } from "electron";

// ---------------------------------------------------------------------------
// Helpers for word normalization (used by load-speech + transcribe-and-load)
// ---------------------------------------------------------------------------

interface RawWord {
	text: string;
	start: number;
	end: number;
	type?: string;
	speaker_id?: string | null;
	speaker?: string;
}

function buildTextFromWords(words: RawWord[]): string {
	return words
		.filter((w) => (w.type ?? "word") === "word" || w.type === "spacing")
		.map((w) => w.text)
		.join("");
}

function normalizeWords(words: RawWord[]): Array<{
	text: string;
	start: number;
	end: number;
	type: string;
	speaker_id: string | null;
}> {
	return words.map((w) => ({
		text: w.text,
		start: w.start,
		end: w.end,
		type: w.type ?? "word",
		speaker_id: w.speaker_id ?? w.speaker ?? null,
	}));
}

/**
 * Register analysis, transcription, and Stage 3 editing routes on the router.
 */
export function registerAnalysisRoutes(
	router: Router,
	getWindow: () => BrowserWindow
): void {
	// ==========================================================================
	// Video Analysis routes
	// ==========================================================================
	router.post("/api/claude/analyze/:projectId", async (req) => {
		if (!req.body?.source) {
			throw new HttpError(400, "Missing 'source' in request body");
		}
		try {
			const result = await analyzeVideo(req.params.projectId, {
				source: req.body.source,
				analysisType: req.body.analysisType,
				model: req.body.model,
				format: req.body.format,
			});
			if (!result.success) {
				throw new HttpError(500, result.error);
			}
			return result;
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Analysis failed"
			);
		}
	});

	router.get("/api/claude/analyze/models", async () => {
		return listAnalyzeModels();
	});

	// ==========================================================================
	// Transcription routes (Stage 2)
	// ==========================================================================
	router.post("/api/claude/transcribe/:projectId", async (req) => {
		if (!req.body?.mediaId && !req.body?.source) {
			throw new HttpError(400, "Missing 'mediaId' or 'source' in request body");
		}
		try {
			const result = await transcribeMedia(req.params.projectId, {
				mediaId: req.body.mediaId,
				source: req.body.source,
				provider: req.body.provider,
				language: req.body.language,
				diarize: req.body.diarize,
			});
			const sourceDesc =
				req.body.source?.filePath || req.body.mediaId || "unknown";
			logOperation({
				stage: 2,
				action: "transcribe",
				details: `Transcribed media ${sourceDesc}`,
				timestamp: Date.now(),
				projectId: req.params.projectId,
				metadata: {
					mediaId: req.body.mediaId,
					source: req.body.source,
					provider: req.body.provider,
				},
			});
			return result;
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Transcription failed"
			);
		}
	});

	// Async transcription routes (preferred — avoids 30s HTTP timeout)
	router.post("/api/claude/transcribe/:projectId/start", async (req) => {
		if (!req.body?.mediaId && !req.body?.source) {
			throw new HttpError(400, "Missing 'mediaId' or 'source' in request body");
		}
		const { jobId } = startTranscribeJob(req.params.projectId, {
			mediaId: req.body.mediaId,
			source: req.body.source,
			provider: req.body.provider,
			language: req.body.language,
			diarize: req.body.diarize,
		});
		return { jobId };
	});

	router.get("/api/claude/transcribe/:projectId/jobs/:jobId", async (req) => {
		const job = getTranscribeJobStatus(req.params.jobId);
		if (!job) {
			throw new HttpError(404, `Job not found: ${req.params.jobId}`);
		}
		return job;
	});

	router.get("/api/claude/transcribe/:projectId/jobs", async (req) => {
		const allJobs = listTranscribeJobs();
		return allJobs.filter((job) => job.projectId === req.params.projectId);
	});

	router.post(
		"/api/claude/transcribe/:projectId/jobs/:jobId/cancel",
		async (req) => {
			const cancelled = cancelTranscribeJob(req.params.jobId);
			return { cancelled };
		}
	);

	// ==========================================================================
	// Smart Speech (load transcription into Word Timeline panel)
	// ==========================================================================

	// Load pre-existing transcription data into the Smart Speech panel
	router.post("/api/claude/transcribe/:projectId/load-speech", async (req) => {
		if (!req.body?.words || !Array.isArray(req.body.words)) {
			throw new HttpError(400, "Missing 'words' array in request body");
		}
		if (req.body.words.length === 0) {
			throw new HttpError(400, "Empty 'words' array in request body");
		}
		try {
			const win = getWindow();
			const words: RawWord[] = req.body.words;
			win.webContents.send("claude:speech:load", {
				text: req.body.text ?? buildTextFromWords(words),
				language_code: req.body.language_code ?? req.body.language ?? "unknown",
				language_probability: req.body.language_probability ?? 0,
				words: normalizeWords(words),
				fileName:
					req.body.fileName ?? `transcription_${req.params.projectId}.json`,
			});

			// Add media to timeline if mediaId provided
			if (req.body.mediaId) {
				const media = await getMediaInfo(
					req.params.projectId,
					req.body.mediaId
				);
				if (media) {
					const elementId = `element_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
					win.webContents.send("claude:timeline:addElement", {
						id: elementId,
						type: "media",
						mediaId: req.body.mediaId,
						startTime: 0,
						duration: media.duration ?? 0,
						sourceName: media.name,
					});
				}
			}

			return { loaded: true };
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Load speech failed"
			);
		}
	});

	// Transcribe media and load result directly into Smart Speech panel
	router.post(
		"/api/claude/transcribe/:projectId/transcribe-and-load",
		async (req) => {
			if (!req.body?.mediaId && !req.body?.source) {
				throw new HttpError(
					400,
					"Missing 'mediaId' or 'source' in request body"
				);
			}
			try {
				const result = await transcribeMedia(req.params.projectId, {
					mediaId: req.body.mediaId,
					source: req.body.source,
					provider: req.body.provider,
					language: req.body.language,
					diarize: req.body.diarize,
				});
				if (
					!result?.words ||
					!Array.isArray(result.words) ||
					result.words.length === 0
				) {
					throw new HttpError(500, "Transcription produced no words");
				}
				const sourceDesc =
					req.body.source?.filePath || req.body.mediaId || "unknown";
				const win = getWindow();
				win.webContents.send("claude:speech:load", {
					text: buildTextFromWords(result.words),
					language_code: result.language ?? "unknown",
					language_probability: 0,
					words: normalizeWords(result.words),
					fileName: `transcription_${sourceDesc.replace(/[/\\]/g, "_")}.json`,
				});
				// Add media to timeline (only when using mediaId, not path source)
				if (req.body.mediaId) {
					const media = await getMediaInfo(
						req.params.projectId,
						req.body.mediaId
					);
					if (media) {
						const elementId = `element_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
						win.webContents.send("claude:timeline:addElement", {
							id: elementId,
							type: "media",
							mediaId: req.body.mediaId,
							startTime: 0,
							duration: media.duration ?? result.duration ?? 0,
							sourceName: media.name,
						});
					}
				}

				logOperation({
					stage: 2,
					action: "transcribe-and-load",
					details: `Transcribed and loaded to Smart Speech: ${sourceDesc}`,
					timestamp: Date.now(),
					projectId: req.params.projectId,
					metadata: {
						mediaId: req.body.mediaId,
						source: req.body.source,
					},
				});
				return {
					loaded: true,
					wordCount: result.words.filter((w) => (w.type ?? "word") === "word")
						.length,
					duration: result.duration,
				};
			} catch (error) {
				if (error instanceof HttpError) throw error;
				throw new HttpError(
					500,
					error instanceof Error ? error.message : "Transcribe and load failed"
				);
			}
		}
	);

	// ==========================================================================
	// Scene Detection routes (Stage 2)
	// ==========================================================================
	router.post("/api/claude/analyze/:projectId/scenes", async (req) => {
		if (!req.body?.mediaId) {
			throw new HttpError(400, "Missing 'mediaId' in request body");
		}
		try {
			const result = await detectScenes(req.params.projectId, {
				mediaId: req.body.mediaId,
				threshold: req.body.threshold,
				aiAnalysis: req.body.aiAnalysis,
				model: req.body.model,
			});
			logOperation({
				stage: 2,
				action: "analyze-scenes",
				details: `Detected scenes for media ${req.body.mediaId}`,
				timestamp: Date.now(),
				projectId: req.params.projectId,
				metadata: { mediaId: req.body.mediaId, model: req.body.model },
			});
			return result;
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Scene detection failed"
			);
		}
	});

	// ==========================================================================
	// Frame Analysis routes (Stage 2)
	// ==========================================================================
	router.post("/api/claude/analyze/:projectId/frames", async (req) => {
		if (!req.body?.mediaId) {
			throw new HttpError(400, "Missing 'mediaId' in request body");
		}
		try {
			return await analyzeFrames(req.params.projectId, {
				mediaId: req.body.mediaId,
				timestamps: req.body.timestamps,
				interval: req.body.interval,
				prompt: req.body.prompt,
			});
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Frame analysis failed"
			);
		}
	});

	// ==========================================================================
	// Filler Detection routes (Stage 2)
	// ==========================================================================
	router.post("/api/claude/analyze/:projectId/fillers", async (req) => {
		const projectId = req.params.projectId;
		try {
			let words = req.body?.words;

			// Mode 1: words provided directly
			// Mode 2: auto-transcribe from mediaId
			if (!Array.isArray(words)) {
				if (!req.body?.mediaId) {
					throw new HttpError(
						400,
						"Provide 'words' array or 'mediaId' for auto-transcription"
					);
				}
				const transcription = await transcribeMedia(projectId, {
					mediaId: req.body.mediaId,
					provider: req.body.provider,
					language: req.body.language,
				});
				words = transcription?.words;
				if (!Array.isArray(words) || words.length === 0) {
					throw new HttpError(
						400,
						"Transcription produced no words for filler analysis"
					);
				}
			}

			const result = await analyzeFillers(projectId, {
				mediaId: req.body.mediaId,
				words,
			});
			logOperation({
				stage: 2,
				action: "analyze-fillers",
				details: `Analyzed filler words for media ${req.body.mediaId ?? "unknown"}`,
				timestamp: Date.now(),
				projectId,
			});
			return result;
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Filler analysis failed"
			);
		}
	});

	// ==========================================================================
	// Batch Cut-List routes (Stage 3)
	// ==========================================================================
	router.post("/api/claude/timeline/:projectId/cuts", async (req) => {
		if (!req.body?.elementId || !Array.isArray(req.body?.cuts)) {
			throw new HttpError(
				400,
				"Missing 'elementId' and 'cuts' array in request body"
			);
		}
		const win = getWindow();
		return Promise.race([
			executeBatchCuts(win, {
				elementId: req.body.elementId,
				cuts: req.body.cuts,
				ripple: req.body.ripple,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new HttpError(504, "Renderer timed out")),
					30_000
				)
			),
		]);
	});

	// ==========================================================================
	// Range Delete routes (Stage 3)
	// ==========================================================================
	router.delete("/api/claude/timeline/:projectId/range", async (req) => {
		if (
			typeof req.body?.startTime !== "number" ||
			typeof req.body?.endTime !== "number"
		) {
			throw new HttpError(
				400,
				"Missing 'startTime' and 'endTime' in request body"
			);
		}
		const win = getWindow();
		return Promise.race([
			executeDeleteRange(win, {
				startTime: req.body.startTime,
				endTime: req.body.endTime,
				trackIds: req.body.trackIds,
				ripple: req.body.ripple,
				crossTrackRipple: req.body.crossTrackRipple,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new HttpError(504, "Renderer timed out")),
					30_000
				)
			),
		]);
	});

	// ==========================================================================
	// Auto-Edit routes (Stage 3)
	// ==========================================================================
	router.post("/api/claude/timeline/:projectId/auto-edit", async (req) => {
		if (!req.body?.elementId && !req.body?.mediaId) {
			throw new HttpError(
				400,
				"Missing 'elementId' and 'mediaId' in request body"
			);
		}
		if (!req.body?.elementId) {
			throw new HttpError(400, "Missing 'elementId' in request body");
		}
		if (!req.body?.mediaId) {
			throw new HttpError(400, "Missing 'mediaId' in request body");
		}
		const win = getWindow();
		try {
			return await autoEdit(
				req.params.projectId,
				{
					elementId: req.body.elementId,
					mediaId: req.body.mediaId,
					removeFillers: req.body.removeFillers,
					removeSilences: req.body.removeSilences,
					silenceThreshold: req.body.silenceThreshold,
					keepSilencePadding: req.body.keepSilencePadding,
					dryRun: req.body.dryRun,
					provider: req.body.provider,
					language: req.body.language,
				},
				win
			);
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Auto-edit failed"
			);
		}
	});

	// ==========================================================================
	// Cut Suggestions routes (Stage 3)
	// ==========================================================================
	router.post("/api/claude/analyze/:projectId/suggest-cuts", async (req) => {
		if (!req.body?.mediaId) {
			throw new HttpError(400, "Missing 'mediaId' in request body");
		}
		try {
			return await suggestCuts(req.params.projectId, {
				mediaId: req.body.mediaId,
				provider: req.body.provider,
				language: req.body.language,
				sceneThreshold: req.body.sceneThreshold,
				includeFillers: req.body.includeFillers,
				includeSilences: req.body.includeSilences,
				includeScenes: req.body.includeScenes,
			});
		} catch (error) {
			if (error instanceof HttpError) throw error;
			throw new HttpError(
				500,
				error instanceof Error ? error.message : "Suggest cuts failed"
			);
		}
	});

	// Async suggest-cuts routes (preferred — avoids HTTP timeout on long videos)
	router.post(
		"/api/claude/analyze/:projectId/suggest-cuts/start",
		async (req) => {
			if (!req.body?.mediaId) {
				throw new HttpError(400, "Missing 'mediaId' in request body");
			}
			const { jobId } = startSuggestJob(req.params.projectId, {
				mediaId: req.body.mediaId,
				provider: req.body.provider,
				language: req.body.language,
				sceneThreshold: req.body.sceneThreshold,
				includeFillers: req.body.includeFillers,
				includeSilences: req.body.includeSilences,
				includeScenes: req.body.includeScenes,
			});
			return { jobId };
		}
	);

	router.get(
		"/api/claude/analyze/:projectId/suggest-cuts/jobs/:jobId",
		async (req) => {
			const job = getSuggestJobStatus(req.params.jobId);
			if (!job || job.projectId !== req.params.projectId) {
				throw new HttpError(404, `Job not found: ${req.params.jobId}`);
			}
			return job;
		}
	);

	router.get(
		"/api/claude/analyze/:projectId/suggest-cuts/jobs",
		async (req) => {
			const allJobs = listSuggestJobs();
			return allJobs.filter((job) => job.projectId === req.params.projectId);
		}
	);

	router.post(
		"/api/claude/analyze/:projectId/suggest-cuts/jobs/:jobId/cancel",
		async (req) => {
			const cancelled = cancelSuggestJob(req.params.jobId);
			return { cancelled };
		}
	);

	// ==========================================================================
	// Async Auto-Edit routes (preferred — avoids HTTP timeout on long videos)
	// ==========================================================================
	router.post(
		"/api/claude/timeline/:projectId/auto-edit/start",
		async (req) => {
			if (!req.body?.elementId && !req.body?.mediaId) {
				throw new HttpError(
					400,
					"Missing 'elementId' and 'mediaId' in request body"
				);
			}
			if (!req.body?.elementId) {
				throw new HttpError(400, "Missing 'elementId' in request body");
			}
			if (!req.body?.mediaId) {
				throw new HttpError(400, "Missing 'mediaId' in request body");
			}
			const win = getWindow();
			const { jobId } = startAutoEditJob(
				req.params.projectId,
				{
					elementId: req.body.elementId,
					mediaId: req.body.mediaId,
					removeFillers: req.body.removeFillers,
					removeSilences: req.body.removeSilences,
					silenceThreshold: req.body.silenceThreshold,
					keepSilencePadding: req.body.keepSilencePadding,
					dryRun: req.body.dryRun,
					provider: req.body.provider,
					language: req.body.language,
				},
				win
			);
			return { jobId };
		}
	);

	router.get(
		"/api/claude/timeline/:projectId/auto-edit/jobs/:jobId",
		async (req) => {
			const job = getAutoEditJobStatus(req.params.jobId);
			if (!job || job.projectId !== req.params.projectId) {
				throw new HttpError(404, `Job not found: ${req.params.jobId}`);
			}
			return job;
		}
	);

	router.get("/api/claude/timeline/:projectId/auto-edit/jobs", async (req) => {
		const allJobs = listAutoEditJobs();
		return allJobs.filter((job) => job.projectId === req.params.projectId);
	});

	router.post(
		"/api/claude/timeline/:projectId/auto-edit/jobs/:jobId/cancel",
		async (req) => {
			const cancelled = cancelAutoEditJob(req.params.jobId);
			return { cancelled };
		}
	);
}

// CommonJS export for compatibility
module.exports = { registerAnalysisRoutes };
