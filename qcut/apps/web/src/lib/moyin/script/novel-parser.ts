/**
 * Novel-to-Script Parser — main orchestrator.
 *
 * 3-step pipeline:
 * 1. Parallel character + location analysis
 * 2. Clip splitting with boundary validation (clip-matching.ts)
 * 3. Parallel screenplay conversion per clip
 *
 * Uses LLMAdapter from script-parser.ts for all LLM calls.
 */

import type { LLMAdapter } from "./script-parser";
import { createClipContentMatcher, type ClipMatchLevel } from "./clip-matching";
import { repairAndParseJSON, repairAndParseJSONArray } from "./json-repair";
import {
	getCharacterAnalysisPrompt,
	getLocationAnalysisPrompt,
	getClipSplitPrompt,
	getScreenplayConversionPrompt,
} from "./novel-prompts";

// ─── Types ──────────────────────────────────────────────────────────

export type NovelParseStep =
	| "analyze_characters"
	| "analyze_locations"
	| "split_clips"
	| "screenplay_conversion";

export interface NovelParseConfig {
	/** Raw novel/story text */
	text: string;
	/** Language hint */
	language?: "zh" | "en" | "auto";
	/** Max clips to generate (default: auto based on length) */
	maxClips?: number;
	/** Existing characters to preserve (from project) */
	existingCharacters?: string[];
	/** Existing locations to preserve */
	existingLocations?: string[];
	/** LLM adapter function */
	callLLM: LLMAdapter;
	/** Progress callback */
	onProgress?: (step: NovelParseStep, progress: number) => void;
	/** Step error callback */
	onStepError?: (step: NovelParseStep, error: string) => void;
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

export interface NovelClip {
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

export interface ClipScreenplay {
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

export interface NovelParseResult {
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

// ─── Helpers ────────────────────────────────────────────────────────

const MAX_SPLIT_BOUNDARY_ATTEMPTS = 2;
const ANALYSIS_MAX_TOKENS = 2200;
const SCREENPLAY_MAX_TOKENS = 2200;

/** Simple language detection based on Chinese character ratio. */
export function detectLanguage(text: string): "zh" | "en" {
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

function toObjectArray(
	value: unknown
): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is Record<string, unknown> =>
			!!item && typeof item === "object"
	);
}

// ─── Step 1: Character Analysis ─────────────────────────────────────

export async function analyzeCharacters(
	text: string,
	existingCharacters: string[],
	callLLM: LLMAdapter,
	language: string
): Promise<ExtractedCharacter[]> {
	const template = getCharacterAnalysisPrompt(language);
	const existingText =
		existingCharacters.length > 0
			? existingCharacters.join(language === "zh" ? "\u3001" : ", ")
			: language === "zh"
				? "\u65E0"
				: "None";

	const prompt = applyTemplate(template, {
		input: text,
		characters_lib_name: existingText,
	});

	const response = await callLLM(
		"You are a professional screenwriter.",
		prompt,
		{ maxTokens: ANALYSIS_MAX_TOKENS }
	);

	const parsed = repairAndParseJSON<Record<string, unknown>>(response);
	const characters = toObjectArray(parsed.characters ?? parsed.new_characters);

	return characters.map((c) => ({
		name: asString(c.name),
		introduction: asString(c.introduction),
		visualTraits: asString(c.visualTraits) || undefined,
		gender: asString(c.gender) || undefined,
		age: asString(c.age) || undefined,
	}));
}

// ─── Step 1: Location Analysis ──────────────────────────────────────

export async function analyzeLocations(
	text: string,
	existingLocations: string[],
	callLLM: LLMAdapter,
	language: string
): Promise<ExtractedLocation[]> {
	const template = getLocationAnalysisPrompt(language);
	const existingText =
		existingLocations.length > 0
			? existingLocations.join(language === "zh" ? "\u3001" : ", ")
			: language === "zh"
				? "\u65E0"
				: "None";

	const prompt = applyTemplate(template, {
		input: text,
		locations_lib_name: existingText,
	});

	const response = await callLLM(
		"You are a professional screenwriter.",
		prompt,
		{ maxTokens: ANALYSIS_MAX_TOKENS }
	);

	const parsed = repairAndParseJSON<Record<string, unknown>>(response);
	const locations = toObjectArray(parsed.locations);

	return locations.map((l) => ({
		name: asString(l.name),
		description: asString(l.description),
		time: asString(l.time) || undefined,
		atmosphere: asString(l.atmosphere) || undefined,
	}));
}

// ─── Step 2: Clip Splitting ─────────────────────────────────────────

export async function splitNovelIntoClips(
	text: string,
	characters: string[],
	locations: string[],
	callLLM: LLMAdapter,
	language: string,
	maxAttempts: number = MAX_SPLIT_BOUNDARY_ATTEMPTS
): Promise<NovelClip[]> {
	const template = getClipSplitPrompt(language);
	const sep = language === "zh" ? "\u3001" : ", ";
	const none = language === "zh" ? "\u65E0" : "None";
	const noIntro =
		language === "zh" ? "\u6682\u65E0\u89D2\u8272\u4ECB\u7ECD" : "No character introductions available";

	const prompt = applyTemplate(template, {
		input: text,
		characters_lib_name: characters.length > 0 ? characters.join(sep) : none,
		locations_lib_name: locations.length > 0 ? locations.join(sep) : none,
		characters_introduction: noIntro,
	});

	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const response = await callLLM(
			"You are a professional screenwriter.",
			prompt,
			{ maxTokens: 2600 }
		);

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

		for (let index = 0; index < rawClips.length; index += 1) {
			const item = rawClips[index];
			const startText = asString(item.start);
			const endText = asString(item.end);
			const clipId = `clip_${index + 1}`;

			const match = matcher.matchBoundary(startText, endText, searchFrom);
			if (!match) {
				lastError = new Error(
					`Boundary matching failed at ${clipId}: start="${startText}" end="${endText}"`
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
	}

	throw lastError ?? new Error("split_clips boundary matching failed");
}

// ─── Step 3: Screenplay Conversion ──────────────────────────────────

export async function convertClipToScreenplay(
	clip: NovelClip,
	characters: string[],
	locations: string[],
	callLLM: LLMAdapter,
	language: string
): Promise<ClipScreenplay> {
	try {
		const template = getScreenplayConversionPrompt(language);
		const sep = language === "zh" ? "\u3001" : ", ";
		const none = language === "zh" ? "\u65E0" : "None";
		const noIntro =
			language === "zh" ? "\u6682\u65E0\u89D2\u8272\u4ECB\u7ECD" : "No character introductions available";

		const prompt = applyTemplate(template, {
			clip_content: clip.content,
			characters_lib_name:
				characters.length > 0 ? characters.join(sep) : none,
			locations_lib_name:
				locations.length > 0 ? locations.join(sep) : none,
			characters_introduction: noIntro,
		});

		const response = await callLLM(
			"You are a professional screenwriter.",
			prompt,
			{ maxTokens: SCREENPLAY_MAX_TOKENS }
		);

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
		const message = error instanceof Error ? error.message : String(error);
		return {
			clipId: clip.id,
			success: false,
			sceneCount: 0,
			error: message,
		};
	}
}

// ─── Main Orchestrator ──────────────────────────────────────────────

export async function parseNovel(
	config: NovelParseConfig
): Promise<NovelParseResult> {
	const { text, language = "auto", callLLM, onProgress } = config;

	if (!text || !text.trim()) {
		throw new Error("Novel text is empty");
	}

	// Detect language if auto
	const lang = language === "auto" ? detectLanguage(text) : language;

	// Step 1: Parallel character + location analysis
	onProgress?.("analyze_characters", 0);
	onProgress?.("analyze_locations", 0);
	const [characters, locations] = await Promise.all([
		analyzeCharacters(
			text,
			config.existingCharacters ?? [],
			callLLM,
			lang
		),
		analyzeLocations(
			text,
			config.existingLocations ?? [],
			callLLM,
			lang
		),
	]);
	onProgress?.("analyze_characters", 100);
	onProgress?.("analyze_locations", 100);

	// Step 2: Split into clips with boundary validation
	onProgress?.("split_clips", 0);
	const clips = await splitNovelIntoClips(
		text,
		characters.map((c) => c.name),
		locations.map((l) => l.name),
		callLLM,
		lang
	);
	onProgress?.("split_clips", 100);

	// Step 3: Convert each clip to screenplay (parallel)
	onProgress?.("screenplay_conversion", 0);
	const screenplays = await Promise.all(
		clips.map((clip, i) =>
			convertClipToScreenplay(
				clip,
				characters.map((c) => c.name),
				locations.map((l) => l.name),
				callLLM,
				lang
			).then((result) => {
				onProgress?.(
					"screenplay_conversion",
					((i + 1) / clips.length) * 100
				);
				return result;
			})
		)
	);

	return {
		characters,
		locations,
		clips,
		screenplays,
		summary: {
			characterCount: characters.length,
			locationCount: locations.length,
			clipCount: clips.length,
			screenplaySuccessCount: screenplays.filter((s) => s.success).length,
			screenplayFailedCount: screenplays.filter((s) => !s.success).length,
			totalScenes: screenplays.reduce(
				(sum, s) => sum + s.sceneCount,
				0
			),
		},
	};
}
