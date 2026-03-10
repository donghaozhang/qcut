/**
 * Gemini API Configuration Utilities
 *
 * Provides configuration validation for Google Gemini 2.5 Pro transcription.
 * Replaces legacy Modal Whisper + R2 configuration utilities.
 */

import { platform } from "@qcut/platform-core";

interface ConfigurationStatus {
	configured: boolean;
	missingVars: string[];
}

/**
 * Check whether the current platform supports transcription.
 * Returns `false` safely when running outside a browser or before `initPlatform()`.
 */
function hasTranscriptionSupport(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return !!platform().transcription;
	} catch {
		return false;
	}
}

/**
 * Determines whether the Gemini API is properly configured for the current environment.
 *
 * Returns an object describing overall configuration status and any missing configuration indicators.
 *
 * @returns `configured` is `true` if all required environment indicators are present, `false` otherwise; `missingVars` lists the names of any missing configuration indicators.
 */
export function isGeminiConfigured(): ConfigurationStatus {
	const missingVars: string[] = [];

	if (!hasTranscriptionSupport()) {
		missingVars.push("Transcription support not available");
	}

	const configured = missingVars.length === 0;

	return {
		configured,
		missingVars,
	};
}

/**
 * Get Gemini API setup instructions URL
 */
export function getGeminiSetupUrl(): string {
	return "https://aistudio.google.com/app/apikey";
}

/**
 * Get human-readable setup instructions for Gemini API
 */
export function getGeminiSetupInstructions(): string {
	return `To use AI transcription with Gemini:
1. Get your API key from: ${getGeminiSetupUrl()}
2. Add GEMINI_API_KEY to your .env file in the electron/ directory
3. Restart the application`;
}

/**
 * Ensure the current runtime environment is compatible with Gemini transcription.
 *
 * @throws Error if transcription support is not available on the current platform.
 */
export function validateGeminiEnvironment(): void {
	if (!hasTranscriptionSupport()) {
		throw new Error(
			"Gemini transcription requires a platform with transcription support"
		);
	}
}

/**
 * Supported audio formats for Gemini API
 */
export const GEMINI_SUPPORTED_FORMATS = [
	"audio/wav",
	"audio/mp3",
	"audio/aiff",
	"audio/aac",
	"audio/ogg",
	"audio/flac",
] as const;

/**
 * Check if audio format is supported by Gemini
 */
export function isGeminiSupportedFormat(mimeType: string): boolean {
	return GEMINI_SUPPORTED_FORMATS.includes(mimeType as any);
}

/**
 * Get file extension from MIME type
 */
export function getFileExtensionFromMimeType(mimeType: string): string {
	const mimeToExtension: Record<string, string> = {
		"audio/wav": "wav",
		"audio/mp3": "mp3",
		"audio/mpeg": "mp3",
		"audio/aiff": "aiff",
		"audio/aac": "aac",
		"audio/ogg": "ogg",
		"audio/flac": "flac",
		"audio/webm": "webm",
		"audio/mp4": "m4a",
		"audio/x-m4a": "m4a",
	};

	return mimeToExtension[mimeType] || "wav";
}
