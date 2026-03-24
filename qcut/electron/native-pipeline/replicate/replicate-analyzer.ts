/**
 * Video Replicate Analyzer — extracts a VideoRecipe from a source video.
 *
 * Uploads the video to Gemini Vision (inline base64) and asks it to
 * produce a structured shot-by-shot analysis as a VideoRecipe JSON.
 *
 * @module electron/native-pipeline/replicate/replicate-analyzer
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { VideoRecipe, ShotRecipe } from "./replicate-types.js";
import {
	ANALYZE_VIDEO_SYSTEM_PROMPT,
	buildAnalyzeUserPrompt,
} from "./replicate-prompts.js";
import { parseJsonResponse } from "../autoclip/llm-utils.js";
import { GEMINI_BASE } from "../infra/api-caller.js";

const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20 MB inline limit
const REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface AnalyzerOptions {
	model?: string;
	signal?: AbortSignal;
}

/** Resolve the Gemini API key from environment. */
function getGeminiKey(): string {
	const key =
		process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "";
	if (!key) {
		throw new Error(
			"GEMINI_API_KEY or GOOGLE_AI_API_KEY must be set for video analysis"
		);
	}
	return key;
}

/** Get MIME type for a video file. */
function videoMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	const mimes: Record<string, string> = {
		".mp4": "video/mp4",
		".mov": "video/quicktime",
		".webm": "video/webm",
		".mpeg": "video/mpeg",
		".avi": "video/x-msvideo",
		".mkv": "video/x-matroska",
	};
	return mimes[ext] || "video/mp4";
}

/**
 * Analyze a source video and return a VideoRecipe.
 *
 * Uses Gemini Vision API with the video embedded as inline base64 data.
 */
export async function analyzeVideo(
	videoPath: string,
	options: AnalyzerOptions = {}
): Promise<VideoRecipe> {
	const absPath = path.resolve(videoPath);
	if (!fs.existsSync(absPath)) {
		throw new Error(`Video file not found: ${absPath}`);
	}

	const stat = fs.statSync(absPath);
	if (stat.size > MAX_VIDEO_SIZE) {
		throw new Error(
			`Video file too large (${(stat.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_VIDEO_SIZE / 1024 / 1024} MB for inline upload.`
		);
	}

	const apiKey = getGeminiKey();
	const model = options.model || DEFAULT_MODEL;
	const filename = path.basename(absPath);

	// Read video and encode to base64
	const videoBuffer = fs.readFileSync(absPath);
	const base64Data = videoBuffer.toString("base64");
	const mimeType = videoMimeType(absPath);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	// Link external signal
	if (options.signal) {
		options.signal.addEventListener("abort", () => controller.abort());
	}

	try {
		const response = await fetch(
			`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					system_instruction: {
						parts: [{ text: ANALYZE_VIDEO_SYSTEM_PROMPT }],
					},
					contents: [
						{
							role: "user",
							parts: [
								{
									inlineData: {
										mimeType,
										data: base64Data,
									},
								},
								{ text: buildAnalyzeUserPrompt(filename) },
							],
						},
					],
					generationConfig: {
						temperature: 0.3,
						maxOutputTokens: 16384,
					},
				}),
				signal: controller.signal,
			}
		);

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(
				`Gemini API error (${response.status}): ${errText.slice(0, 300)}`
			);
		}

		const data = (await response.json()) as {
			candidates?: Array<{
				content?: { parts?: Array<{ text?: string }> };
			}>;
		};

		const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error("Empty response from Gemini Vision API");
		}

		const parsed = parseJsonResponse(text);
		return validateRecipe(parsed, filename);
	} finally {
		clearTimeout(timeout);
	}
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
