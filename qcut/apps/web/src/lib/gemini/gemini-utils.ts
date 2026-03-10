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
 * Determines whether the Gemini API is properly configured for the current environment.
 *
 * Returns an object describing overall configuration status and any missing configuration indicators.
 *
 * @returns `configured` is `true` if all required environment indicators are present, `false` otherwise; `missingVars` lists the names of any missing configuration indicators.
 */
export function isGeminiConfigured(): ConfigurationStatus {
	const missingVars: string[] = [];

	// Check for Gemini API key in Electron environment
	// Note: The API key is stored in the main process, not accessible from renderer
	// This check validates that the Electron API is available
	if (typeof window === "undefined" || !platform().transcription) {
		missingVars.push("Electron IPC not available");
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
 * @throws Error if not running in a browser environment (`"Gemini transcription requires browser environment"`).
 * @throws Error if Electron transcription support is unavailable (`"Gemini transcription requires Electron environment"`).
 */
export function validateGeminiEnvironment(): void {
	if (typeof window === "undefined") {
		throw new Error("Gemini transcription requires browser environment");
	}

	if (!platform().transcription) {
		throw new Error("Gemini transcription requires Electron environment");
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
