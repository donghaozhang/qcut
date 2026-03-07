/**
 * Novel Parse Handler — main process orchestrator.
 *
 * Runs the 3-step novel→screenplay pipeline using the main-process callLLM.
 * Called by the HTTP route `/api/claude/novel/parse`.
 *
 * This mirrors the renderer-side novel-parser.ts but runs in the main process
 * so the CLI and HTTP API can use it without IPC round-trips.
 */

import { callLLM } from "../moyin-handler.js";
import {
	getCharacterAnalysisPrompt,
	getLocationAnalysisPrompt,
	getClipSplitPrompt,
	getScreenplayConversionPrompt,
} from "./novel-parse-prompts.js";
import {
	repairAndParseJSON,
	repairAndParseJSONArray,
} from "./novel-parse-json-repair.js";
import { createClipContentMatcher } from "./novel-parse-clip-matching.js";
import type { ClipMatchLevel } from "./novel-parse-clip-matching.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface NovelParseRequest {
	text: string;
	language?: "zh" | "en" | "auto";
	maxClips?: number;
}

export interface ExtractedCharacter {
	name: string;
	introduction: string;
	visualTraits?: string;
	gender?: string;
	age?: string;
}

export interface ExtractedLocation {
	name: string;
	description: string;
	time?: string;
	atmosphere?: string;
}

interface NovelClip {
	id: string;
	startText: string;
	endText: string;
	content: string;
	summary: string;
	characters: string[];
	location: string | null;
	matchLevel: ClipMatchLevel;
	matchConfidence: number;
}

interface ClipScreenplay {
	clipId: string;
	success: boolean;
	sceneCount: number;
	screenplay?: {
		scenes: Array<{
			location: string;
			time: string;
			action: string;
			dialogue: Array<{
				character: string;
				line: string;
				direction?: string;
			}>;
		}>;
	};
	error?: string;
}

export interface NovelParseResponse {
	characters: ExtractedCharacter[];
	locations: ExtractedLocation[];
	clips: NovelClip[];
	screenplays: ClipScreenplay[];
	summary: {
		characterCount: number;
		locationCount: number;
		clipCount: number;
		screenplaySuccessCount: number;
		screenplayFailedCount: number;
		totalScenes: number;
	};
}

export interface NovelParseProgress {
	step: string;
	percent: number;
	message: string;
}

export type NovelParseProgressFn = (progress: NovelParseProgress) => void;

// ─── Helpers ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = "You are a professional screenwriter.";
const MAX_TOKENS = 2200;
const MAX_BOUNDARY_ATTEMPTS = 2;

function detectLanguage(text: string): "zh" | "en" {
	const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
	return chineseChars / text.length > 0.1 ? "zh" : "en";
}

function applyTemplate(
	template: string,
	replacements: Record<string, string>
): string {
	let result = template;
	for (const [key, value] of Object.entries(replacements)) {
		result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
	}
	return result;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === "string" ? item.trim() : ""))
		.filter(Boolean);
}

function toObjectArray(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is Record<string, unknown> =>
			!!item && typeof item === "object"
	);
}

// ─── Pipeline Steps ─────────────────────────────────────────────────

async function analyzeCharacters(
	text: string,
	lang: string
): Promise<ExtractedCharacter[]> {
	const template = getCharacterAnalysisPrompt(lang);
	const none = lang === "zh" ? "\u65E0" : "None";
	const prompt = applyTemplate(template, {
		input: text,
		characters_lib_name: none,
	});
	const response = await callLLM(SYSTEM_PROMPT, prompt, {
		maxTokens: MAX_TOKENS,
	});
	const parsed = repairAndParseJSON<Record<string, unknown>>(response);
	const characters = toObjectArray(
		parsed.characters ?? parsed.new_characters
	);
	return characters.map((c) => ({
		name: asString(c.name),
		introduction: asString(c.introduction),
		visualTraits: asString(c.visualTraits) || undefined,
		gender: asString(c.gender) || undefined,
		age: asString(c.age) || undefined,
	}));
}

async function analyzeLocations(
	text: string,
	lang: string
): Promise<ExtractedLocation[]> {
	const template = getLocationAnalysisPrompt(lang);
	const none = lang === "zh" ? "\u65E0" : "None";
	const prompt = applyTemplate(template, {
		input: text,
		locations_lib_name: none,
	});
	const response = await callLLM(SYSTEM_PROMPT, prompt, {
		maxTokens: MAX_TOKENS,
	});
	const parsed = repairAndParseJSON<Record<string, unknown>>(response);
	const locations = toObjectArray(parsed.locations);
	return locations.map((l) => ({
		name: asString(l.name),
		description: asString(l.description),
		time: asString(l.time) || undefined,
		atmosphere: asString(l.atmosphere) || undefined,
	}));
}

async function splitIntoClips(
	text: string,
	characters: string[],
	locations: string[],
	lang: string
): Promise<NovelClip[]> {
	const template = getClipSplitPrompt(lang);
	const sep = lang === "zh" ? "\u3001" : ", ";
	const none = lang === "zh" ? "\u65E0" : "None";
	const noIntro =
		lang === "zh"
			? "\u6682\u65E0\u89D2\u8272\u4ECB\u7ECD"
			: "No character introductions available";

	const prompt = applyTemplate(template, {
		input: text,
		characters_lib_name: characters.length > 0 ? characters.join(sep) : none,
		locations_lib_name: locations.length > 0 ? locations.join(sep) : none,
		characters_introduction: noIntro,
	});

	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= MAX_BOUNDARY_ATTEMPTS; attempt += 1) {
		try {
			const response = await callLLM(SYSTEM_PROMPT, prompt, {
				maxTokens: 2600,
			});
			const rawClips =
				repairAndParseJSONArray<Record<string, unknown>>(response);
			if (rawClips.length === 0) {
				lastError = new Error("split_clips returned empty clips");
				continue;
			}

			const matcher = createClipContentMatcher(text);
			const clips: NovelClip[] = [];
			let searchFrom = 0;
			let failed = false;

			for (let i = 0; i < rawClips.length; i += 1) {
				const item = rawClips[i];
				const startText = asString(item.start);
				const endText = asString(item.end);
				const clipId = `clip_${i + 1}`;

				const match = matcher.matchBoundary(startText, endText, searchFrom);
				if (!match) {
					lastError = new Error(
						`Boundary matching failed at ${clipId}`
					);
					failed = true;
					break;
				}

				clips.push({
					id: clipId,
					startText,
					endText,
					summary: asString(item.summary),
					location: asString(item.location) || null,
					characters: toStringArray(item.characters),
					content: text.slice(match.startIndex, match.endIndex),
					matchLevel: match.level,
					matchConfidence: match.confidence,
				});
				searchFrom = match.endIndex;
			}

			if (!failed) return clips;
		} catch (error) {
			lastError =
				error instanceof Error
					? error
					: new Error(`split_clips failed: ${String(error)}`);
		}
	}

	throw lastError ?? new Error("split_clips boundary matching failed");
}

async function convertClipToScreenplay(
	clip: NovelClip,
	characters: string[],
	locations: string[],
	lang: string
): Promise<ClipScreenplay> {
	try {
		const template = getScreenplayConversionPrompt(lang);
		const sep = lang === "zh" ? "\u3001" : ", ";
		const none = lang === "zh" ? "\u65E0" : "None";
		const noIntro =
			lang === "zh"
				? "\u6682\u65E0\u89D2\u8272\u4ECB\u7ECD"
				: "No character introductions available";

		const prompt = applyTemplate(template, {
			clip_content: clip.content,
			characters_lib_name:
				characters.length > 0 ? characters.join(sep) : none,
			locations_lib_name:
				locations.length > 0 ? locations.join(sep) : none,
			characters_introduction: noIntro,
		});

		const response = await callLLM(SYSTEM_PROMPT, prompt, {
			maxTokens: MAX_TOKENS,
		});
		const parsed = repairAndParseJSON<Record<string, unknown>>(response);
		const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

		return {
			clipId: clip.id,
			success: true,
			sceneCount: scenes.length,
			screenplay: {
				scenes: scenes.map((s: Record<string, unknown>) => ({
					location: asString(s.location),
					time: asString(s.time),
					action: asString(s.action),
					dialogue: toObjectArray(s.dialogue).map((d) => ({
						character: asString(d.character),
						line: asString(d.line),
						direction: asString(d.direction) || undefined,
					})),
				})),
			},
		};
	} catch (error) {
		return {
			clipId: clip.id,
			success: false,
			sceneCount: 0,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

// ─── Public API ─────────────────────────────────────────────────────

const noop: NovelParseProgressFn = () => {};

/** Run the full novel→screenplay pipeline. */
export async function handleNovelParse(
	request: NovelParseRequest,
	onProgress: NovelParseProgressFn = noop
): Promise<NovelParseResponse> {
	const { text, language = "auto" } = request;

	if (!text?.trim()) {
		throw new Error("Novel text is empty");
	}

	const lang = language === "auto" ? detectLanguage(text) : language;
	onProgress({ step: "init", percent: 5, message: `Detected language: ${lang}, text length: ${text.length} chars` });

	// Step 1: Parallel character + location analysis
	onProgress({ step: "characters", percent: 10, message: "Analyzing characters and locations..." });
	const [characters, locations] = await Promise.all([
		analyzeCharacters(text, lang),
		analyzeLocations(text, lang),
	]);
	onProgress({ step: "characters", percent: 30, message: `Found ${characters.length} characters, ${locations.length} locations` });

	// Step 2: Split into clips with boundary validation
	onProgress({ step: "clips", percent: 35, message: "Splitting text into clips..." });
	const allClips = await splitIntoClips(
		text,
		characters.map((c) => c.name),
		locations.map((l) => l.name),
		lang
	);

	const maxClips =
		typeof request.maxClips === "number" && Number.isFinite(request.maxClips)
			? Math.max(0, Math.floor(request.maxClips))
			: undefined;
	const clips =
		maxClips != null && maxClips < allClips.length
			? allClips.slice(0, maxClips)
			: allClips;
	onProgress({ step: "clips", percent: 50, message: `Split into ${clips.length} clips` });

	// Step 3: Convert each clip to screenplay (parallel)
	onProgress({ step: "screenplay", percent: 55, message: `Converting ${clips.length} clips to screenplay...` });
	const screenplays: ClipScreenplay[] = [];
	for (let i = 0; i < clips.length; i += 1) {
		const clip = clips[i];
		onProgress({ step: "screenplay", percent: 55 + Math.round((i / clips.length) * 40), message: `Converting clip ${i + 1}/${clips.length}: ${clip.id}` });
		const result = await convertClipToScreenplay(
			clip,
			characters.map((c) => c.name),
			locations.map((l) => l.name),
			lang
		);
		screenplays.push(result);
	}

	const summary = {
		characterCount: characters.length,
		locationCount: locations.length,
		clipCount: clips.length,
		screenplaySuccessCount: screenplays.filter((s) => s.success).length,
		screenplayFailedCount: screenplays.filter((s) => !s.success).length,
		totalScenes: screenplays.reduce((sum, s) => sum + s.sceneCount, 0),
	};
	onProgress({ step: "done", percent: 100, message: `Complete: ${summary.totalScenes} scenes from ${summary.clipCount} clips` });

	return { characters, locations, clips, screenplays, summary };
}
