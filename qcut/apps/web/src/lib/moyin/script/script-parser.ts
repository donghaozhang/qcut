/**
 * Script Parser — pure functions + LLM adapter interface
 * Ported from moyin-creator script-parser.ts
 *
 * LLM-dependent functions use an adapter pattern:
 * pass a `callLLM` function to decouple from any specific API.
 * QCut will provide the adapter via Electron IPC in Phase 2.
 */

import type { ScriptData } from "@/types/moyin-script";

// ==================== Types ====================

/** Adapter function for LLM calls */
export type LLMAdapter = (
	systemPrompt: string,
	userPrompt: string,
	options?: LLMCallOptions
) => Promise<string>;

export interface LLMCallOptions {
	temperature?: number;
	maxTokens?: number;
}

export interface ParseOptions {
	language?: string;
	sceneCount?: number;
	shotCount?: number;
}

export interface ScriptGenerationOptions extends ParseOptions {
	targetDuration?: string;
	styleId?: string;
}

// ==================== Helpers ====================

/** Parse a duration string like "30s", "2m", "1.5m", "120" into seconds. */
function parseDurationToSeconds(duration: string): number {
	const trimmed = duration.trim().toLowerCase();
	const mMatch = trimmed.match(/^([\d.]+)\s*m(?:in)?$/);
	if (mMatch) return Math.round(parseFloat(mMatch[1]) * 60);
	const sMatch = trimmed.match(/^([\d.]+)\s*s(?:ec)?$/);
	if (sMatch) return Math.round(parseFloat(sMatch[1]));
	const num = parseFloat(trimmed);
	return Number.isFinite(num) ? Math.round(num) : 0;
}

// ==================== Pure Functions ====================

/**
 * Normalize time value to standard IDs.
 * Maps Chinese time descriptions to English preset IDs.
 */
export function normalizeTimeValue(time: string | undefined): string {
	if (!time) return "day";

	const timeMap: Record<string, string> = {
		// Chinese mappings
		"\u767d\u5929": "day",
		"\u65e5\u95f4": "day",
		"\u4e0a\u5348": "day",
		"\u4e0b\u5348": "day",
		"\u591c\u665a": "night",
		"\u591c\u95f4": "night",
		"\u6df1\u591c": "midnight",
		"\u534a\u591c": "midnight",
		"\u9ec4\u660f": "dusk",
		"\u65e5\u843d": "dusk",
		"\u50ac\u665a": "dusk",
		"\u9ece\u660e": "dawn",
		"\u65e9\u6668": "dawn",
		"\u6e05\u6668": "dawn",
		"\u65e5\u51fa": "dawn",
		"\u4e2d\u5348": "noon",
		"\u6b63\u5348": "noon",
		// English pass-through
		day: "day",
		night: "night",
		dawn: "dawn",
		dusk: "dusk",
		noon: "noon",
		midnight: "midnight",
	};

	const normalized = time.toLowerCase().trim();
	return timeMap[normalized] || timeMap[time] || "day";
}

/**
 * Detect the type of creative input.
 * Returns a label describing the input format.
 */
export function detectInputType(input: string): string {
	const trimmed = input.trim();
	const lineCount = trimmed.split("\n").filter((l) => l.trim()).length;

	// Storyboard structure: shot markers
	if (
		/[\u3010[]\s*\u955c\u5934\s*\d+/i.test(trimmed) ||
		/\*\*.*\u955c\u5934.*\*\*/i.test(trimmed)
	) {
		return "storyboard_script";
	}

	// MV concept
	if (/MV|music\s*video/i.test(trimmed)) {
		return "mv_concept";
	}

	// Ad brief
	if (/commercial|ad\s*brief|advertisement/i.test(trimmed)) {
		return "ad_brief";
	}

	// Trailer
	if (/trailer|teaser/i.test(trimmed)) {
		return "trailer_script";
	}

	// Short video
	if (/tiktok|reels|short\s*video|shorts/i.test(trimmed)) {
		return "short_video";
	}

	// By length
	if (lineCount <= 3 && trimmed.length < 100) {
		return "one_liner";
	} else if (lineCount <= 10) {
		return "story_outline";
	} else {
		return "detailed_story";
	}
}

/**
 * Count the number of shot/scene markers in the input text.
 * Detects patterns like [Shot 1], **[Shot 1]**, Scene 1, etc.
 */
export function countShotMarkers(input: string): number {
	const shotMatches =
		input.match(/\*?\*?[[\u3010]\s*\u955c\u5934\s*\d+/g) || [];
	const sceneMatches = input.match(/\u573a\u666f\s*\d+/g) || [];
	return Math.max(shotMatches.length, sceneMatches.length);
}

// ==================== LLM-Dependent Functions ====================

/**
 * Parse raw screenplay text into structured ScriptData.
 * Requires an LLM adapter to process the text.
 *
 * Usage (Phase 2):
 * ```ts
 * const adapter: LLMAdapter = (system, user) =>
 *   window.electronAPI.moyin.parseScript({ system, user });
 * const data = await parseScript(rawText, adapter, { language: 'en' });
 * ```
 */
export async function parseScript(
	rawScript: string,
	callLLM: LLMAdapter,
	options: ParseOptions = {}
): Promise<ScriptData> {
	const { language = "auto", sceneCount } = options;

	// Import system prompt lazily to enable tree-shaking
	const { PARSE_SYSTEM_PROMPT } = await import("./system-prompts");

	let userPrompt = rawScript;
	if (language !== "auto") {
		userPrompt = `[Language: ${language}]\n\n${rawScript}`;
	}
	if (sceneCount) {
		userPrompt = `[Max scenes: ${sceneCount}]\n\n${userPrompt}`;
	}

	const response = await callLLM(PARSE_SYSTEM_PROMPT, userPrompt, {
		temperature: 0.7,
		maxTokens: 4096,
	});

	// Parse JSON response
	const cleaned = cleanJsonFromResponse(response);
	const parsed = JSON.parse(cleaned) as ScriptData;

	// Normalize time values
	for (const scene of parsed.scenes) {
		scene.time = normalizeTimeValue(scene.time);
	}

	return parsed;
}

/**
 * Generate a screenplay from a creative idea.
 * Returns raw screenplay text (not parsed into ScriptData).
 */
export async function generateScriptFromIdea(
	idea: string,
	callLLM: LLMAdapter,
	options: ScriptGenerationOptions = {}
): Promise<string> {
	const { targetDuration = "60s", sceneCount, shotCount, styleId } = options;

	const { CREATIVE_SCRIPT_PROMPT, STORYBOARD_STRUCTURE_PROMPT } = await import(
		"./system-prompts"
	);

	const originalShotCount = countShotMarkers(idea);
	const inputType = detectInputType(idea);

	// Use storyboard structure prompt if input has shot markers
	const systemPrompt =
		originalShotCount > 0
			? CREATIVE_SCRIPT_PROMPT + STORYBOARD_STRUCTURE_PROMPT
			: CREATIVE_SCRIPT_PROMPT;

	// Calculate recommended shot count from duration if not explicitly set.
	// Each AI video clip is 6–15 seconds, average ~10s per shot.
	const durationSecs = parseDurationToSeconds(targetDuration);
	const recommendedShots =
		!shotCount && durationSecs > 0
			? Math.max(2, Math.round(durationSecs / 10))
			: undefined;

	const userPrompt = [
		"Generate a complete screenplay from this creative input:",
		"",
		`[Input type] ${inputType}`,
		"",
		"[Content]",
		idea,
		"",
		"[Requirements]",
		`- Target duration: ${targetDuration}`,
		recommendedShots
			? `- IMPORTANT: Each shot becomes a 6-15 second AI video clip (~10s average). For ${targetDuration} target, generate exactly ${recommendedShots} shots total across all scenes.`
			: "",
		originalShotCount > 0
			? `- Scene count: must have ${originalShotCount} (matching original shots)`
			: sceneCount
				? `- Scene count: approximately ${sceneCount}`
				: "",
		shotCount ? `- Shot count: approximately ${shotCount}` : "",
		styleId ? `- Visual style: ${styleId}` : "",
	]
		.filter(Boolean)
		.join("\n");

	const response = await callLLM(systemPrompt, userPrompt, {
		maxTokens: originalShotCount > 5 ? 8192 : 4096,
	});

	return response;
}

// ==================== Helpers ====================

/**
 * Extract JSON from an LLM response that may contain markdown fences or extra text.
 */
function cleanJsonFromResponse(response: string): string {
	let cleaned = response.trim();

	// Remove markdown code fences
	const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonMatch) {
		cleaned = jsonMatch[1].trim();
	}

	// Find the outermost JSON object or array
	const firstBrace = cleaned.indexOf("{");
	const firstBracket = cleaned.indexOf("[");

	if (firstBrace === -1 && firstBracket === -1) {
		throw new Error("No JSON found in LLM response");
	}

	const start =
		firstBrace === -1
			? firstBracket
			: firstBracket === -1
				? firstBrace
				: Math.min(firstBrace, firstBracket);
	const isArray = cleaned[start] === "[";
	const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");

	if (end === -1 || end < start) {
		throw new Error("Invalid JSON structure in LLM response");
	}

	return cleaned.substring(start, end + 1);
}
