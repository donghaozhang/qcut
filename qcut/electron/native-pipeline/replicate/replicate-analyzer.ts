/**
 * Video Replicate Analyzer — extracts a VideoRecipe from a source video.
 *
 * Delegates to PipelineExecutor (same path as `analyze-video` CLI command)
 * with a replicate-specific prompt that outputs VideoRecipe JSON.
 *
 * @module electron/native-pipeline/replicate/replicate-analyzer
 */

import * as path from "node:path";
import type { VideoRecipe, ShotRecipe } from "./replicate-types.js";
import {
	ANALYZE_VIDEO_SYSTEM_PROMPT,
	buildAnalyzeUserPrompt,
} from "./replicate-prompts.js";
import { PipelineExecutor } from "../execution/executor.js";
import type { PipelineStep } from "../execution/executor.js";

const DEFAULT_MODEL = "fal_video_qa";

export interface AnalyzerOptions {
	model?: string;
	signal?: AbortSignal;
	/** Optional pre-created executor (avoids creating a new one each call). */
	executor?: PipelineExecutor;
}

/**
 * Analyze a source video and return a VideoRecipe.
 *
 * Uses PipelineExecutor with the image_understanding step type,
 * reusing the same infrastructure as the `analyze-video` CLI command.
 */
export async function analyzeVideo(
	videoPath: string,
	options: AnalyzerOptions = {}
): Promise<VideoRecipe> {
	const absPath = path.resolve(videoPath);
	const filename = path.basename(absPath);
	const model = options.model || DEFAULT_MODEL;
	const executor = options.executor || new PipelineExecutor();

	// Build the replicate analysis prompt combining system + user instructions
	const prompt = `${ANALYZE_VIDEO_SYSTEM_PROMPT}\n\n${buildAnalyzeUserPrompt(filename)}`;

	const step: PipelineStep = {
		type: "image_understanding",
		model,
		params: {
			prompt,
			analysis_type: "replicate",
		},
		enabled: true,
		retryCount: 0,
	};

	const result = await executor.executeStep(
		step,
		{ videoUrl: absPath },
		{ outputDir: undefined, signal: options.signal }
	);

	if (!result.success) {
		throw new Error(
			`Video analysis failed: ${result.error || "Unknown error"}`
		);
	}

	const resultData = result.text || result.data;
	if (!resultData) {
		throw new Error("Empty response from video analysis");
	}

	// Parse JSON from the model response
	let parsed: unknown;
	if (typeof resultData === "string") {
		const cleaned = resultData
			.replace(/^```(?:json)?\n?/m, "")
			.replace(/\n?```$/m, "")
			.trim();
		parsed = JSON.parse(cleaned);
	} else {
		parsed = resultData;
	}

	return validateRecipe(parsed, filename);
}

/**
 * Validate and normalize a parsed recipe object.
 * Fills in missing defaults and ensures type correctness.
 */
export function validateRecipe(
	raw: unknown,
	filename: string
): VideoRecipe {
	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid recipe: expected an object");
	}

	const obj = raw as Record<string, unknown>;

	const source = (obj.source as Record<string, unknown>) || {};
	const style = (obj.style as Record<string, unknown>) || {};
	const audio = (obj.audio as Record<string, unknown>) || {};
	const rawShots = Array.isArray(obj.shots) ? obj.shots : [];

	const recipe: VideoRecipe = {
		version: 1,
		source: {
			filename: String(source.filename || filename),
			duration: Number(source.duration) || 0,
			resolution: {
				width:
					Number(
						(source.resolution as Record<string, unknown>)?.width
					) || 1920,
				height:
					Number(
						(source.resolution as Record<string, unknown>)?.height
					) || 1080,
			},
			fps: Number(source.fps) || 30,
		},
		style: {
			genre: String(style.genre || "other"),
			mood: String(style.mood || "other"),
			colorPalette: Array.isArray(style.colorPalette)
				? style.colorPalette.map(String)
				: [],
			pacing: validatePacing(style.pacing),
		},
		audio: {
			hasBGM: Boolean(audio.hasBGM),
			bgmStyle: audio.bgmStyle ? String(audio.bgmStyle) : undefined,
			hasVoiceover: Boolean(audio.hasVoiceover),
			voiceoverLanguage: audio.voiceoverLanguage
				? String(audio.voiceoverLanguage)
				: undefined,
			transcript: audio.transcript
				? String(audio.transcript)
				: undefined,
		},
		shots: rawShots.map((s, i) => validateShot(s, i)),
	};

	if (recipe.shots.length === 0) {
		throw new Error("Invalid recipe: no shots detected");
	}

	return recipe;
}

function validatePacing(value: unknown): "fast" | "medium" | "slow" {
	const s = String(value || "medium").toLowerCase();
	if (s === "fast" || s === "medium" || s === "slow") return s;
	return "medium";
}

const VALID_SHOT_TYPES = new Set([
	"wide",
	"medium",
	"closeup",
	"detail",
	"transition",
	"title",
]);
const VALID_CAMERAS = new Set([
	"static",
	"pan-left",
	"pan-right",
	"zoom-in",
	"zoom-out",
	"tracking",
]);
const VALID_TRANSITIONS = new Set([
	"cut",
	"dissolve",
	"fade",
	"wipe",
	"none",
]);

function validateShot(raw: unknown, fallbackIndex: number): ShotRecipe {
	const s = (raw as Record<string, unknown>) || {};
	const startTime = Number(s.startTime) || 0;
	const endTime = Number(s.endTime) || startTime + 3;
	const duration = Number(s.duration) || endTime - startTime;

	const shotType = String(s.type || "medium").toLowerCase();
	const camera = String(s.camera || "static").toLowerCase();
	const transition = String(s.transition || "cut").toLowerCase();

	const rawIndex = s.index != null ? Number(s.index) : NaN;

	return {
		index: Number.isNaN(rawIndex) ? fallbackIndex : rawIndex,
		startTime,
		endTime,
		duration,
		type: VALID_SHOT_TYPES.has(shotType)
			? (shotType as ShotRecipe["type"])
			: "medium",
		camera: VALID_CAMERAS.has(camera)
			? (camera as ShotRecipe["camera"])
			: "static",
		description: String(s.description || ""),
		prompt: String(s.prompt || s.description || ""),
		transition: VALID_TRANSITIONS.has(transition)
			? (transition as ShotRecipe["transition"])
			: "cut",
		hasText: Boolean(s.hasText),
		textContent: s.textContent ? String(s.textContent) : undefined,
		hasSubtitle: Boolean(s.hasSubtitle),
		subtitleText: s.subtitleText ? String(s.subtitleText) : undefined,
	};
}
