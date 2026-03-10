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

/**
 * Perform a sound search using the preferred platform API with a resilient fallback to the legacy HTTP implementation.
 *
 * @param query - Free-text search query for sounds
 * @param options - Optional settings and search filters
 * @param options.retryCount - Number of retry attempts for the legacy HTTP path (default: 3)
 * @param options.fallbackToOld - Whether to fall back to the legacy HTTP implementation on IPC failure (default: true)
 * @param options.type - Filter by sound type: `"effects"` or `"songs"`
 * @param options.page - Result page number for pagination
 * @param options.page_size - Number of results per page
 * @param options.sort - Sort criteria: `"downloads"`, `"rating"`, `"created"`, or `"score"`
 * @param options.min_rating - Minimum rating threshold to include results
 * @param options.commercial_only - If true, include only sounds marked for commercial use
 * @returns The search result object; contains `success` and either result data on success or an `error` payload on failure
 */
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

/**
 * Transcribes an audio file, using the legacy HTTP-based transcribe implementation unless the Electron feature is enabled.
 *
 * When the feature flag `USE_ELECTRON_API` is enabled this function throws a deprecation error indicating the platform transcription API must be used instead.
 *
 * @param requestData - Object describing the file to transcribe:
 *   - filename: path or identifier of the audio file
 *   - language: optional ISO language code for the transcription
 *   - decryptionKey: optional key to decrypt the file before transcription
 *   - iv: optional initialization vector for decryption
 * @param options - Optional settings:
 *   - retryCount: maximum number of attempts for the legacy HTTP call (default: 3)
 *   - fallbackToOld: reserved for parity with other APIs; not used here
 * @returns The transcription result object on success, or an object of the form `{ success: false, error: string }` if all retry attempts fail.
 * @throws Error when the `USE_ELECTRON_API` feature flag is enabled (legacy transcribe API is deprecated).
 */
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
