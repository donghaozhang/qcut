/**
 * Detect the dominant language of input text and return a prompt instruction
 * telling the LLM to respond in that same language.
 *
 * Uses a simple heuristic: count CJK characters vs total non-whitespace.
 * Returns an empty string for English (the default), so existing behavior
 * is unchanged for English-language inputs.
 */

// CJK Unified Ideographs + common CJK ranges
const CJK_REGEX =
	/[\u2E80-\u2FFF\u3000-\u303F\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]/g;

const JAPANESE_KANA = /[\u3040-\u309F\u30A0-\u30FF]/g;
const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF]/g;

export function detectLanguage(text: string): string {
	const sample = text.slice(0, 2000);
	const nonSpace = sample.replace(/\s/g, "");
	if (nonSpace.length === 0) return "en";

	const cjkCount = (sample.match(CJK_REGEX) || []).length;
	const kanaCount = (sample.match(JAPANESE_KANA) || []).length;
	const koreanCount = (sample.match(KOREAN_REGEX) || []).length;

	const cjkRatio = cjkCount / nonSpace.length;

	if (koreanCount > cjkCount * 0.3 && cjkRatio > 0.1) return "ko";
	if (kanaCount > cjkCount * 0.3 && cjkRatio > 0.1) return "ja";
	if (cjkRatio > 0.1) return "zh";

	return "en";
}

const LANG_NAMES: Record<string, string> = {
	zh: "Chinese (中文)",
	ja: "Japanese (日本語)",
	ko: "Korean (한국어)",
};

/**
 * Returns a prompt instruction line for the detected language.
 * Returns empty string for English (no extra instruction needed).
 */
export function detectLanguageInstruction(text: string): string {
	const lang = detectLanguage(text);
	const name = LANG_NAMES[lang];
	if (!name) return "";
	return `IMPORTANT: The input is in ${name}. You MUST write ALL output fields (title, logline, descriptions, etc.) in ${name}. Do not translate to English. EXCEPTION: portrait_prompt must ALWAYS be written in English for image model compatibility.`;
}
