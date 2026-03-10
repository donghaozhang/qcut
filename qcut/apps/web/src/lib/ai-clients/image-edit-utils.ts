/**
 * Shared utilities for Image Edit API Client
 * Extracted from image-edit-client.ts for modularity
 */

import { platform } from "@qcut/platform-core";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "../debug/error-handler";

export const FAL_API_BASE = "https://fal.run";

// Cache for the Electron-stored API key
let cachedFalApiKey: string | null = null;
let apiKeyFetchPromise: Promise<string | null> | null = null;

/**
 * Retrieve the FAL API key, checking environment, then session cache, then Electron storage.
 *
 * The first available source is returned and a found key is cached for the session to avoid repeated lookups.
 *
 * @returns The FAL API key as a string if found, `null` otherwise.
 */
export async function getFalApiKey(): Promise<string | null> {
	// First try environment variable (instant)
	const envKey = import.meta.env.VITE_FAL_API_KEY;
	if (envKey) {
		return envKey;
	}

	// Return cached key if available
	if (cachedFalApiKey) {
		return cachedFalApiKey;
	}

	// Check Electron storage (async)
	const electronApiKeys = platform().apiKeys;
	if (electronApiKeys) {
		// Deduplicate concurrent calls
		if (!apiKeyFetchPromise) {
			apiKeyFetchPromise = (async () => {
				try {
					const keys = await electronApiKeys.get();
					if (keys?.falApiKey) {
						cachedFalApiKey = keys.falApiKey;
						return keys.falApiKey;
					}
				} catch (error) {
					handleError(error, {
						operation: "Load FAL API key from Electron storage",
						category: ErrorCategory.AI_SERVICE,
						severity: ErrorSeverity.LOW,
						showToast: false, // Silent failure - don't interrupt user
						metadata: { source: "image-edit-utils" },
					});
				}
				return null;
			})();
		}

		const key = await apiKeyFetchPromise;
		apiKeyFetchPromise = null;
		if (key) {
			return key;
		}
	}

	return null;
}

/**
 * Generates a unique job ID for tracking image operations.
 * @param prefix - Type of operation ("edit" or "upscale"), defaults to "edit"
 * @returns Unique job ID string in format: {prefix}_{random}_{timestamp}
 */
export function generateJobId(prefix: "edit" | "upscale" = "edit"): string {
	return (
		`${prefix}_` + Math.random().toString(36).substr(2, 9) + "_" + Date.now()
	);
}
