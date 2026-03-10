/**
 * HeyGen Translate (Speed Mode) Validators
 *
 * Validates inputs for video translation with lip-sync.
 * API: fal-ai/heygen/v2/translate/speed
 */

export const HEYGEN_TRANSLATE_LANGUAGES = [
	"English",
	"Spanish",
	"French",
	"Hindi",
	"Italian",
	"German",
	"Polish",
	"Portuguese",
	"Chinese",
	"Japanese",
	"Dutch",
	"Turkish",
	"Korean",
	"Danish",
	"Arabic",
	"Romanian",
	"Mandarin",
	"Filipino",
	"Swedish",
	"Indonesian",
	"Ukrainian",
	"Greek",
	"Czech",
	"Bulgarian",
	"Malay",
	"Slovak",
	"Croatian",
	"Tamil",
	"Finnish",
	"Russian",
] as const;

export type HeyGenTranslateLanguage =
	(typeof HEYGEN_TRANSLATE_LANGUAGES)[number];

/**
 * Validate video URL for translation.
 * Must be a non-empty HTTP(S) URL.
 */
export function validateTranslateVideoUrl(url: string): void {
	if (!url || !url.trim()) {
		throw new Error("Video URL is required for translation");
	}
	if (!url.startsWith("http://") && !url.startsWith("https://")) {
		throw new Error(
			"Video URL must be a valid HTTP or HTTPS URL. Blob and data URLs are not supported."
		);
	}
}

/**
 * Validate target language against supported list.
 */
export function validateTranslateLanguage(language: string): void {
	if (!language || !language.trim()) {
		throw new Error("Target language is required for translation");
	}
	const supported = HEYGEN_TRANSLATE_LANGUAGES as readonly string[];
	if (!supported.includes(language)) {
		throw new Error(
			`Unsupported language: "${language}". Supported: ${HEYGEN_TRANSLATE_LANGUAGES.join(", ")}`
		);
	}
}

/**
 * Validate speaker count if provided.
 * Must be a positive integer.
 */
export function validateTranslateSpeakerNum(num: number | undefined): void {
	if (num === undefined) return;
	if (!Number.isInteger(num) || num < 1) {
		throw new Error("Speaker count must be a positive integer");
	}
}

/**
 * Validate all translate inputs at once.
 */
export function validateTranslateInputs(params: {
	video_url: string;
	output_language: string;
	speaker_num?: number;
}): void {
	validateTranslateVideoUrl(params.video_url);
	validateTranslateLanguage(params.output_language);
	validateTranslateSpeakerNum(params.speaker_num);
}
