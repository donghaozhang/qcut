/**
 * Claude Video Analysis Handler
 * Runs video analysis via the native pipeline executor (FAL API).
 * Returns structured markdown/JSON for LLM consumption.
 */

import { ipcMain, BrowserWindow } from "electron";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import {
	getProjectPath,
	isValidSourcePath,
	sanitizeProjectId,
} from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import { getMediaInfo } from "./claude-media-handler.js";
import { requestTimelineFromRenderer } from "./claude-timeline-handler.js";
import { PipelineExecutor } from "../../native-pipeline/execution/executor.js";
import type { PipelineStep } from "../../native-pipeline/execution/executor.js";
import { ModelRegistry } from "../../native-pipeline/infra/registry.js";
import type {
	AnalyzeSource,
	AnalyzeOptions,
	AnalyzeResult,
	AnalyzeModel,
	ClaudeTimeline,
} from "../../types/claude-api";

const HANDLER_NAME = "Analyze";

/** Default native model for video analysis */
const NATIVE_MODEL = "fal_video_qa";

/** Available models for video analysis */
const ANALYZE_MODELS: AnalyzeModel[] = [
	{
		key: "gemini-2.5-flash",
		provider: "fal",
		modelId: "google/gemini-2.5-flash",
		description: "Fast and cost-effective (default)",
	},
	{
		key: "gemini-2.5-pro",
		provider: "fal",
		modelId: "google/gemini-2.5-pro",
		description: "Higher quality, balanced speed",
	},
	{
		key: "gemini-3-pro",
		provider: "fal",
		modelId: "google/gemini-3-pro-preview",
		description: "Highest quality, slower",
	},
	{
		key: "gemini-direct",
		provider: "gemini",
		modelId: "gemini-2.0-flash-exp",
		description: "Direct Gemini API (requires GEMINI_API_KEY)",
	},
];

/** Map editor model keys to OpenRouter model IDs for the FAL endpoint */
const MODEL_ID_MAP: Record<string, string> = {
	"gemini-2.5-flash": "google/gemini-2.5-flash",
	"gemini-2.5-pro": "google/gemini-2.5-pro",
	"gemini-3-pro": "google/gemini-3-pro-preview",
};

/** Analysis type → default prompt */
const ANALYSIS_PROMPTS: Record<string, string> = {
	timeline:
		'Analyze this video and return a JSON array of timestamped events. Each entry should have "start" (seconds), "end" (seconds), "label" (short description), and "tags" (array of keywords). Example: [{"start":0,"end":2.5,"label":"City skyline establishing shot","tags":["establishing","city"]}]. Return ONLY valid JSON, no markdown.',
	summary: "Provide a comprehensive summary of this video",
	description: "Describe this video in detail",
	transcript: "Transcribe all spoken words in this video",
};

/**
 * Resolve a video source to an absolute file path.
 */
export async function resolveVideoPath(
	projectId: string,
	source: AnalyzeSource
): Promise<string> {
	switch (source.type) {
		case "path": {
			if (!source.filePath) {
				throw new Error("Missing 'filePath' for path source");
			}
			if (!isValidSourcePath(source.filePath)) {
				throw new Error(
					"Invalid file path: must be an absolute path without null bytes"
				);
			}
			if (!existsSync(source.filePath)) {
				throw new Error(`File not found: ${source.filePath}`);
			}
			return source.filePath;
		}

		case "media": {
			if (!source.mediaId) {
				throw new Error("Missing 'mediaId' for media source");
			}
			const media = await getMediaInfo(projectId, source.mediaId);
			if (!media) {
				throw new Error(`Media not found: ${source.mediaId}`);
			}
			if (media.type !== "video") {
				throw new Error(`Media is not a video (type: ${media.type})`);
			}
			if (!existsSync(media.path)) {
				throw new Error(`Media file missing on disk: ${media.path}`);
			}
			return media.path;
		}

		case "timeline": {
			if (!source.elementId) {
				throw new Error("Missing 'elementId' for timeline source");
			}
			const win = BrowserWindow.getAllWindows()[0];
			if (!win) {
				throw new Error("No active QCut window for timeline lookup");
			}
			const timeline: ClaudeTimeline = await Promise.race([
				requestTimelineFromRenderer(win),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("Timeout getting timeline")), 5000)
				),
			]);

			// Find element across all tracks
			let sourceId: string | undefined;
			for (const track of timeline.tracks) {
				const element = track.elements.find((e) => e.id === source.elementId);
				if (element) {
					sourceId = element.sourceId;
					break;
				}
			}
			if (!sourceId) {
				throw new Error(`Element not found in timeline: ${source.elementId}`);
			}

			// Resolve sourceId to media file path
			const media = await getMediaInfo(projectId, sourceId);
			if (!media) {
				throw new Error(`Source media not found for element: ${sourceId}`);
			}
			if (media.type !== "video") {
				throw new Error(
					`Timeline element is not a video (type: ${media.type})`
				);
			}
			if (!existsSync(media.path)) {
				throw new Error(`Source media file missing on disk: ${media.path}`);
			}
			return media.path;
		}

		default:
			throw new Error(`Unknown source type: ${(source as AnalyzeSource).type}`);
	}
}

/**
 * Run video analysis via native pipeline executor and return results.
 */
export async function analyzeVideo(
	projectId: string,
	options: AnalyzeOptions
): Promise<AnalyzeResult> {
	const startTime = Date.now();
	const safeProjectId = sanitizeProjectId(projectId);

	try {
		// 1. Resolve video path
		const videoPath = await resolveVideoPath(safeProjectId, options.source);
		claudeLog.info(HANDLER_NAME, `Resolved video: ${videoPath}`);

		// 2. Prepare output directory
		const outputDir = join(getProjectPath(safeProjectId), "analysis");
		mkdirSync(outputDir, { recursive: true });

		// 3. Determine model and prompt
		const modelKey = options.model || "gemini-2.5-flash";
		const analysisType = options.analysisType || "timeline";
		const prompt =
			ANALYSIS_PROMPTS[analysisType] || "Describe this video in detail";

		// 4. Check native model is available
		if (!ModelRegistry.has(NATIVE_MODEL)) {
			return {
				success: false,
				error: `Analysis model '${NATIVE_MODEL}' not registered in native pipeline`,
			};
		}

		// 5. Build pipeline step with model override if needed
		const stepParams: Record<string, unknown> = {
			prompt,
			analysis_type: analysisType,
		};
		const routedModelId = MODEL_ID_MAP[modelKey];
		if (routedModelId) {
			stepParams.model = routedModelId;
		}

		const step: PipelineStep = {
			type: "image_understanding",
			model: NATIVE_MODEL,
			params: stepParams,
			enabled: true,
			retryCount: 0,
		};

		claudeLog.info(
			HANDLER_NAME,
			`Executing native analysis: model=${modelKey}, type=${analysisType}`
		);

		// 6. Execute via native pipeline (handles FAL upload + API call)
		const executor = new PipelineExecutor();
		const result = await executor.executeStep(step, { videoUrl: videoPath }, {
			outputDir,
		});
		const duration = (Date.now() - startTime) / 1000;

		if (!result.success) {
			return {
				success: false,
				error: result.error || "Analysis failed",
				duration,
			};
		}

		// 7. Process results
		const content = result.text || result.data;
		let markdown: string | undefined;
		let json: Record<string, unknown> | undefined;

		if (typeof content === "string") {
			markdown = content;
			// Try to parse JSON from the response
			try {
				const cleaned = content
					.replace(/^```(?:json)?\n?/m, "")
					.replace(/\n?```$/m, "")
					.trim();
				json = JSON.parse(cleaned);
			} catch {
				// Not JSON, keep as markdown
			}
		} else if (typeof content === "object" && content !== null) {
			json = content as Record<string, unknown>;
			markdown = JSON.stringify(content, null, 2);
		}

		// 8. Save output files
		const videoStem = basename(videoPath, extname(videoPath));
		const outputFiles: string[] = [];

		if (markdown) {
			const mdPath = join(outputDir, `${videoStem}_analysis.md`);
			writeFileSync(mdPath, markdown);
			outputFiles.push(mdPath);
		}
		if (json) {
			const jsonPath = join(outputDir, `${videoStem}_analysis.json`);
			writeFileSync(jsonPath, JSON.stringify(json, null, 2));
			outputFiles.push(jsonPath);
		}

		return {
			success: true,
			markdown,
			json,
			outputFiles,
			videoPath,
			duration,
			cost: result.cost,
		};
	} catch (error) {
		const duration = (Date.now() - startTime) / 1000;
		const message = error instanceof Error ? error.message : String(error);
		claudeLog.error(HANDLER_NAME, message);
		return { success: false, error: message, duration };
	}
}

/**
 * List available analysis models.
 */
export function listAnalyzeModels(): { models: AnalyzeModel[] } {
	return { models: ANALYZE_MODELS };
}

/**
 * Setup IPC handlers for video analysis.
 */
export function setupClaudeAnalyzeIPC(): void {
	ipcMain.handle(
		"claude:analyze:run",
		async (_event, projectId: string, options: AnalyzeOptions) => {
			claudeLog.info(
				HANDLER_NAME,
				`IPC analyze request for project ${projectId}`
			);
			return analyzeVideo(projectId, options);
		}
	);

	ipcMain.handle("claude:analyze:models", async () => {
		return listAnalyzeModels();
	});

	claudeLog.info(HANDLER_NAME, "IPC handlers registered");
}

// CommonJS export for compatibility
module.exports = {
	resolveVideoPath,
	analyzeVideo,
	listAnalyzeModels,
	setupClaudeAnalyzeIPC,
};
