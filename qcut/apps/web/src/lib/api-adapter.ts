import { platform } from "@qcut/platform-core";
import { isFeatureEnabled } from "./feature-flags";
import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "./debug/error-handler";

// Helper function for legacy sound search with retry logic
async function legacySoundSearch(
	query: string,
	searchParams: {
		type?: "effects" | "songs";
		page?: number;
		page_size?: number;
		sort?: "downloads" | "rating" | "created" | "score";
		min_rating?: number;
		commercial_only?: boolean;
	},
	retryCount: number
) {
	const urlParams = new URLSearchParams();
	if (query) urlParams.set("q", query);
	if (searchParams.type) urlParams.set("type", searchParams.type);
	if (searchParams.page != null)
		urlParams.set("page", String(searchParams.page));
	if (searchParams.page_size != null)
		urlParams.set("page_size", String(searchParams.page_size));
	if (searchParams.sort) urlParams.set("sort", searchParams.sort);
	if (searchParams.min_rating != null)
		urlParams.set("min_rating", String(searchParams.min_rating));
	if (searchParams.commercial_only !== undefined)
		urlParams.set("commercial_only", String(searchParams.commercial_only));

	for (let i = 0; i < retryCount; i++) {
		try {
			const res = await fetch(`/api/sounds/search?${urlParams.toString()}`);
			if (res.ok) return await res.json();

			// If response is not ok, treat as error for retry logic
			const errorMsg = `HTTP ${res.status}: ${res.statusText}`;
			handleError(new Error(errorMsg), {
				operation: `Sound Search (Attempt ${i + 1})`,
				category: ErrorCategory.NETWORK,
				severity: ErrorSeverity.LOW,
				showToast: false,
				metadata: {
					query,
					attempt: i + 1,
					maxAttempts: retryCount,
					status: res.status,
				},
			});
		} catch (fetchError) {
			handleError(fetchError, {
				operation: `Sound Search (Attempt ${i + 1})`,
				category: ErrorCategory.NETWORK,
				severity: ErrorSeverity.LOW,
				showToast: false,
				metadata: {
					query,
					attempt: i + 1,
					maxAttempts: retryCount,
				},
			});
		}

		// Add delay between retries (except after last attempt)
		if (i < retryCount - 1) {
			await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // exponential backoff
		}
	}
	return { success: false, error: "API call failed after retries" };
}

// Helper function for legacy transcribe with retry logic
async function legacyTranscribe(
	requestData: {
		filename: string;
		language?: string;
		decryptionKey?: string;
		iv?: string;
	},
	retryCount: number
) {
	for (let i = 0; i < retryCount; i++) {
		try {
			const res = await fetch("/api/transcribe", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestData),
			});
			if (res.ok) return await res.json();
		} catch (fetchError) {
			handleError(fetchError, {
				operation: `Transcription Upload (Attempt ${i + 1})`,
				category: ErrorCategory.NETWORK,
				severity: ErrorSeverity.MEDIUM,
				showToast: false,
				metadata: {
					attempt: i + 1,
					maxAttempts: retryCount,
					language: requestData.language,
				},
			});
		}
		if (i < retryCount - 1) {
			await new Promise((r) => setTimeout(r, 1000 * (i + 1))); // exponential backoff
		}
	}
	return { success: false, error: "API call failed after retries" };
}

export async function searchSounds(
	query: string,
	options: {
		retryCount?: number;
		fallbackToOld?: boolean;
		type?: "effects" | "songs";
		page?: number;
		page_size?: number;
		sort?: "downloads" | "rating" | "created" | "score";
		min_rating?: number;
		commercial_only?: boolean;
	} = {}
) {
	const { retryCount = 3, fallbackToOld = true, ...searchParams } = options;

	if (isFeatureEnabled("USE_ELECTRON_API")) {
		try {
			// New Electron IPC implementation
			const result = await platform().sounds.search({
				q: query,
				...searchParams,
			});

			if (result?.success) {
				return result;
			}
			if (!fallbackToOld) {
				return result;
			}
			throw new Error(result?.error || "IPC failed, attempting fallback");
		} catch (error) {
			handleError(error, {
				operation: "Electron API Sound Search",
				category: ErrorCategory.NETWORK,
				severity: ErrorSeverity.LOW,
				showToast: false,
				metadata: {
					query,
				},
			});
			if (fallbackToOld) {
				return legacySoundSearch(query, searchParams, retryCount);
			}
			throw error;
		}
	}

	// Original path now also has consistent retry logic
	return legacySoundSearch(query, searchParams, retryCount);
}

export async function transcribeAudio(
	requestData: {
		filename: string;
		language?: string;
		decryptionKey?: string;
		iv?: string;
	},
	options: {
		retryCount?: number;
		fallbackToOld?: boolean;
	} = {}
) {
	const { retryCount = 3, fallbackToOld = true } = options;

	if (isFeatureEnabled("USE_ELECTRON_API")) {
		// DEPRECATED: This code path is no longer used after Gemini migration
		// Transcription now happens directly via platform().transcription.transcribe()
		// in captions.tsx (see Phase 2 implementation)
		throw new Error(
			"Legacy transcribe API deprecated. Use platform().transcription.transcribe() directly."
		);
	}

	// Original path now also has consistent retry logic
	return legacyTranscribe(requestData, retryCount);
}
